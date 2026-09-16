-- ============================================================================
-- 009_fix_achievement_triggers.sql
--
-- Исправляет ошибку в триггерах достижений из миграции 005.
--
-- ПРОБЛЕМА
-- -------
-- При любом обновлении таблиц падало:
--
--   ERROR: 42703: record "new" has no field "user_id"
--   CONTEXT: SELECT public.check_achievements(COALESCE(NEW.user_id, NEW.id))
--
-- ПРИЧИНА
-- -------
-- Функция-обработчик была ОДНА на пять разных таблиц, и брала пользователя
-- как `COALESCE(NEW.user_id, NEW.id)`. Расчёт был на то, что у всех таблиц
-- есть `user_id`, а у profiles ключ называется `id`.
--
-- Но у playlist_tracks нет НИ ТОГО, НИ ДРУГОГО: она ссылается на плейлист
-- через `playlist_id`, а владелец определяется через саму таблицу playlists.
-- В PL/pgSQL обращение к несуществующему полю записи — ошибка времени
-- выполнения, поэтому падал не только INSERT в playlist_tracks, а вообще
-- любое обновление: ошибка возникала при попытке вычислить аргумент.
--
-- РЕШЕНИЕ
-- -------
-- Разные функции для разных групп таблиц:
--   * где есть user_id  — берём его напрямую;
--   * где ключ id       — это profiles, там id и есть пользователь;
--   * где есть только playlist_id — владельца ищем в playlists.
--
-- Дополнительно триггеры оборачиваются в безопасный вызов: сбой при выдаче
-- достижения не должен откатывать запись самого прогресса. Иначе сохранение
-- статистики падало бы из-за проблемы в необязательной механике наград.
--
-- Идемпотентно: повторный запуск безопасен.
-- ============================================================================

-- ── 1. Снимаем сломанные триггеры ────────────────────────────────────────
--
-- Сначала удаляем, потом создаём заново: иначе на время миграции остались бы
-- висеть старые обработчики.

DROP TRIGGER IF EXISTS user_stats_check_achievements ON public.user_stats;
DROP TRIGGER IF EXISTS favorites_check_achievements ON public.favorites;
DROP TRIGGER IF EXISTS playlists_check_achievements ON public.playlists;
DROP TRIGGER IF EXISTS playlist_tracks_check_achievements ON public.playlist_tracks;
DROP TRIGGER IF EXISTS profiles_check_achievements ON public.profiles;

-- ── 2. Безопасный вызов проверки достижений ──────────────────────────────
--
-- Общая обёртка: гасит любые ошибки внутри выдачи достижений.
--
-- Зачем: достижения — дополнительная механика. Если в ней что-то ломается
-- (нет строки в user_stats, ошибка в условии, отсутствующая колонка), это
-- НЕ должно откатывать сохранение прогресса пользователя. Иначе один
-- проблемный триггер блокирует запись XP и статистики целиком.

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
    -- Логируем и продолжаем: запись прогресса важнее выдачи награды.
    RAISE WARNING 'check_achievements для % не выполнена: % (%)',
      p_user_id, SQLERRM, SQLSTATE;
END;
$$;

COMMENT ON FUNCTION public.safe_check_achievements(UUID) IS
  'Вызывает check_achievements, гася ошибки: сбой выдачи достижений '
  'не должен откатывать запись прогресса пользователя.';

-- ── 3. Обработчики для таблиц с колонкой user_id ─────────────────────────

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

COMMENT ON FUNCTION public.trg_check_achievements_user_id() IS
  'Обработчик для таблиц, у которых владелец хранится в user_id '
  '(user_stats, favorites, playlists).';

-- ── 4. Обработчик для profiles (ключ — id) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_check_achievements_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- У profiles первичный ключ id и есть идентификатор пользователя.
  PERFORM public.safe_check_achievements(NEW.id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_check_achievements_profiles() IS
  'Обработчик для profiles: владелец хранится в колонке id.';

-- ── 5. Обработчик для playlist_tracks (владелец через плейлист) ──────────

CREATE OR REPLACE FUNCTION public.trg_check_achievements_playlist_tracks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  /*
   * У playlist_tracks нет user_id — владельца определяем через плейлист.
   *
   * Именно на этой таблице падала прежняя версия: `NEW.user_id` не существует,
   * и обращение к нему — ошибка времени выполнения, а не NULL.
   *
   * При удалении строки плейлиста может уже не быть, поэтому смотрим и NEW,
   * и OLD: для DELETE актуально только OLD.
   */
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id
      FROM public.playlists
     WHERE id = OLD.playlist_id;
  ELSE
    SELECT user_id INTO v_user_id
      FROM public.playlists
     WHERE id = NEW.playlist_id;
  END IF;

  PERFORM public.safe_check_achievements(v_user_id);

  -- AFTER-триггер: возвращаемое значение не используется, но по правилам
  -- для DELETE нужно вернуть OLD.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_check_achievements_playlist_tracks() IS
  'Обработчик для playlist_tracks: владелец определяется через playlists.';

-- ── 6. Ставим триггеры с правильными обработчиками ───────────────────────

CREATE TRIGGER user_stats_check_achievements
  AFTER INSERT OR UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_achievements_user_id();

CREATE TRIGGER favorites_check_achievements
  AFTER INSERT OR DELETE ON public.favorites
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_achievements_user_id();

CREATE TRIGGER playlists_check_achievements
  AFTER INSERT OR DELETE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_achievements_user_id();

CREATE TRIGGER playlist_tracks_check_achievements
  AFTER INSERT OR DELETE ON public.playlist_tracks
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_achievements_playlist_tracks();

CREATE TRIGGER profiles_check_achievements
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_achievements_profiles();

-- ── 7. Убираем прежний сломанный обработчик ──────────────────────────────
--
-- Он больше нигде не используется: все триггеры переведены на новые функции.
-- Удаляем, чтобы никто случайно не навесил его снова.

DROP FUNCTION IF EXISTS public.trg_check_achievements();

-- ── Проверка ─────────────────────────────────────────────────────────────
--
-- 1. Триггеры на месте и указывают на правильные функции:
--
--   SELECT event_object_table AS table_name,
--          trigger_name,
--          action_timing,
--          event_manipulation
--     FROM information_schema.triggers
--    WHERE trigger_name LIKE '%check_achievements%'
--    ORDER BY table_name;
--
-- 2. Запись в playlist_tracks больше не падает (главная проверка):
--
--   SELECT COUNT(*) FROM public.playlist_tracks;
--
--   Проверить на реальных данных — вставить и удалить строку в существующем
--   плейлисте, затем убедиться, что ошибки нет:
--
--   INSERT INTO public.playlist_tracks (playlist_id, track_id, title, order_index)
--   SELECT id, 'test-track-guard', 'Test', 999
--     FROM public.playlists
--    LIMIT 1;
--
--   DELETE FROM public.playlist_tracks WHERE track_id = 'test-track-guard';
--
-- 3. Убедиться, что сбой достижений не ломает запись статистики:
--    функция safe_check_achievements гасит ошибку и пишет WARNING в лог.
