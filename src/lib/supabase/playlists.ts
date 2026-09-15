import { supabase, requireSupabase, isSupabaseConfigured } from "../supabase";
import type { Playlist, PlaylistTrack } from "../../types/playlist";
import type { PlaylistRow, TrackRow } from "./mappers";
import { playlistToRow, rowToPlaylist, rowToTrack, trackToRow } from "./mappers";
import { syncWrite } from "./sync";

/**
 * Плейлисты и их треки (`playlists` + `playlist_tracks`).
 *
 * Читаем одним запросом с вложенной выборкой треков — так список открывается
 * за один round-trip, а не N+1.
 */

export async function fetchPlaylists(userId: string): Promise<Playlist[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  const { data, error } = await supabase
    .from("playlists")
    .select(
      "id, title, description, cover_url, is_public, created_at, playlist_tracks(track_id, title, artist, duration, cover_url, stream_url, source, order_index)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[sync] не удалось загрузить плейлисты:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const nested = (row as PlaylistRow & { playlist_tracks?: (TrackRow & { order_index: number })[] })
      .playlist_tracks;

    const tracks = (nested ?? [])
      .slice()
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((track) => rowToTrack(track));

    return rowToPlaylist(row as PlaylistRow, tracks);
  });
}

/**
 * Создаёт плейлист и возвращает его id.
 *
 * Здесь нельзя полностью оптимистично: id генерирует БД, а клиентский
 * `crypto.randomUUID()` в базу не попадёт. Поэтому сначала запись, потом
 * локальный стейт — но UI уже открыл окно и ждёт, так что задержка незаметна.
 */
export async function createPlaylistRemote(
  userId: string,
  playlist: Omit<Playlist, "id" | "tracks">,
): Promise<Playlist> {
  const client = requireSupabase();
  const row = playlistToRow(playlist);

  const { data, error } = await client
    .from("playlists")
    .insert({ user_id: userId, ...row })
    .select("id, title, description, cover_url, is_public, created_at")
    .single<PlaylistRow>();

  if (error) throw error;
  return rowToPlaylist(data, []);
}

export async function updatePlaylistRemote(
  playlistId: string,
  playlist: Omit<Playlist, "id" | "tracks">,
): Promise<void> {
  const patch = playlistToRow(playlist) as unknown as Record<string, unknown>;

  await syncWrite(
    { kind: "playlist:update", at: Date.now(), payload: { id: playlistId, patch } },
    async () => {
      const client = requireSupabase();
      const { error } = await client
        .from("playlists")
        .update(patch)
        .eq("id", playlistId);
      if (error) throw error;
    },
  );
}

export async function deletePlaylistRemote(playlistId: string): Promise<void> {
  await syncWrite(
    { kind: "playlist:delete", at: Date.now(), payload: { id: playlistId } },
    async () => {
      const client = requireSupabase();
      // Треки удалятся каскадом (ON DELETE CASCADE в схеме).
      const { error } = await client.from("playlists").delete().eq("id", playlistId);
      if (error) throw error;
    },
  );
}

/**
 * Перезаписывает состав треков плейлиста.
 *
 * Простейший надёжный вариант: удалить все строки и вставить актуальный
 * список с order_index. Полноценный diff по id дал бы меньше трафика, но
 * при 10–100 треках разница несущественна, а корректность очевиднее.
 */
export async function replacePlaylistTracks(
  playlistId: string,
  tracks: PlaylistTrack[],
): Promise<void> {
  const client = requireSupabase();

  const { error: deleteError } = await client
    .from("playlist_tracks")
    .delete()
    .eq("playlist_id", playlistId);

  if (deleteError) throw deleteError;
  if (tracks.length === 0) return;

  const rows = tracks.map((track, index) => ({
    playlist_id: playlistId,
    ...trackToRow(track),
    order_index: index,
  }));

  const { error: insertError } = await client.from("playlist_tracks").insert(rows);
  if (insertError) throw insertError;
}

/** Добавляет один трек в конец плейлиста. */
export async function insertPlaylistTrack(
  playlistId: string,
  track: PlaylistTrack,
  orderIndex: number,
): Promise<void> {
  const row = trackToRow(track) as unknown as Record<string, unknown>;

  await syncWrite(
    {
      kind: "playlist:track-add",
      at: Date.now(),
      payload: { playlistId, track: row, orderIndex },
    },
    async () => {
      const client = requireSupabase();
      const { error } = await client
        .from("playlist_tracks")
        .insert({ playlist_id: playlistId, ...row, order_index: orderIndex });
      if (error) throw error;
    },
  );
}

export async function deletePlaylistTrack(
  playlistId: string,
  trackId: string,
): Promise<void> {
  await syncWrite(
    {
      kind: "playlist:track-remove",
      at: Date.now(),
      payload: { playlistId, trackId },
    },
    async () => {
      const client = requireSupabase();
      const { error } = await client
        .from("playlist_tracks")
        .delete()
        .eq("playlist_id", playlistId)
        .eq("track_id", trackId);
      if (error) throw error;
    },
  );
}
