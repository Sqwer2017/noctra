-- ═══════════════════════════════════════════════════════════════════════
--  NOCTRA — миграция 005: система достижений
-- ═══════════════════════════════════════════════════════════════════════
--
--  Что делает:
--   1. каталог достижений (`achievements`) — 20 штук;
--   2. прогресс каждого пользователя (`user_achievements`);
--   3. новые поля в `user_stats` под условия, которых раньше не было;
--   4. SQL-функция + триггеры, которые САМИ выдают достижения.
--
--  Почему проверка в базе, а не в клиенте: условие нельзя подделать через
--  DevTools, и оно одинаково работает для всех клиентов (веб, будущий моб.).
--
--  Идемпотентно: можно выполнять повторно.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Каталог достижений ─────────────────────────────────────────────
-- `hint` намеренно НЕ показывается пользователю: он должен догадываться сам.
-- Условие (`condition_kind` + `threshold`) используется триггером.
CREATE TABLE IF NOT EXISTS public.achievements (
  id             TEXT PRIMARY KEY,
  /** Порядок вывода в сетке профиля. */
  sort_order     INTEGER NOT NULL DEFAULT 0,
  /** Редкость влияет на свечение плитки в UI. */
  rarity         TEXT NOT NULL DEFAULT 'common'
                 CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  /** Файл иконки в /public/achievements/. */
  icon           TEXT NOT NULL,
  /** Тип условия — триггер выбирает проверку по этому значению. */
  condition_kind TEXT NOT NULL,
  /** Порог срабатывания. Для нечисловых условий не используется. */
  threshold      BIGINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ── 2. Прогресс пользователя ──────────────────────────────────────────
-- PRIMARY KEY (user_id, achievement_id) — у каждого СВОЙ набор достижений.
-- Чужой прогресс недоступен: RLS ниже фильтрует по auth.uid().
CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id        UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  achievement_id TEXT REFERENCES public.achievements(id) ON DELETE CASCADE NOT NULL,
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS user_achievements_user_idx
  ON public.user_achievements (user_id, unlocked_at DESC);

-- ── 3. Поля под условия, которых не хватало ───────────────────────────
-- Часть достижений требует истории, которой в схеме не было: серии дней,
-- ночные прослушивания, длина непрерывной сессии, повторы, shuffle.
ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS streak_days          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_date     DATE,
  ADD COLUMN IF NOT EXISTS night_plays          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_session_seconds  BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repeat_loops         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shuffle_streak       INTEGER NOT NULL DEFAULT 0,
  -- Накопительные счётчики для условий, где нужен не текущий размер,
  -- а факт достижения за всё время (например, «плейлист из 50 треков»).
  ADD COLUMN IF NOT EXISTS max_playlist_tracks  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_kinds         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quests_claimed_total INTEGER NOT NULL DEFAULT 0;

-- ── 4. Каталог: 20 достижений ─────────────────────────────────────────
-- Названия и описания живут в i18n клиента (ключ achievement.<id>),
-- в базе хранится только техническая часть.
INSERT INTO public.achievements (id, sort_order, rarity, icon, condition_kind, threshold) VALUES
  ('first_echo',          1, 'common',    'The First Echo.png',          'tracks_total',      1),
  ('initiated_darkness',  2, 'common',    'Initiated into Darkness.png', 'tracks_total',      100),
  ('ether_keeper',        3, 'rare',      'Guardian of the Ether.png',   'tracks_total',      500),
  ('abyss_architect',     4, 'epic',      'Architect of the Abyss.png',  'tracks_total',      1000),
  ('resonance_lord',      5, 'legendary', 'Master of Resonance.png',     'tracks_total',      5000),
  ('midnight_pilgrim',    6, 'rare',      'Midnight Pilgrim.png',        'night_plays',       1),
  ('deep_dive',           7, 'rare',      'Deep Dive.png',               'session_seconds',   10800),
  ('void_whisper',        8, 'epic',      'Whisper of the Void.png',     'album_complete',    1),
  ('obsession',           9, 'rare',      'Obsession.png',               'repeat_loops',      10),
  ('blind_fate',         10, 'epic',      'Blind Fate.png',              'shuffle_streak',    50),
  ('black_pearl',        11, 'common',    'Black Pearl.png',             'favorites_total',   1),
  ('secret_archive',     12, 'rare',      'Secret Archive.png',          'favorites_total',   100),
  ('shadow_curator',     13, 'common',    'Curator of Shadows.png',      'playlists_total',   1),
  ('grand_grimoire',     14, 'epic',      'The Grand Grimoire.png',      'playlist_tracks',   50),
  ('double_resonance',   15, 'rare',      'Double resonance.png',        'dual_source',       1),
  ('continuous_trance',  16, 'rare',      'Continuous trance.png',       'streak_days',       7),
  ('eternal_wanderer',   17, 'legendary', 'Eternal Wanderer.png',        'streak_days',       30),
  ('self_awareness',     18, 'epic',      'Self-awareness.png',          'profile_complete',  1),
  ('sound_alchemist',    19, 'epic',      'Alchemist of Sound.png',      'quests_claimed',    10),
  ('ruler_of_noctra',    20, 'legendary', 'Ruler of Noctra.png',         'max_rank',          8)
ON CONFLICT (id) DO NOTHING;

-- ── 5. RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.achievements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- Каталог читают все (это справочник, не персональные данные).
DROP POLICY IF EXISTS "Achievements are viewable by everyone" ON public.achievements;
CREATE POLICY "Achievements are viewable by everyone"
  ON public.achievements FOR SELECT USING (true);

-- Прогресс: каждый видит и меняет ТОЛЬКО свой.
DROP POLICY IF EXISTS "Users can read own achievements" ON public.user_achievements;
CREATE POLICY "Users can read own achievements"
  ON public.user_achievements FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own achievements" ON public.user_achievements;
CREATE POLICY "Users can insert own achievements"
  ON public.user_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── 6. Функция выдачи достижений ──────────────────────────────────────
-- Читает текущие показатели пользователя и вставляет те достижения,
-- условия которых выполнены. `ON CONFLICT DO NOTHING` делает вызов
-- безопасным при каждом обновлении: уже полученное не дублируется.
CREATE OR REPLACE FUNCTION public.check_achievements(p_user_id UUID)
RETURNS void AS $$
DECLARE
  s public.user_stats%ROWTYPE;
  fav_count        BIGINT;
  playlist_count   BIGINT;
  max_tracks       BIGINT;
  claimed_quests   BIGINT;
  profile_complete BOOLEAN;
  current_rank     INTEGER;
BEGIN
  SELECT * INTO s FROM public.user_stats WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO fav_count
    FROM public.favorites WHERE user_id = p_user_id;

  SELECT COUNT(*), COALESCE(MAX(cnt), 0) INTO playlist_count, max_tracks
    FROM (
      SELECT p.id, COUNT(pt.id) AS cnt
      FROM public.playlists p
      LEFT JOIN public.playlist_tracks pt ON pt.playlist_id = p.id
      WHERE p.user_id = p_user_id
      GROUP BY p.id
    ) AS per_playlist;

  SELECT COUNT(*) INTO claimed_quests
    FROM public.daily_quests_progress
    WHERE user_id = p_user_id AND claimed_at IS NOT NULL;

  -- Профиль «полностью оформлен»: ник, био, аватар и баннер заданы.
  SELECT (
    COALESCE(NULLIF(TRIM(username), ''), NULL) IS NOT NULL AND
    COALESCE(NULLIF(TRIM(bio), ''), NULL) IS NOT NULL AND
    avatar_url IS NOT NULL AND
    banner_url IS NOT NULL
  ) INTO profile_complete
  FROM public.profiles WHERE id = p_user_id;

  SELECT COALESCE(rank_tier, 0) INTO current_rank
    FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.user_achievements (user_id, achievement_id)
  SELECT p_user_id, a.id
  FROM public.achievements a
  WHERE
    (a.condition_kind = 'tracks_total'     AND s.total_tracks_played >= a.threshold)
    OR (a.condition_kind = 'night_plays'    AND s.night_plays        >= a.threshold)
    OR (a.condition_kind = 'session_seconds' AND s.max_session_seconds >= a.threshold)
    OR (a.condition_kind = 'repeat_loops'   AND s.repeat_loops       >= a.threshold)
    OR (a.condition_kind = 'shuffle_streak' AND s.shuffle_streak     >= a.threshold)
    OR (a.condition_kind = 'streak_days'    AND s.streak_days        >= a.threshold)
    OR (a.condition_kind = 'favorites_total' AND fav_count           >= a.threshold)
    OR (a.condition_kind = 'playlists_total' AND playlist_count      >= a.threshold)
    OR (a.condition_kind = 'playlist_tracks' AND GREATEST(max_tracks, s.max_playlist_tracks) >= a.threshold)
    OR (a.condition_kind = 'quests_claimed' AND GREATEST(claimed_quests, s.quests_claimed_total) >= a.threshold)
    OR (a.condition_kind = 'max_rank'       AND current_rank         >= a.threshold)
    OR (a.condition_kind = 'dual_source'    AND s.source_kinds       >= a.threshold)
    OR (a.condition_kind = 'album_complete' AND s.max_session_seconds >= 600)
    OR (a.condition_kind = 'profile_complete' AND COALESCE(profile_complete, false))
  ON CONFLICT (user_id, achievement_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 7. RPC для пересчёта из клиента ───────────────────────────────────
-- Клиент не может вызвать check_achievements напрямую: функция принимает
-- произвольный UUID, а это позволило бы пересчитывать чужие достижения.
-- Обёртка берёт id из сессии и не даёт подставить чужой.
CREATE OR REPLACE FUNCTION public.check_achievements_for_me()
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.check_achievements(auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_achievements_for_me() TO authenticated;

-- ── 8. Триггеры ───────────────────────────────────────────────────────
--
-- Выдача при обновлении статистики (основной путь: прослушивание, стрики,
-- сессии) и при изменении избранного/плейлистов/профиля.
--
-- ВНИМАНИЕ: этот раздел ИСПРАВЛЕН миграцией 009.
--
-- Изначально обработчик был один на все таблицы и брал пользователя как
-- `COALESCE(NEW.user_id, NEW.id)`. У таблицы playlist_tracks нет ни того,
-- ни другого: владелец определяется через playlists. Обращение к
-- несуществующему полю записи — ошибка времени выполнения, поэтому падало
-- ЛЮБОЕ обновление с сообщением:
--
--   record "new" has no field "user_id"
--
-- Здесь оставлены РАБОЧИЕ версии обработчиков, чтобы миграция 005 была
-- самодостаточной и её можно было применять на чистой базе без 009.

CREATE OR REPLACE FUNCTION public.safe_check_achievements(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.check_achievements(p_user_id);
EXCEPTION
  WHEN OTHERS THEN
    -- Достижения — дополнительная механика: их сбой не должен откатывать
    -- запись прогресса пользователя.
    RAISE WARNING 'check_achievements для % не выполнена: % (%)',
      p_user_id, SQLERRM, SQLSTATE;
END;
$$;

/** Обработчик для таблиц с колонкой user_id. */
CREATE OR REPLACE FUNCTION public.trg_check_achievements_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_check_achievements(NEW.user_id);
  RETURN NEW;
END;
$$;

/** Обработчик для profiles: идентификатор пользователя в колонке id. */
CREATE OR REPLACE FUNCTION public.trg_check_achievements_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_check_achievements(NEW.id);
  RETURN NEW;
END;
$$;

/** Обработчик для playlist_tracks: владелец определяется через playlists. */
CREATE OR REPLACE FUNCTION public.trg_check_achievements_playlist_tracks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- У playlist_tracks нет user_id, поэтому ищем владельца плейлиста.
  -- При удалении строки сам плейлист ещё существует, но берём OLD —
  -- для DELETE актуальна именно удаляемая запись.
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id
      FROM public.playlists WHERE id = OLD.playlist_id;
  ELSE
    SELECT user_id INTO v_user_id
      FROM public.playlists WHERE id = NEW.playlist_id;
  END IF;

  PERFORM public.safe_check_achievements(v_user_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_stats_check_achievements ON public.user_stats;
CREATE TRIGGER user_stats_check_achievements
  AFTER INSERT OR UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_achievements_user_id();

DROP TRIGGER IF EXISTS favorites_check_achievements ON public.favorites;
CREATE TRIGGER favorites_check_achievements
  AFTER INSERT OR DELETE ON public.favorites
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_achievements_user_id();

DROP TRIGGER IF EXISTS playlists_check_achievements ON public.playlists;
CREATE TRIGGER playlists_check_achievements
  AFTER INSERT OR DELETE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_achievements_user_id();

DROP TRIGGER IF EXISTS playlist_tracks_check_achievements ON public.playlist_tracks;
CREATE TRIGGER playlist_tracks_check_achievements
  AFTER INSERT OR DELETE ON public.playlist_tracks
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_achievements_playlist_tracks();

DROP TRIGGER IF EXISTS profiles_check_achievements ON public.profiles;
CREATE TRIGGER profiles_check_achievements
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_achievements_profiles();

-- ═══════════════════════════════════════════════════════════════════════
--  ПРОВЕРКА после применения:
--
--    SELECT COUNT(*) FROM public.achievements;              -- ожидаем 20
--    SELECT public.check_achievements('<uuid>');            -- выдать вручную
--    SELECT * FROM public.user_achievements WHERE user_id = '<uuid>';
-- ═══════════════════════════════════════════════════════════════════════
