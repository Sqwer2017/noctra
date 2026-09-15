-- ═══════════════════════════════════════════════════════════════════════
--  NOCTRA — миграция 001: дополнение базовой схемы под клиент
-- ═══════════════════════════════════════════════════════════════════════
--
--  Этот файл ДОПОЛНЯЕТ уже развёрнутую схему (profiles, user_stats,
--  favorites, playlists, playlist_tracks, daily_quests_progress).
--  Выполнять в Supabase → SQL Editor целиком, повторный запуск безопасен
--  (все операции идемпотентны: IF NOT EXISTS / DROP IF EXISTS).
--
--  Зачем нужны колонки ниже: клиент хранит часть полей профиля, которых
--  в исходной схеме нет (status, followers, following) и дневное состояние
--  прогрессии, которое иначе пришлось бы держать в localStorage и оно бы
--  рассинхронивалось между устройствами.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Дополнительные колонки профиля ─────────────────────────────────
-- status          — короткая строка-статус над био (отображается в шапке).
-- followers/following — счётчики; пока локальные, задел под соц. функции.
-- daily_*         — дневное состояние прогрессии (см. useProgressionStore):
--                   обнуляется при смене daily_date и переносится в БД,
--                   чтобы XP-лимиты и квесты не сбрасывались между сессиями.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status                 TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS followers              INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following              INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_date             DATE    NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS daily_listened_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_favorites_added  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_completed_tracks INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS playlist_xp_claimed    BOOLEAN NOT NULL DEFAULT FALSE;

-- Дефолтные пути к ассетам заменяем на NULL: файлов /avatars/default.png
-- и /banners/default.png в проекте нет, они давали битые картинки.
-- UI корректно рисует градиентную заглушку, когда значение NULL.
ALTER TABLE public.profiles
  ALTER COLUMN avatar_url DROP DEFAULT,
  ALTER COLUMN avatar_url DROP NOT NULL,
  ALTER COLUMN banner_url DROP DEFAULT,
  ALTER COLUMN banner_url DROP NOT NULL;

-- ── 2. Автообновление updated_at ──────────────────────────────────────
-- В исходной схеме колонка есть, но никто её не обновлял.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_stats_set_updated_at ON public.user_stats;
CREATE TRIGGER user_stats_set_updated_at
  BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Триггер регистрации: добавляем phone/дефолты ───────────────────
-- Оригинальный handle_new_user вставляет username='sqwer' по умолчанию.
-- Переписываем так, чтобы ник брался из метаданных регистрации
-- (клиент передаёт его в signUp options.data.username), а если его нет —
-- из email. Профиль по-прежнему создаётся автоматически.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta_username TEXT;
  final_username TEXT;
  final_tag      TEXT;
BEGIN
  meta_username := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'username', '')), '');

  final_username := COALESCE(
    meta_username,
    NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
    'listener'
  );

  -- Тег = @username в нижнем регистре без пробелов (аналог nickToHandle в клиенте).
  final_tag := '@' || LOWER(REGEXP_REPLACE(final_username, '[\s@]+', '', 'g'));

  INSERT INTO public.profiles (id, username, tag, bio)
  VALUES (
    NEW.id,
    final_username,
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

-- ── 4. Индексы под частые выборки клиента ─────────────────────────────
-- Избранное и треки плейлистов читаются с сортировкой по дате добавления.
CREATE INDEX IF NOT EXISTS favorites_user_added_idx
  ON public.favorites (user_id, added_at DESC);

CREATE INDEX IF NOT EXISTS playlist_tracks_order_idx
  ON public.playlist_tracks (playlist_id, order_index);

CREATE INDEX IF NOT EXISTS playlists_user_idx
  ON public.playlists (user_id, created_at DESC);

-- ── 5. Storage: аватары и баннеры ─────────────────────────────────────
-- Публичное чтение (картинки профиля видны всем), запись — только в свою
-- папку, имя которой равно auth.uid(). Это стандартный паттерн Supabase.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('banners', 'banners', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Чтение: файлы публичных бакетов доступны всем.
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('avatars', 'banners'));

-- Запись: пользователь пишет только в папку со своим uid.
-- storage.foldername(name)[1] — первый сегмент пути, т.е. <uid>/file.webp.
DROP POLICY IF EXISTS "Users manage own avatar files" ON storage.objects;
CREATE POLICY "Users manage own avatar files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id IN ('avatars', 'banners')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own avatar files" ON storage.objects;
CREATE POLICY "Users update own avatar files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id IN ('avatars', 'banners')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own avatar files" ON storage.objects;
CREATE POLICY "Users delete own avatar files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id IN ('avatars', 'banners')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
