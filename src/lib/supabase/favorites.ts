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
    .select("track_id, title, artist, duration, cover_url, stream_url, source, video_id, added_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });

  if (error) {
    console.warn("[sync] не удалось загрузить избранное:", error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToTrack(row as TrackRow));
}

/**
 * Добавляет трек в избранное и начисляет XP.
 *
 * Начисление делает БАЗА (функция add_favorite из миграции 007), а не клиент:
 * она сама решает, положен ли опыт, и возвращает фактическую сумму.
 *
 * Раньше опыт начислял клиент и записывал в profiles.xp готовое число —
 * сервер не видел, за что оно начислено. Это позволяло абузить лайки:
 * поставил → снял → поставил, и каждый цикл давал +2 XP. Теперь за один трек
 * опыт выдаётся ровно один раз, и повторное добавление вернёт granted = false.
 *
 * Возвращает, сколько XP реально начислено (0 — если уже награждали).
 */
export async function addFavorite(track: PlaylistTrack): Promise<number> {
  if (!isSupabaseConfigured || !supabase) return 0;

  const { data, error } = await supabase.rpc("add_favorite", {
    p_track_id: track.id,
    p_title: track.title,
    p_artist: track.artist,
    p_duration: track.duration,
    p_cover_url: track.coverUrl,
    p_stream_url: track.streamUrl,
    p_source: track.source,
    /*
     * Идентификатор видео.
     *
     * Для YouTube он обязателен: прямого потока у источника нет, и после
     * перезагрузки трек воспроизводится только по этому значению. Без него
     * лайк сохранялся, но трек становился неиграбельным.
     */
    p_video_id: track.videoId ?? null,
  });

  if (error) {
    /*
     * Функции может не быть до применения миграции 007. В этом случае
     * пишем напрямую: избранное важнее награды, лайк не должен теряться
     * из-за отсутствующей миграции.
     */
    console.warn(
      "[favorites] add_favorite недоступна, пишем напрямую:",
      error.message,
    );
    await addFavoriteDirect(track);
    return 0;
  }

  const result = (data ?? {}) as { granted?: boolean; awarded_xp?: number };
  return result.granted ? Number(result.awarded_xp ?? 0) : 0;
}

/** Прямая запись в таблицу — запасной путь, если RPC недоступна. */
async function addFavoriteDirect(track: PlaylistTrack): Promise<void> {
  const row = trackToRow(track);

  await syncWrite(
    {
      kind: "favorite:add",
      at: Date.now(),
      payload: row as unknown as Record<string, unknown>,
    },
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
  if (!isSupabaseConfigured || !supabase) return;

  /*
   * Через функцию, а не прямым DELETE: она намеренно НЕ удаляет запись из
   * журнала наград. Если бы снятие лайка стирало её, опыт можно было бы
   * получать заново за тот же трек, и абуз вернулся бы.
   */
  const { error } = await supabase.rpc("remove_favorite", {
    p_track_id: trackId,
  });

  if (error) {
    console.warn(
      "[favorites] remove_favorite недоступна, удаляем напрямую:",
      error.message,
    );
    await removeFavoriteDirect(trackId);
  }
}

/** Прямое удаление — запасной путь, если RPC недоступна. */
async function removeFavoriteDirect(trackId: string): Promise<void> {
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
