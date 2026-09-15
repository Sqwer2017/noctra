-- ═══════════════════════════════════════════════════════════════════════
--  NOCTRA — миграция 003: уникальность тега (@handle)
-- ═══════════════════════════════════════════════════════════════════════
--
--  ЗАЧЕМ.
--
--  Тег — это публичный идентификатор пользователя (@nickname). По нему
--  планируется поиск людей, поэтому два аккаунта с одинаковым тегом
--  недопустимы: иначе поиск вернёт нескольких человек и будет непонятно,
--  кто есть кто, а упоминания через @ станут неоднозначными.
--
--  ПРОВЕРЕНО НА ЖИВОЙ БАЗЕ: ограничения не было — два разных пользователя
--  успешно заняли один и тот же тег (оба запроса вернули 200).
--
--  Выполнять в Supabase → SQL Editor. Файл идемпотентен.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Приводим существующие теги к единому виду ──────────────────────
-- Иначе UNIQUE может не сработать из-за разного регистра ('@Nick' и '@nick')
-- или случайных пробелов. Это разовая нормализация уже накопленных данных.
UPDATE public.profiles
SET tag = '@' || LOWER(REGEXP_REPLACE(tag, '[\s@]+', '', 'g'))
WHERE tag IS NOT NULL
  AND tag <> '@' || LOWER(REGEXP_REPLACE(tag, '[\s@]+', '', 'g'));

-- ── 2. Разбираемся с уже существующими дубликатами ────────────────────
-- Если дубликаты уже есть, UNIQUE не создастся. Оставляем тег самому
-- раннему аккаунту, остальным добавляем числовой суффикс.
WITH duplicates AS (
  SELECT
    id,
    tag,
    ROW_NUMBER() OVER (PARTITION BY tag ORDER BY created_at, id) AS rn
  FROM public.profiles
  WHERE tag IS NOT NULL
)
UPDATE public.profiles p
SET tag = d.tag || '_' || d.rn
FROM duplicates d
WHERE p.id = d.id AND d.rn > 1;

-- ── 3. Пустые теги: заполняем, иначе UNIQUE не даст завести несколько ──
-- (NULL в UNIQUE не конфликтует, но пустая строка '' — конфликтует).
UPDATE public.profiles
SET tag = '@user_' || SUBSTRING(id::text, 1, 8)
WHERE tag IS NULL OR TRIM(tag) = '' OR tag = '@';

-- ── 4. Уникальность ───────────────────────────────────────────────────
-- Регистронезависимо: '@Nick' и '@nick' — один и тот же тег.
DROP INDEX IF EXISTS public.profiles_tag_unique_idx;
CREATE UNIQUE INDEX profiles_tag_unique_idx
  ON public.profiles (LOWER(tag));

-- ── 5. Ограничение формата ────────────────────────────────────────────
-- Тег должен начинаться с @ и содержать только буквы, цифры, _ и -.
-- Отсекает мусор вроде '@@@' или '@@ привет'.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_tag_format_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tag_format_check
  CHECK (tag ~ '^@[a-z0-9_-]{2,32}$');

-- ═══════════════════════════════════════════════════════════════════════
--  ПОСЛЕ ПРИМЕНЕНИЯ — проверка:
--
--    SELECT tag, COUNT(*) FROM public.profiles
--    GROUP BY tag HAVING COUNT(*) > 1;      -- должно быть пусто
--
--    SELECT indexdef FROM pg_indexes
--    WHERE tablename = 'profiles' AND indexname = 'profiles_tag_unique_idx';
-- ═══════════════════════════════════════════════════════════════════════
