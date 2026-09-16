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

/**
 * Сохраняет прогресс задания.
 *
 * `isCompleted` и `target` не передаём: и то, и другое база вычисляет сама
 * из каталога заданий. Раньше клиент присылал оба значения, и через запрос
 * можно было отметить задание выполненным, не выполнив его.
 */
export async function pushQuestProgress(
  questId: string,
  resetDate: string,
  progress: number,
): Promise<void> {
  await syncWrite(
    {
      kind: "quest:progress",
      at: Date.now(),
      payload: {
        quest_id: questId,
        reset_date: resetDate,
        current_progress: progress,
      },
    },
    async () => {
      const client = requireSupabase();
      const { error } = await client.rpc("sync_quest_progress", {
        p_quest_id: questId,
        p_reset_date: resetDate,
        p_progress: progress,
      });

      if (error) throw error;
    },
  );
}

/**
 * Забирает награду за задание.
 *
 * Решение принимает БАЗА (функция claim_quest из миграции 006), а не клиент:
 * она проверяет, что цель достигнута и награда ещё не забрана сегодня,
 * и начисляет XP атомарно, блокируя строку от параллельных вызовов.
 *
 * Раньше это решал клиент по флагу в localStorage, а запись уходила в фон.
 * Перезагрузка могла случиться раньше, чем запрос доходил до базы, — тогда
 * задание снова выглядело незабранным, и опыт начислялся повторно.
 *
 * Возвращает фактический результат: клиент обязан опираться на него,
 * а не на собственные предположения.
 */
export type QuestClaimResult = {
  granted: boolean;
  reason: "ok" | "already_claimed" | "not_completed" | "no_progress" | "error";
  awardedXp: number;
  /** Суммарный XP после начисления, если база его вернула. */
  totalXp: number | null;
};

export async function claimQuestReward(
  questId: string,
  resetDate: string,
): Promise<QuestClaimResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { granted: false, reason: "error", awardedXp: 0, totalXp: null };
  }

  const { data, error } = await supabase.rpc("claim_quest", {
    p_quest_id: questId,
    p_reset_date: resetDate,
  });

  if (error) {
    // Функции может не быть до применения миграции 006. Сообщаем наверх,
    // чтобы клиент не начислил награду у себя «на всякий случай».
    console.warn("[quests] не удалось забрать награду:", error.message);
    return { granted: false, reason: "error", awardedXp: 0, totalXp: null };
  }

  const result = (data ?? {}) as {
    granted?: boolean;
    reason?: string;
    awarded_xp?: number;
    total_xp?: number;
  };

  return {
    granted: Boolean(result.granted),
    reason: (result.reason as QuestClaimResult["reason"]) ?? "error",
    awardedXp: Number(result.awarded_xp ?? 0),
    totalXp:
      typeof result.total_xp === "number" ? Number(result.total_xp) : null,
  };
}
