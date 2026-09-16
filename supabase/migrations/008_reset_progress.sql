-- ============================================================================
-- 008_reset_progress.sql
--
-- Сброс накрученного прогресса.
--
-- ЗАЧЕМ
-- -----
-- Из-за абузов (повторный сбор наград за задания, лайки туда-сюда) в профилях
-- накопился опыт, который не соответствует реальной активности. Пока защита
-- не стояла, значения могли уехать сколь угодно далеко, и честный прогресс
-- отделить от накрученного уже нельзя — проще начать заново.
--
-- ЧТО ДЕЛАЕТ
-- ----------
--   1. Обнуляет опыт и дневные счётчики в profiles.
--   2. Обнуляет статистику прослушивания в user_stats.
--   3. Очищает журнал наград — чтобы после сброса можно было получать
--      награды за треки заново (иначе старые лайки «съели» бы награды).
--   4. Очищает прогресс заданий за сегодня.
--   5. Удаляет открытые достижения, кроме тех, что уже не зависят от
--      обнулённых счётчиков.
--
-- ЧЕГО НЕ ДЕЛАЕТ (специально)
-- ---------------------------
-- Избранное и плейлисты НЕ трогаются. Это пользовательский контент, а не
-- награда: удалять его вместе с опытом было бы сюрпризом. Если нужен полный
-- сброс — раскомментируйте блок в конце файла.
--
-- ВНИМАНИЕ: действие необратимо. Перед запуском сделайте резервную копию
-- (Supabase → Database → Backups) либо сначала выполните SELECT-проверку
-- в самом конце файла.
-- ============================================================================

-- ── 1. Профили: опыт и дневное состояние ─────────────────────────────────
UPDATE public.profiles
   SET xp = 0,
       level = 1,
       rank_tier = 1,
       rank_name = 'base',
       daily_date = (timezone('utc'::text, now()))::date,
       daily_listened_seconds = 0,
       daily_favorites_added = 0,
       daily_completed_tracks = 0,
       playlist_xp_claimed = false;

-- ── 2. Статистика прослушивания ──────────────────────────────────────────
UPDATE public.user_stats
   SET total_seconds_listened = 0,
       total_tracks_played = 0,
       active_days_count = 0,
       listening_history = '{}'::jsonb;

-- Сбрасываем и поля, добавленные миграцией 005 (их может не быть, если
-- миграция не применялась — поэтому в отдельном блоке с проверкой).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'user_stats'
       AND column_name = 'streak_days'
  ) THEN
    EXECUTE $sql$
      UPDATE public.user_stats
         SET streak_days = 0,
             last_active_date = NULL,
             max_session_seconds = 0,
             night_plays = 0,
             repeat_loops = 0,
             shuffle_streak = 0,
             max_playlist_tracks = 0,
             source_kinds = 0,
             quests_claimed_total = 0
    $sql$;
  END IF;
END
$$;

-- ── 3. Журнал наград ─────────────────────────────────────────────────────
--
-- Обязательно: уникальный индекс не даст выдать награду за трек повторно.
-- Если журнал оставить, после сброса лайки перестали бы приносить опыт —
-- выглядело бы как сломанная механика, хотя это защита.
--
-- Каждый блок обёрнут в проверку существования таблицы: миграции могли
-- применяться не по порядку (например, 005 падала на триггерах, и часть
-- её таблиц не создалась). Без этого весь сброс прервался бы на первой
-- отсутствующей таблице.

DO $$
BEGIN
  IF to_regclass('public.reward_log') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.reward_log';
  ELSE
    RAISE NOTICE 'reward_log отсутствует — пропускаем (примените 007)';
  END IF;
END
$$;

-- ── 4. Прогресс ежедневных заданий ───────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.daily_quests_progress') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.daily_quests_progress';
  ELSE
    RAISE NOTICE 'daily_quests_progress отсутствует — пропускаем';
  END IF;
END
$$;

-- ── 5. Открытые достижения ───────────────────────────────────────────────
--
-- Условия достижений привязаны к обнулённым счётчикам, поэтому все выданные
-- записи удаляем: пусть зарабатываются заново честно. Проверялка на стороне
-- базы выдаст их снова, когда условия реально выполнятся.
DO $$
BEGIN
  IF to_regclass('public.user_achievements') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.user_achievements';
  ELSE
    RAISE NOTICE 'user_achievements отсутствует — пропускаем (примените 005)';
  END IF;
END
$$;

-- ── 6. [ОПЦИОНАЛЬНО] Полный сброс пользовательского контента ─────────────
--
-- Раскомментируйте, если хотите стереть избранное и плейлисты вместе
-- с прогрессом. По умолчанию закомментировано: это данные пользователя,
-- и удалять их «заодно» — неожиданно для него.
--
-- DELETE FROM public.playlist_tracks;
-- DELETE FROM public.playlists;
-- DELETE FROM public.favorites;

-- ── Проверка результата ──────────────────────────────────────────────────
--
-- После выполнения убедитесь, что всё обнулилось:
--
--   SELECT id, username, xp, level, rank_name, daily_favorites_added
--     FROM public.profiles
--    ORDER BY updated_at DESC
--    LIMIT 10;
--
--   SELECT user_id, total_seconds_listened, total_tracks_played, active_days_count
--     FROM public.user_stats
--    LIMIT 10;
--
--   SELECT COUNT(*) AS rewards_left   FROM public.reward_log;
--   SELECT COUNT(*) AS quests_left    FROM public.daily_quests_progress;
--   SELECT COUNT(*) AS achieves_left  FROM public.user_achievements;
--
-- Ожидается: xp = 0, счётчики = 0, все три COUNT = 0.
--
-- Избранное и плейлисты должны остаться на месте:
--
--   SELECT COUNT(*) AS favorites_left FROM public.favorites;
--   SELECT COUNT(*) AS playlists_left FROM public.playlists;
