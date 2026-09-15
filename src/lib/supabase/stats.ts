import { supabase, requireSupabase, isSupabaseConfigured } from "../supabase";
import { syncWrite } from "./sync";

/**
 * Статистика прослушивания (`user_stats`).
 *
 * `listening_history` — JSONB вида {"2026-09-15": 35} с минутами по дням;
 * это ровно клиентский `historyMap`, поэтому конвертация не нужна.
 *
 * Запись вызывается батчем из стора прогрессии, а не на каждый тик: во время
 * воспроизведения значение меняется раз в секунду.
 */

export type ListeningStats = {
  totalSecondsListened: number;
  totalTracksPlayed: number;
  activeDaysCount: number;
  history: Record<string, number>;
};

export async function fetchListeningStats(
  userId: string,
): Promise<ListeningStats | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from("user_stats")
    .select("total_seconds_listened, total_tracks_played, active_days_count, listening_history")
    .eq("user_id", userId)
    .maybeSingle<{
      total_seconds_listened: number;
      total_tracks_played: number;
      active_days_count: number;
      listening_history: Record<string, number> | null;
    }>();

  if (error) {
    console.warn("[sync] не удалось прочитать статистику:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    totalSecondsListened: Number(data.total_seconds_listened ?? 0),
    totalTracksPlayed: Number(data.total_tracks_played ?? 0),
    activeDaysCount: Number(data.active_days_count ?? 0),
    // Минуты в UI целые (как в примере схемы {"2026-09-15": 35}), но накопление
    // идёт дробно — округляем только на запись, чтобы не терять точность.
    history: data.listening_history ?? {},
  };
}

/**
 * Сохраняет статистику.
 *
 * Идёт через `syncWrite`, а не напрямую: при сбое сети операция попадает
 * в очередь повтора и уйдёт позже. Раньше здесь было прямое обращение
 * к клиенту с одним `console.warn` — при обрыве связи статистика терялась
 * безвозвратно, хотя для остальных данных очередь работала.
 */
export async function pushListeningStats(stats: ListeningStats): Promise<void> {
  const roundedHistory: Record<string, number> = {};
  for (const [date, minutes] of Object.entries(stats.history)) {
    roundedHistory[date] = Math.round(minutes);
  }

  const payload = {
    total_seconds_listened: Math.round(stats.totalSecondsListened),
    total_tracks_played: stats.totalTracksPlayed,
    active_days_count: stats.activeDaysCount,
    listening_history: roundedHistory,
  };

  await syncWrite(
    { kind: "stats:update", at: Date.now(), payload },
    async (userId) => {
      const client = requireSupabase();
      const { error } = await client
        .from("user_stats")
        .upsert({ user_id: userId, ...payload }, { onConflict: "user_id" });

      if (error) throw error;
    },
  );
}
