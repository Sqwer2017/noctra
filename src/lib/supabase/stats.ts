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
  /** Полностью прослушанные треки по дням. */
  tracksByDay: Record<string, number>;
  /** Добавления в избранное по дням. */
  favoritesByDay: Record<string, number>;
  /** Рекордные счётчики достижений. */
  nightPlays: number;
  maxSessionSeconds: number;
  repeatLoops: number;
  shuffleStreak: number;
  sources: string[];
};

/** Список колонок статистики — один на чтение и запись. */
const STATS_COLUMNS = [
  "total_seconds_listened",
  "total_tracks_played",
  "active_days_count",
  "listening_history",
  "daily_tracks",
  "daily_favorites",
  "night_plays",
  "max_session_seconds",
  "repeat_loops",
  "shuffle_streak",
  "source_list",
].join(", ");

export async function fetchListeningStats(
  userId: string,
): Promise<ListeningStats | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from("user_stats")
    .select(STATS_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle<{
      total_seconds_listened: number;
      total_tracks_played: number;
      active_days_count: number;
      listening_history: Record<string, number> | null;
      daily_tracks: Record<string, number> | null;
      daily_favorites: Record<string, number> | null;
      night_plays: number | null;
      max_session_seconds: number | null;
      repeat_loops: number | null;
      shuffle_streak: number | null;
      source_list: string[] | null;
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
    tracksByDay: data.daily_tracks ?? {},
    favoritesByDay: data.daily_favorites ?? {},
    nightPlays: Number(data.night_plays ?? 0),
    maxSessionSeconds: Number(data.max_session_seconds ?? 0),
    repeatLoops: Number(data.repeat_loops ?? 0),
    shuffleStreak: Number(data.shuffle_streak ?? 0),
    sources: Array.isArray(data.source_list) ? data.source_list : [],
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
  /** Минуты прослушивания округляем: дробные значения в базе не нужны. */
  const roundMinutes = (source: Record<string, number>) => {
    const result: Record<string, number> = {};
    for (const [date, value] of Object.entries(source)) {
      result[date] = Math.round(value);
    }
    return result;
  };

  const payload = {
    total_seconds_listened: Math.round(stats.totalSecondsListened),
    total_tracks_played: stats.totalTracksPlayed,
    active_days_count: stats.activeDaysCount,
    listening_history: roundMinutes(stats.history),
    // Счётчики целые по определению, но защищаемся от дробей в истории.
    daily_tracks: roundMinutes(stats.tracksByDay),
    daily_favorites: roundMinutes(stats.favoritesByDay),
    night_plays: stats.nightPlays,
    max_session_seconds: stats.maxSessionSeconds,
    repeat_loops: stats.repeatLoops,
    shuffle_streak: stats.shuffleStreak,
    source_list: stats.sources,
    // Производное от списка: SQL-триггер сравнивает число с порогом.
    source_kinds: stats.sources.length,
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
