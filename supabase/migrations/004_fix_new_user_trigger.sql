-- ═══════════════════════════════════════════════════════════════════════
--  NOCTRA — миграция 004: исправление триггера регистрации
-- ═══════════════════════════════════════════════════════════════════════
--
--  ПРОБЛЕМА, которую это исправляет (подтверждена на живой базе).
--
--  После применения миграции 003 (уникальный тег) перестал работать вход —
--  Supabase отвечал HTTP 500 «Database error creating anonymous user».
--
--  Причина: триггер handle_new_user умел собирать тег только из username или
--  email. У анонимного пользователя (гостя) нет ни того, ни другого, поэтому
--  всегда получалось одно и то же значение — '@listener'. Первый гость его
--  занимал, а второй нарушал UNIQUE-индекс из миграции 003. Триггер падал,
--  Postgres откатывал создание пользователя, и вход не происходил вовсе.
--
--  ИСПРАВЛЕНИЕ: тег всегда делаем уникальным — добавляем числовой суффикс,
--  пока значение не окажется свободным. Заодно нормализуем username.
--
--  Выполнять в Supabase → SQL Editor. Идемпотентно.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta_username TEXT;
  base_username TEXT;
  candidate_tag TEXT;
  suffix        INTEGER := 0;
  final_tag     TEXT;
BEGIN
  -- ── 1. Определяем отображаемое имя ──────────────────────────────────
  -- Приоритет: имя из метаданных (Google, форма регистрации) → часть
  -- email до @ → 'listener' для анонимного входа, где данных нет вовсе.
  meta_username := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'username', '')), '');

  base_username := COALESCE(
    meta_username,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
    'listener'
  );

  -- ── 2. Подбираем свободный тег ──────────────────────────────────────
  -- Приводим к формату из миграции 003: '@' + [a-z0-9_-]{2,32}, иначе
  -- CHECK-ограничение не пропустит вставку.
  candidate_tag := '@' || REGEXP_REPLACE(
    LOWER(base_username),
    '[^a-z0-9_-]',
    '',
    'g'
  );

  -- Если после чистки осталось меньше 2 значащих символов (имя из эмодзи,
  -- одна буква и т.п.) — берём нейтральную основу. Проверяем именно 2, а не 3:
  -- '@' уже добавлен, значит порог CHECK в 3 символа достигается при 2 знаках.
  IF LENGTH(candidate_tag) < 3 THEN
    candidate_tag := '@user';
  END IF;

  -- Обрезаем основу, оставляя место под возможный суффикс (макс. 32 символа).
  candidate_tag := SUBSTRING(candidate_tag, 1, 24);

  final_tag := candidate_tag;

  -- Ищем свободное значение: @listener → @listener1 → @listener2 …
  WHILE EXISTS (
    SELECT 1 FROM public.profiles WHERE LOWER(tag) = LOWER(final_tag)
  ) LOOP
    suffix := suffix + 1;
    final_tag := candidate_tag || suffix::TEXT;

    -- Защита от бесконечного цикла при массовых коллизиях.
    IF suffix > 9999 THEN
      final_tag := '@user_' || SUBSTRING(NEW.id::TEXT, 1, 8);
      EXIT;
    END IF;
  END LOOP;

  -- ── 3. Создаём профиль и статистику ─────────────────────────────────
  INSERT INTO public.profiles (id, username, tag, bio)
  VALUES (
    NEW.id,
    base_username,
    final_tag,
    'Lost in the music, found in the dark.'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_stats (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер уже существует, пересоздавать не нужно — функция обновилась
-- через CREATE OR REPLACE. На всякий случай убеждаемся, что он на месте.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════
--  ПОСЛЕ ПРИМЕНЕНИЯ — проверить, что вход снова работает:
--
--    -- 1. Триггер обновился:
--    SELECT prosrc LIKE '%WHILE EXISTS%' AS has_loop
--    FROM pg_proc WHERE proname = 'handle_new_user';
--
--    -- 2. Дубликатов тегов нет:
--    SELECT tag, COUNT(*) FROM public.profiles
--    GROUP BY tag HAVING COUNT(*) > 1;      -- должно быть пусто
--
--    -- 3. Затем зайти в приложение гостем — должно пустить.
-- ═══════════════════════════════════════════════════════════════════════
