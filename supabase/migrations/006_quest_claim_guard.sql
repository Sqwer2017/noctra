-- ============================================================================
-- 006_quest_claim_guard.sql
--
-- Закрывает абуз с ежедневными заданиями.
--
-- ПРОБЛЕМА
-- -------
-- Награду за задание можно было забирать повторно: забрал → перезагрузил
-- страницу → кнопка «Забрать» снова активна → XP начисляется ещё раз.
-- Повторяя это, можно было бесконечно накручивать опыт.
--
-- ПРИЧИНА
-- -------
-- Флаг «награда забрана» хранился только в localStorage (daily.quests[id].claimed).
-- В базе столбец claimed_at заполнялся, но:
--   1. ничто не мешало записать его повторно с новым временем;
--   2. клиент при гидратации читал claimed_at, однако запись награды уходила
--      асинхронно (syncWrite), и перезагрузка могла случиться РАНЬШЕ, чем
--      запрос дошёл до базы. Тогда в облаке строки с claimed_at не было вовсе,
--      и следующий заход честно показывал задание как незабранное.
--   3. XP за награду начислялся на клиенте и записывался в profiles.xp как
--      готовое число — то есть повторное начисление никем не проверялось.
--
-- РЕШЕНИЕ
-- -------
-- Переносим решение о награде в базу. Функция claim_quest():
--   * блокирует строку (FOR UPDATE) — параллельные вызовы не проходят;
--   * проверяет, что награда ещё не забрана (claimed_at IS NULL);
--   * проверяет, что цель действительно достигнута;
--   * начисляет XP в profiles.xp АТОМАРНО и только один раз;
--   * возвращает, сколько XP начислено (0 — если награда уже была).
--
-- Клиент больше не решает, начислять ли опыт: он лишь просит базу выдать
-- награду и берёт из ответа фактическую сумму. Подделать через DevTools это
-- не даёт — проверка целиком на стороне БД.
--
-- Идемпотентно: повторный запуск безопасен.
-- ============================================================================

-- ── Цели и награды заданий на стороне БД ─────────────────────────────────
--
-- Дублируют клиентский конфиг QUESTS. Держим их здесь, потому что именно
-- база теперь проверяет выполнение условия: доверять присланному клиентом
-- «target» нельзя — его легко подменить запросом.

CREATE TABLE IF NOT EXISTS public.quest_catalog (
  id            TEXT PRIMARY KEY,
  target        INTEGER NOT NULL CHECK (target > 0),
  reward_xp     INTEGER NOT NULL CHECK (reward_xp > 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.quest_catalog IS
  'Цели и награды ежедневных заданий. Источник правды для начисления XP.';

INSERT INTO public.quest_catalog (id, target, reward_xp) VALUES
  ('immersion',     30, 10),
  ('collector',      3,  5),
  ('nightMarathon', 10,  8)
ON CONFLICT (id) DO UPDATE
  SET target = EXCLUDED.target,
      reward_xp = EXCLUDED.reward_xp,
      updated_at = timezone('utc'::text, now());

-- Каталог читают все авторизованные, меняет только сервисная роль.
ALTER TABLE public.quest_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read quest catalog" ON public.quest_catalog;
CREATE POLICY "Anyone can read quest catalog"
  ON public.quest_catalog FOR SELECT
  TO authenticated
  USING (true);

-- ── Защита от повторного сбора награды ───────────────────────────────────
--
-- Столбец claimed_at уже есть в daily_quests_progress. Добавляем только
-- индекс под быструю проверку «забрано ли сегодня» и гарантию уникальности
-- строки на (пользователь, задание, дата) — на неё опирается ON CONFLICT
-- в клиентских записях прогресса.

CREATE UNIQUE INDEX IF NOT EXISTS daily_quests_progress_unique_idx
  ON public.daily_quests_progress (user_id, quest_id, reset_date);

-- ── Функция выдачи награды ───────────────────────────────────────────────
--
-- SECURITY DEFINER: функция должна уметь писать в profiles.xp, а также
-- создавать строку прогресса, если её ещё нет. Выполняется от владельца схемы,
-- но ВСЕГДА проверяет, что действует от имени текущего пользователя —
-- иначе через неё можно было бы начислять XP кому угодно.

CREATE OR REPLACE FUNCTION public.claim_quest(
  p_quest_id TEXT,
  p_reset_date DATE DEFAULT (timezone('utc'::text, now()))::date
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_target      INTEGER;
  v_reward      INTEGER;
  v_progress    INTEGER := 0;
  v_claimed_at  TIMESTAMPTZ;
  v_new_xp      INTEGER;
  v_row_id      UUID;
BEGIN
  -- Вызов без сессии невозможен: начислять XP анонимно нельзя.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'claim_quest: требуется авторизация'
      USING ERRCODE = '28000';
  END IF;

  -- Награды и цели берём из каталога, а не из аргументов.
  SELECT target, reward_xp INTO v_target, v_reward
    FROM public.quest_catalog
   WHERE id = p_quest_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim_quest: неизвестное задание %', p_quest_id
      USING ERRCODE = '22023';
  END IF;

  /*
   * Блокируем строку прогресса до конца транзакции.
   *
   * Это ключ ко всей защите: два одновременных запроса (двойной клик,
   * две вкладки) выстроятся в очередь, и второй увидит уже проставленный
   * claimed_at. Без блокировки оба успели бы прочитать NULL и начислить XP.
   */
  SELECT id, current_progress, claimed_at
    INTO v_row_id, v_progress, v_claimed_at
    FROM public.daily_quests_progress
   WHERE user_id = v_user_id
     AND quest_id = p_quest_id
     AND reset_date = p_reset_date
   FOR UPDATE;

  -- Строки может не быть: прогресс ещё не успел записаться в базу.
  -- Это НЕ повод начислить награду — считаем прогресс нулевым.
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'no_progress',
      'awarded_xp', 0
    );
  END IF;

  -- Награда уже забрана сегодня.
  IF v_claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'already_claimed',
      'awarded_xp', 0,
      'claimed_at', v_claimed_at
    );
  END IF;

  -- Цель не достигнута.
  IF v_progress < v_target THEN
    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'not_completed',
      'awarded_xp', 0,
      'progress', v_progress,
      'target', v_target
    );
  END IF;

  -- Всё сходится: фиксируем сбор и начисляем опыт одной транзакцией.
  UPDATE public.daily_quests_progress
     SET claimed_at = timezone('utc'::text, now()),
         is_completed = true,
         target_progress = v_target
   WHERE id = v_row_id;

  UPDATE public.profiles
     SET xp = COALESCE(xp, 0) + v_reward
   WHERE id = v_user_id
  RETURNING xp INTO v_new_xp;

  RETURN jsonb_build_object(
    'granted', true,
    'reason', 'ok',
    'awarded_xp', v_reward,
    'total_xp', COALESCE(v_new_xp, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.claim_quest(TEXT, DATE) IS
  'Выдаёт награду за выполненное ежедневное задание ровно один раз в сутки. '
  'Проверяет цель и факт предыдущего сбора на стороне БД, XP начисляет атомарно.';

-- ── Пересчёт прогресса задач ─────────────────────────────────────────────
--
-- Клиент пишет current_progress, но НЕ должен иметь возможности отметить
-- задание выполненным в обход условия: is_completed вычисляется здесь,
-- из фактического прогресса и цели из каталога.

CREATE OR REPLACE FUNCTION public.sync_quest_progress(
  p_quest_id    TEXT,
  p_reset_date  DATE,
  p_progress    INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_target   INTEGER;
  v_progress INTEGER := GREATEST(COALESCE(p_progress, 0), 0);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'sync_quest_progress: требуется авторизация'
      USING ERRCODE = '28000';
  END IF;

  SELECT target INTO v_target
    FROM public.quest_catalog
   WHERE id = p_quest_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sync_quest_progress: неизвестное задание %', p_quest_id
      USING ERRCODE = '22023';
  END IF;

  /*
   * Прогресс только растёт в пределах дня, и claimed_at никогда не сбрасывается.
   *
   * GREATEST по current_progress защищает от отката (например, если клиент
   * прислал устаревшее значение), а COALESCE(claimed_at, ...) сохраняет уже
   * проставленную награду — иначе запись прогресса после сбора обнулила бы
   * флаг, и награду можно было бы забрать снова.
   */
  INSERT INTO public.daily_quests_progress (
    user_id, quest_id, reset_date,
    current_progress, target_progress, is_completed
  )
  VALUES (
    v_user_id, p_quest_id, p_reset_date,
    v_progress, v_target, v_progress >= v_target
  )
  ON CONFLICT (user_id, quest_id, reset_date) DO UPDATE
    SET current_progress = GREATEST(
          public.daily_quests_progress.current_progress,
          EXCLUDED.current_progress
        ),
        target_progress = EXCLUDED.target_progress,
        is_completed = GREATEST(
          public.daily_quests_progress.current_progress,
          EXCLUDED.current_progress
        ) >= EXCLUDED.target_progress;

  RETURN jsonb_build_object(
    'ok', true,
    'target', v_target
  );
END;
$$;

COMMENT ON FUNCTION public.sync_quest_progress(TEXT, DATE, INTEGER) IS
  'Записывает прогресс задания; is_completed вычисляет сама из цели каталога. '
  'Прогресс не откатывается, claimed_at не сбрасывается.';

-- ── Права на вызов ───────────────────────────────────────────────────────
--
-- Отзываем у public и выдаём только авторизованным: иначе функции были бы
-- доступны по anon-ключу.

REVOKE ALL ON FUNCTION public.claim_quest(TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_quest_progress(TEXT, DATE, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_quest(TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_quest_progress(TEXT, DATE, INTEGER) TO authenticated;

-- ── Проверка ─────────────────────────────────────────────────────────────
--
-- Убедиться, что защита работает:
--
--   SELECT public.claim_quest('immersion');   -- первый раз: granted = true
--   SELECT public.claim_quest('immersion');   -- второй раз: already_claimed
--
-- И что XP не задваивается:
--
--   SELECT xp FROM public.profiles WHERE id = auth.uid();
--
-- Посмотреть состояние заданий за сегодня:
--
--   SELECT quest_id, current_progress, target_progress, is_completed, claimed_at
--     FROM public.daily_quests_progress
--    WHERE user_id = auth.uid()
--    ORDER BY quest_id;
