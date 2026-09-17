-- ============================================================================
-- 011_youtube_video_id.sql
--
-- Сохраняет идентификатор видео YouTube в избранном и плейлистах.
--
-- ПРОБЛЕМА
-- -------
-- Треки YouTube не переживали перезагрузку страницы: добавленные в избранное
-- или плейлист, они исчезали после обновления, а те, что оставались, нельзя
-- было воспроизвести.
--
-- ПРИЧИНА
-- -------
-- В таблицах favorites и playlist_tracks не было колонки для `videoId`.
-- У YouTube-треков нет `stream_url` (прямые потоки недоступны), и способ
-- воспроизведения определяется по идентификатору видео. При записи в базу
-- он терялся, а при чтении трек приходил без него:
--   * `isYouTubeTrack` возвращал false — трек считался обычным;
--   * `canPlay` возвращал false, потому что `streamUrl` пустой;
--   * воспроизвести такой трек было нельзя.
--
-- Отдельно про удаление из избранного: `add_favorite` из миграции 007
-- вставляет строку только с теми колонками, что были в её сигнатуре,
-- поэтому там `video_id` тоже нужно добавить.
--
-- Идемпотентно: повторный запуск безопасен.
-- ============================================================================

-- ── 1. Колонка в избранном ───────────────────────────────────────────────
ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS video_id TEXT;

COMMENT ON COLUMN public.favorites.video_id IS
  'Идентификатор видео YouTube. NULL для остальных источников. '
  'Нужен для воспроизведения: прямого потока у YouTube нет, играет IFrame по этому id.';

-- ── 2. Колонка в треках плейлистов ───────────────────────────────────────
ALTER TABLE public.playlist_tracks
  ADD COLUMN IF NOT EXISTS video_id TEXT;

COMMENT ON COLUMN public.playlist_tracks.video_id IS
  'Идентификатор видео YouTube. NULL для остальных источников.';

-- ── 3. Индексы ───────────────────────────────────────────────────────────
--
-- Частичные индексы: колонка заполнена только у YouTube-треков, поэтому
-- индексировать NULL-значения смысла нет — они занимают большинство строк.
CREATE INDEX IF NOT EXISTS favorites_video_id_idx
  ON public.favorites (video_id)
  WHERE video_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS playlist_tracks_video_id_idx
  ON public.playlist_tracks (video_id)
  WHERE video_id IS NOT NULL;

-- ── 4. Обновляем add_favorite под новую колонку ──────────────────────────
--
-- Функция из миграции 007 вставляет избранное вручную, перечисляя колонки.
-- Без этой правки лайк YouTube-трека сохранялся бы без идентификатора видео,
-- и трек снова стал бы неиграбельным после перезагрузки.

CREATE OR REPLACE FUNCTION public.add_favorite(
  p_track_id   TEXT,
  p_title      TEXT DEFAULT NULL,
  p_artist     TEXT DEFAULT NULL,
  p_duration   TEXT DEFAULT NULL,
  p_cover_url  TEXT DEFAULT NULL,
  p_stream_url TEXT DEFAULT NULL,
  p_source     TEXT DEFAULT NULL,
  p_video_id   TEXT DEFAULT NULL,
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
   * Уникальный индекс (user_id, reason, ref_id) — единственная защита,
   * которую нельзя обойти гонкой двух одновременных запросов.
   */
  INSERT INTO public.reward_log (user_id, reason, ref_id, awarded_xp)
  VALUES (v_user_id, 'favorite_add', p_track_id, p_xp_per_favorite)
  ON CONFLICT (user_id, reason, ref_id) DO NOTHING;

  IF NOT FOUND THEN
    -- Уже награждали за этот трек: лайк сохраняем, опыт не начисляем.
    INSERT INTO public.favorites (
      user_id, track_id, title, artist, duration,
      cover_url, stream_url, source, video_id
    )
    VALUES (
      v_user_id, p_track_id, p_title, p_artist, p_duration,
      p_cover_url, p_stream_url, p_source, p_video_id
    )
    ON CONFLICT (user_id, track_id) DO UPDATE
      SET title = COALESCE(EXCLUDED.title, public.favorites.title),
          artist = COALESCE(EXCLUDED.artist, public.favorites.artist),
          duration = COALESCE(EXCLUDED.duration, public.favorites.duration),
          cover_url = COALESCE(EXCLUDED.cover_url, public.favorites.cover_url),
          stream_url = COALESCE(EXCLUDED.stream_url, public.favorites.stream_url),
          source = COALESCE(EXCLUDED.source, public.favorites.source),
          video_id = COALESCE(EXCLUDED.video_id, public.favorites.video_id);

    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'already_rewarded',
      'awarded_xp', 0
    );
  END IF;

  INSERT INTO public.favorites (
    user_id, track_id, title, artist, duration,
    cover_url, stream_url, source, video_id
  )
  VALUES (
    v_user_id, p_track_id, p_title, p_artist, p_duration,
    p_cover_url, p_stream_url, p_source, p_video_id
  )
  ON CONFLICT (user_id, track_id) DO UPDATE
    SET title = COALESCE(EXCLUDED.title, public.favorites.title),
        artist = COALESCE(EXCLUDED.artist, public.favorites.artist),
        duration = COALESCE(EXCLUDED.duration, public.favorites.duration),
        cover_url = COALESCE(EXCLUDED.cover_url, public.favorites.cover_url),
        stream_url = COALESCE(EXCLUDED.stream_url, public.favorites.stream_url),
        source = COALESCE(EXCLUDED.source, public.favorites.source),
        video_id = COALESCE(EXCLUDED.video_id, public.favorites.video_id);

  -- Дневной лимит: считаем награды за сегодня.
  SELECT COUNT(*) INTO v_daily_count
    FROM public.reward_log
   WHERE user_id = v_user_id
     AND reason = 'favorite_add'
     AND created_at >= v_today::timestamptz;

  IF v_daily_count > p_daily_cap THEN
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

COMMENT ON FUNCTION public.add_favorite(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
) IS
  'Добавляет трек в избранное и начисляет XP один раз за трек. '
  'Сохраняет идентификатор видео YouTube для воспроизведения.';

-- Права: старую сигнатуру отзываем, новую выдаём.
REVOKE ALL ON FUNCTION public.add_favorite(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.add_favorite(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.add_favorite(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
) TO authenticated;

-- ── 5. Удаляем старую версию функции ─────────────────────────────────────
--
-- ЭТО ОБЯЗАТЕЛЬНО, и вот почему.
--
-- `CREATE OR REPLACE FUNCTION` заменяет функцию только с ТЕМ ЖЕ набором
-- аргументов. Мы добавили `p_video_id`, поэтому сигнатура изменилась, и в
-- базе оказались ДВЕ функции с одним именем:
--   add_favorite(text,text,text,text,text,text,text,integer,integer)   — старая
--   add_favorite(text,text,text,text,text,text,text,text,integer,integer) — новая
--
-- PostgREST не может выбрать подходящую и отвечает ошибкой:
--   PGRST203: Could not choose the best candidate function between...
--
-- Из-за этого падало добавление в избранное — и для YouTube, и для остальных
-- источников, потому что клиент вызывает функцию по имени.
--
-- Удаляем старую версию. DROP с полным списком типов убирает ровно её,
-- новая функция при этом не затрагивается.

DROP FUNCTION IF EXISTS public.add_favorite(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
);

-- ── Проверка ─────────────────────────────────────────────────────────────
--
-- Убедиться, что колонки появились:
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name IN ('favorites', 'playlist_tracks')
--      AND column_name = 'video_id';
--
-- Проверить, что идентификаторы сохраняются:
--
--   SELECT track_id, title, source, video_id
--     FROM public.favorites
--    WHERE user_id = auth.uid() AND source = 'YouTube';
