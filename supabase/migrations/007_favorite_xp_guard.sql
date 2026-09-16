-- ============================================================================
-- 007_favorite_xp_guard.sql
--
-- Закрывает абуз опыта через избранное.
--
-- ПРОБЛЕМА
-- -------
-- За каждое добавление трека в избранное начислялось +2 XP. Снятие лайка опыт
-- не отнимало, поэтому работала простая схема: лайк → снятие → лайк → снятие.
-- Каждый цикл давал +2 XP, и так бесконечно.
--
-- ПРИЧИНА
-- -------
-- Клиент начислял опыт и записывал в profiles.xp ГОТОВОЕ число. Сервер не
-- проверял, за что именно начислено: он видел лишь итоговое значение, которое
-- клиент ему прислал. Единственным ограничением был дневной лимит
-- (FAVORITE_XP_DAILY_CAP), но он ограничивал скорость, а не количество:
-- 10 XP в день набирались пятью кликами по одному треку.
--
-- РЕШЕНИЕ
-- -------
-- Серверная функция add_favorite(), которая:
--   * проверяет, что трек ещё не в избранном (иначе это не новое добавление);
--   * проверяет, что за ЭТОТ трек опыт ещё не начислялся (никак и никогда);
--   * соблюдает дневной лимит;
--   * начисляет XP атомарно и возвращает фактическую сумму.
--
-- Таблица reward_log хранит, за что опыт уже выдан. Это делает начисление
-- идемпотентным: повторный вызов для того же трека вернёт 0.
--
-- Идемпотентно: повторный запуск безопасен.
-- ============================================================================

-- ── Журнал начислений ────────────────────────────────────────────────────
--
-- Универсальный: сейчас используется для избранного, но подходит и для любых
-- других разовых наград. Ключ (user_id, reason, ref_id) гарантирует, что за
-- один и тот же объект опыт не начислится дважды.

CREATE TABLE IF NOT EXISTS public.reward_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  /** За что начислено: 'favorite_add', в будущем — другие разовые награды. */
  reason      TEXT NOT NULL,
  /** Идентификатор объекта награды: для лайка — track_id. */
  ref_id      TEXT NOT NULL,
  /** Сколько XP начислено за это событие. */
  awarded_xp  INTEGER NOT NULL CHECK (awarded_xp >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Главная защита: один объект — одна награда на пользователя.
CREATE UNIQUE INDEX IF NOT EXISTS reward_log_unique_idx
  ON public.reward_log (user_id, reason, ref_id);

CREATE INDEX IF NOT EXISTS reward_log_user_created_idx
  ON public.reward_log (user_id, created_at DESC);

COMMENT ON TABLE public.reward_log IS
  'Журнал выданных наград. UNIQUE(user_id, reason, ref_id) не даёт начислить '
  'опыт дважды за один и тот же объект.';

ALTER TABLE public.reward_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own rewards" ON public.reward_log;
CREATE POLICY "Users can read own rewards"
  ON public.reward_log FOR SELECT
  USING (auth.uid() = user_id);

-- Записывает только серверная функция (SECURITY DEFINER), поэтому политик
-- на INSERT/UPDATE/DELETE нет: напрямую из клиента вставить награду нельзя.

-- ── Начисление XP за избранное ───────────────────────────────────────────
--
-- Вызывается клиентом при добавлении трека в избранное. Возвращает, сколько
-- опыта реально начислено (0 — если уже начисляли или достигнут дневной лимит).
--
-- Поля трека передаются отдельными аргументами, а не объектом: таблица
-- favorites хранит их плоскими колонками, и так запрос остаётся типобезопасным.

CREATE OR REPLACE FUNCTION public.add_favorite(
  p_track_id   TEXT,
  p_title      TEXT DEFAULT NULL,
  p_artist     TEXT DEFAULT NULL,
  p_duration   TEXT DEFAULT NULL,
  p_cover_url  TEXT DEFAULT NULL,
  p_stream_url TEXT DEFAULT NULL,
  p_source     TEXT DEFAULT NULL,
  p_daily_cap        INTEGER DEFAULT 10,
  p_xp_per_favorite  INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_today       DATE := (timezone('utc'::text, now()))::date;
  v_already     BOOLEAN;
  v_daily_count INTEGER;
  v_new_xp      INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'add_favorite: требуется авторизация'
      USING ERRCODE = '28000';
  END IF;

  IF p_track_id IS NULL OR length(trim(p_track_id)) = 0 THEN
    RAISE EXCEPTION 'add_favorite: не указан идентификатор трека'
      USING ERRCODE = '22023';
  END IF;

  -- Трек уже в избранном — это не новое добавление, награды не полагается.
  SELECT EXISTS (
    SELECT 1 FROM public.favorites
     WHERE user_id = v_user_id AND track_id = p_track_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'already_favorite',
      'awarded_xp', 0
    );
  END IF;

  /*
   * Награду пытаемся записать ПЕРВОЙ.
   *
   * Порядок принципиален: уникальный индекс (user_id, reason, ref_id) —
   * единственная защита, которую нельзя обойти гонкой. Если за этот трек уже
   * платили (даже месяц назад), вставка не пройдёт, и мы выходим, ничего
   * не начислив. Проверять «платили ли» отдельным SELECT нельзя: два
   * одновременных запроса оба увидели бы пусто и оба начислили.
   */
  INSERT INTO public.reward_log (user_id, reason, ref_id, awarded_xp)
  VALUES (v_user_id, 'favorite_add', p_track_id, p_xp_per_favorite)
  ON CONFLICT (user_id, reason, ref_id) DO NOTHING;

  IF NOT FOUND THEN
    -- Уже награждали за этот трек. Лайк всё равно сохраняем: человек вправе
    -- добавить трек в избранное повторно, просто без опыта.
    INSERT INTO public.favorites (
      user_id, track_id, title, artist, duration, cover_url, stream_url, source
    )
    VALUES (
      v_user_id, p_track_id, p_title, p_artist, p_duration,
      p_cover_url, p_stream_url, p_source
    )
    ON CONFLICT (user_id, track_id) DO UPDATE
      SET title = COALESCE(EXCLUDED.title, public.favorites.title),
          artist = COALESCE(EXCLUDED.artist, public.favorites.artist),
          duration = COALESCE(EXCLUDED.duration, public.favorites.duration),
          cover_url = COALESCE(EXCLUDED.cover_url, public.favorites.cover_url),
          stream_url = COALESCE(EXCLUDED.stream_url, public.favorites.stream_url),
          source = COALESCE(EXCLUDED.source, public.favorites.source);

    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'already_rewarded',
      'awarded_xp', 0
    );
  END IF;

  -- Добавляем в избранное. onConflict — на случай гонки с другим устройством.
  INSERT INTO public.favorites (
    user_id, track_id, title, artist, duration, cover_url, stream_url, source
  )
  VALUES (
    v_user_id, p_track_id, p_title, p_artist, p_duration,
    p_cover_url, p_stream_url, p_source
  )
  ON CONFLICT (user_id, track_id) DO UPDATE
    SET title = COALESCE(EXCLUDED.title, public.favorites.title),
        artist = COALESCE(EXCLUDED.artist, public.favorites.artist),
        duration = COALESCE(EXCLUDED.duration, public.favorites.duration),
        cover_url = COALESCE(EXCLUDED.cover_url, public.favorites.cover_url),
        stream_url = COALESCE(EXCLUDED.stream_url, public.favorites.stream_url),
        source = COALESCE(EXCLUDED.source, public.favorites.source);

  -- Дневной лимит: считаем награды за сегодня (включая только что записанную).
  SELECT COUNT(*) INTO v_daily_count
    FROM public.reward_log
   WHERE user_id = v_user_id
     AND reason = 'favorite_add'
     AND created_at >= v_today::timestamptz;

  IF v_daily_count > p_daily_cap THEN
    /*
     * Лимит исчерпан: XP не начисляем, но награду за трек НЕ откатываем —
     * иначе при следующей попытке (после сброса лимита) можно было бы
     * получить опыт за тот же трек.
     */
    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'daily_cap',
      'awarded_xp', 0
    );
  END IF;

  UPDATE public.profiles
     SET xp = COALESCE(xp, 0) + p_xp_per_favorite,
         daily_favorites_added = CASE
           WHEN daily_date = v_today THEN COALESCE(daily_favorites_added, 0) + 1
           ELSE 1
         END,
         daily_date = v_today
   WHERE id = v_user_id
  RETURNING xp INTO v_new_xp;

  RETURN jsonb_build_object(
    'granted', true,
    'reason', 'ok',
    'awarded_xp', p_xp_per_favorite,
    'total_xp', COALESCE(v_new_xp, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.add_favorite(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) IS
  'Добавляет трек в избранное и начисляет XP один раз за трек. '
  'Повторное добавление того же трека награду не даёт.';

-- ── Снятие лайка ─────────────────────────────────────────────────────────
--
-- XP не отнимаем (это было бы наказанием за передумал), но и запись из
-- reward_log НЕ удаляем: иначе снятие лайка открывало бы возможность получить
-- награду заново и абуз вернулся бы.

CREATE OR REPLACE FUNCTION public.remove_favorite(p_track_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'remove_favorite: требуется авторизация'
      USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.favorites
   WHERE user_id = v_user_id AND track_id = p_track_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.remove_favorite(TEXT) IS
  'Убирает трек из избранного. Награда за него остаётся в reward_log — '
  'повторно получить XP за тот же трек нельзя.';

REVOKE ALL ON FUNCTION public.add_favorite(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_favorite(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.add_favorite(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_favorite(TEXT) TO authenticated;

-- ── Разовая зачистка журнала ─────────────────────────────────────────────
--
-- Проставляем награды за уже существующее избранное, чтобы старые лайки
-- нельзя было «переиграть» и получить за них XP задним числом.
-- XP при этом НЕ начисляется: записи создаются с awarded_xp = 0.

INSERT INTO public.reward_log (user_id, reason, ref_id, awarded_xp)
SELECT f.user_id, 'favorite_add', f.track_id, 0
  FROM public.favorites f
ON CONFLICT (user_id, reason, ref_id) DO NOTHING;

-- ── Проверка ─────────────────────────────────────────────────────────────
--
-- Первый вызов начислит 2 XP, второй вернёт already_rewarded и 0:
--
--   SELECT public.add_favorite('track-123');
--   SELECT public.remove_favorite('track-123');
--   SELECT public.add_favorite('track-123');   -- granted = false
--
-- Убедиться, что опыт не растёт:
--
--   SELECT xp FROM public.profiles WHERE id = auth.uid();
--
-- Посмотреть выданные награды:
--
--   SELECT reason, ref_id, awarded_xp, created_at
--     FROM public.reward_log
--    WHERE user_id = auth.uid()
--    ORDER BY created_at DESC
--    LIMIT 20;
