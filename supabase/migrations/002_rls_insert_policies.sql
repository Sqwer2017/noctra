-- ═══════════════════════════════════════════════════════════════════════
--  NOCTRA — миграция 002: недостающие политики INSERT
-- ═══════════════════════════════════════════════════════════════════════
--
--  ПРОБЛЕМА, которую это исправляет.
--
--  В исходной схеме у таблиц статистики и квестов были объявлены политики
--  только на SELECT и UPDATE:
--
--    CREATE POLICY "Users can update own stats"
--      ON public.user_stats FOR UPDATE USING (auth.uid() = user_id);
--
--  Политика на UPDATE сама по себе НЕ разрешает вставку. Клиент использует
--  upsert (INSERT ... ON CONFLICT DO UPDATE), чтобы одной операцией и создать
--  строку, и обновить её — а для этого нужна отдельная политика FOR INSERT.
--
--  Симптом: профиль, XP и избранное сохраняются, а статистика прослушивания
--  и прогресс квестов молча не уходят в базу — запрос падает с ошибкой
--  «new row violates row-level security policy» (HTTP 403).
--
--  Выполнять в Supabase → SQL Editor. Файл идемпотентен (DROP IF EXISTS),
--  можно запускать повторно.
-- ═══════════════════════════════════════════════════════════════════════

-- ── user_stats: разрешаем создание строки владельцем ──────────────────
DROP POLICY IF EXISTS "Users can insert own stats" ON public.user_stats;
CREATE POLICY "Users can insert own stats"
  ON public.user_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── profiles: страховка на случай, если строку не создал триггер ──────
-- (например, пользователь зарегистрировался до применения миграции 001).
-- ON CONFLICT (id) DO NOTHING в триггере не спасёт, если строки нет вовсе.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── daily_quests_progress: то же самое для upsert прогресса ───────────
DROP POLICY IF EXISTS "Users can insert own quests" ON public.daily_quests_progress;
CREATE POLICY "Users can insert own quests"
  ON public.daily_quests_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── favorites: upsert требует и INSERT, и UPDATE ──────────────────────
-- В исходной схеме была политика FOR ALL, которая покрывает всё, но
-- перечисляем явно — так намерение видно и политика не потеряется,
-- если FOR ALL когда-нибудь заменят на конкретные операции.
DROP POLICY IF EXISTS "Users can insert own favorites" ON public.favorites;
CREATE POLICY "Users can insert own favorites"
  ON public.favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own favorites" ON public.favorites;
CREATE POLICY "Users can update own favorites"
  ON public.favorites FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── playlists / playlist_tracks: то же для upsert и insert ────────────
DROP POLICY IF EXISTS "Users can insert own playlists" ON public.playlists;
CREATE POLICY "Users can insert own playlists"
  ON public.playlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Playlist owners can insert tracks" ON public.playlist_tracks;
CREATE POLICY "Playlist owners can insert tracks"
  ON public.playlist_tracks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE id = playlist_tracks.playlist_id AND user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
--  ПОСЛЕ ПРИМЕНЕНИЯ: проверить, что политики на месте
--  (запусти этот запрос — должно вернуть строки для всех таблиц):
-- ═══════════════════════════════════════════════════════════════════════
--
--  SELECT tablename, policyname, cmd
--  FROM pg_policies
--  WHERE schemaname = 'public'
--  ORDER BY tablename, cmd;
