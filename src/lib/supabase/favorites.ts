import { supabase, requireSupabase, isSupabaseConfigured } from "../supabase";
import type { PlaylistTrack } from "../../types/playlist";
import type { TrackRow } from "./mappers";
import { rowToTrack, trackToRow } from "./mappers";
import { syncWrite } from "./sync";

/**
 * Избранные треки (таблица `favorites`).
 *
 * Запись оптимистичная: стор обновляется мгновенно, сюда приходит уже
 * свершившийся факт. При ошибке сети операция уедет в очередь повтора.
 */

export async function fetchFavorites(userId: string): Promise<PlaylistTrack[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  const { data, error } = await supabase
    .from("favorites")
    .select("track_id, title, artist, duration, cover_url, stream_url, source, added_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });

  if (error) {
    console.warn("[sync] не удалось загрузить избранное:", error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToTrack(row as TrackRow));
}

export async function addFavorite(track: PlaylistTrack): Promise<void> {
  const row = trackToRow(track);

  await syncWrite(
    { kind: "favorite:add", at: Date.now(), payload: row as unknown as Record<string, unknown> },
    async (userId) => {
      const client = requireSupabase();
      // onConflict — по UNIQUE(user_id, track_id) из схемы: повторный лайк
      // не создаёт дубликат, а обновляет метаданные трека.
      const { error } = await client
        .from("favorites")
        .upsert({ user_id: userId, ...row }, { onConflict: "user_id,track_id" });
      if (error) throw error;
    },
  );
}

export async function removeFavorite(trackId: string): Promise<void> {
  await syncWrite(
    { kind: "favorite:remove", at: Date.now(), payload: { trackId } },
    async (userId) => {
      const client = requireSupabase();
      const { error } = await client
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("track_id", trackId);
      if (error) throw error;
    },
  );
}
