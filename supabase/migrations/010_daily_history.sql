-- ============================================================================
-- 010_daily_history.sql
--
-- История активности по дням и поля под метрики достижений.
--
-- ЗАЧЕМ
-- -----
-- Две задачи:
--
--   1. В профиле нужен прогресс по дням не только для времени прослушивания,
--      но и для треков, избранного и дней активности. Сейчас в базе хранится
--      лишь `listening_history` (минуты по дням), поэтому остальные плитки
--      показывали заглушку «NEW» — считать дельту было не из чего.
--
--   2. Пять достижений не засчитывались, потому что их метрики никто не
--      записывал. SQL-триггер из 005 проверяет поля `night_plays`,
--      `max_session_seconds`, `repeat_loops`, `shuffle_streak`, `source_kinds`,
--      но клиент отправлял только 4 колонки статистики. Поля объявлены в 005,
--      здесь добавляем недостающее и фиксируем ограничения.
--
-- Формат дневных историй — как у `listening_history`: {"2026-09-16": 12}.
-- Значения целочисленные: штуки треков, лайков, минут.
--
-- Идемпотентно: повторный запуск безопасен.
-- ============================================================================

-- ── 1. Дневные истории ───────────────────────────────────────────────────

ALTER TABLE public.user_stats
  -- Прослушанные до конца треки по дням: {"2026-09-16": 12}
  ADD COLUMN IF NOT EXISTS daily_tracks JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Добавления в избранное по дням: {"2026-09-16": 3}
  ADD COLUMN IF NOT EXISTS daily_favorites JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_stats.daily_tracks IS
  'Число полностью прослушанных треков по дням: {"YYYY-MM-DD": count}. '
  'Источник данных для прогресса плитки «Треков прослушано».';

COMMENT ON COLUMN public.user_stats.daily_favorites IS
  'Число добавлений в избранное по дням: {"YYYY-MM-DD": count}. '
  'Источник данных для прогресса плитки «Любимых треков».';

-- ── 2. Поля метрик достижений ────────────────────────────────────────────
--
-- Часть колонок уже добавлена миграцией 005. Повторяем с IF NOT EXISTS,
-- чтобы 010 можно было применять независимо от порядка.

ALTER TABLE public.user_stats
  -- Треки, дослушанные ночью (00:00–05:59) — достижение «Полуночный пилигрим».
  ADD COLUMN IF NOT EXISTS night_plays INTEGER NOT NULL DEFAULT 0,
  -- Самая длинная непрерывная сессия в секундах — «Шёпот пустоты» (1 час).
  ADD COLUMN IF NOT EXISTS max_session_seconds BIGINT NOT NULL DEFAULT 0,
  -- Максимум повторов одного трека подряд — «Одержимость» (10 раз).
  ADD COLUMN IF NOT EXISTS repeat_loops INTEGER NOT NULL DEFAULT 0,
  -- Максимум треков подряд в режиме перемешивания — «Слепая судьба» (50).
  ADD COLUMN IF NOT EXISTS shuffle_streak INTEGER NOT NULL DEFAULT 0,
  -- Сколько разных источников треков слушал — «Двойной резонанс» (2).
  ADD COLUMN IF NOT EXISTS source_kinds INTEGER NOT NULL DEFAULT 0,
  -- Список источников: ['SoundCloud', 'Telegram']. Нужен, чтобы при подсчёте
  -- не терять уже встреченные — по одному числу их не восстановить.
  ADD COLUMN IF NOT EXISTS source_list JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.user_stats.max_session_seconds IS
  'Самая длинная непрерывная сессия прослушивания, секунды.';
COMMENT ON COLUMN public.user_stats.repeat_loops IS
  'Максимум повторов подряд одного трека (режим «повтор одного»).';
COMMENT ON COLUMN public.user_stats.shuffle_streak IS
  'Максимум треков подряд, проигранных в режиме перемешивания.';
COMMENT ON COLUMN public.user_stats.source_list IS
  'Уникальные источники прослушанных треков: ["SoundCloud", "Telegram"].';

-- ── 3. Счётчики для дней активности ──────────────────────────────────────
--
-- `active_days_count` уже есть. Оставляем как есть: клиент пишет туда число
-- записей в истории. Для недельного прогресса этого достаточно — даты
-- известны из listening_history.

-- ── 4. Ограничения на значения ───────────────────────────────────────────
--
-- Защита от мусора: счётчики не могут быть отрицательными. Ограничения
-- добавляем идемпотентно — повторный ALTER с тем же именем упал бы.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_stats_metrics_nonnegative'
  ) THEN
    ALTER TABLE public.user_stats
      ADD CONSTRAINT user_stats_metrics_nonnegative CHECK (
        night_plays >= 0 AND
        max_session_seconds >= 0 AND
        repeat_loops >= 0 AND
        shuffle_streak >= 0 AND
        source_kinds >= 0
      );
  END IF;
END
$$;

-- ── 5. Индексы под выборки по дням ───────────────────────────────────────
--
-- Дневные истории — JSONB, и по ним не фильтруют в SQL (обрабатывает клиент).
-- Индексировать их целиком смысла нет: это небольшие объекты, которые читаются
-- вместе со строкой статистики.

-- ── Проверка ─────────────────────────────────────────────────────────────
--
-- Убедиться, что колонки появились:
--
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name = 'user_stats'
--    ORDER BY ordinal_position;
--
-- Ожидается наличие: daily_tracks, daily_favorites, night_plays,
-- max_session_seconds, repeat_loops, shuffle_streak, source_kinds, source_list.
--
-- Посмотреть накопленное по дням:
--
--   SELECT listening_history, daily_tracks, daily_favorites,
--          night_plays, max_session_seconds, repeat_loops,
--          shuffle_streak, source_kinds, source_list
--     FROM public.user_stats
--    WHERE user_id = auth.uid();
