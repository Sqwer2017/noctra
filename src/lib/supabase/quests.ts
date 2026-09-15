import { supabase, requireSupabase, isSupabaseConfigured } from "../supabase";
import { syncWrite } from "./sync";

/**
 * Прогресс ежедневных заданий (`daily_quests_progress`).
 *
 * Ключ строки — UNIQUE(user_id, quest_id, reset_date). `reset_date` это дата
 * в локальном формате YYYY-MM-DD: при смене дня клиент просто пишет новые
 * строки, история прошлых дней остаётся в таблице.
 */

export type QuestProgressRow = {
  quest_id: string;
  current_progress: number;
  target_progress: number;
  is_completed: boolean;
  claimed_at: string | null;
};

/** Прогресс заданий на конкретную дату. */
export async function fetchQuestProgress(
  userId: string,
  resetDate: string,
): Promise<QuestProgressRow[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  const { data, error } = await supabase
    .from("daily_quests_progress")
    .select("quest_id, current_progress, target_progress, is_completed, claimed_at")
    .eq("user_id", userId)
    .eq("reset_date", resetDate);

  if (error) {
    console.warn("[sync] не удалось прочитать квесты:", error.message);
    return [];
  }

  return (data ?? []) as QuestProgressRow[];
}

/** Сохраняет текущий прогресс задания (вызывать с дебаунсом). */
export async function pushQuestProgress(
  questId: string,
  resetDate: string,
  progress: number,
  target: number,
  isCompleted: boolean,
): Promise<void> {
  const payload = {
    quest_id: questId,
    reset_date: resetDate,
    current_progress: progress,
    target_progress: target,
    is_completed: isCompleted,
  };

  await syncWrite(
    { kind: "quest:progress", at: Date.now(), payload },
    async () => {
      const client = requireSupabase();
      const { error } = await client
        .from("daily_quests_progress")
        .upsert(payload, { onConflict: "user_id,quest_id,reset_date" });
      if (error) throw error;
    },
  );
}

/** Фиксирует сбор награды: is_completed = true, claimed_at = now(). */
export async function pushQuestClaimed(
  questId: string,
  resetDate: string,
  progress: number,
  target: number,
): Promise<void> {
  const payload = {
    quest_id: questId,
    reset_date: resetDate,
    current_progress: progress,
    target_progress: target,
    is_completed: true,
    claimed_at: new Date().toISOString(),
  };

  await syncWrite(
    { kind: "quest:claim", at: Date.now(), payload },
    async () => {
      const client = requireSupabase();
      const { error } = await client
        .from("daily_quests_progress")
        .upsert(payload, { onConflict: "user_id,quest_id,reset_date" });
      if (error) throw error;
    },
  );
}
