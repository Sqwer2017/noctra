import { supabase, isSupabaseConfigured } from "../supabase";

/**
 * Достижения пользователя.
 *
 * Выдаёт их база (SQL-триггер в миграции 005) — клиент только читает
 * результат и показывает. Такое разделение не даёт подделать достижения
 * через DevTools и избавляет от дублирования логики условий в JS.
 *
 * Прогресс у каждого свой: таблица `user_achievements` привязана к
 * `auth.uid()`, чужие записи RLS не отдаёт.
 */

/** Коды достижений, открытых текущим пользователем. */
export async function fetchUnlockedAchievements(): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("user_achievements")
    .select("achievement_id, unlocked_at")
    .eq("user_id", userId)
    .order("unlocked_at", { ascending: false });

  if (error) {
    // Таблицы может не быть, если миграция 005 не применена — не роняем UI.
    console.warn("[achievements] не удалось прочитать:", error.message);
    return [];
  }

  return (data ?? []).map((row) => row.achievement_id as string);
}

/**
 * Запускает проверку достижений на стороне базы.
 *
 * Обычно они выдаются автоматически триггерами при записи статистики,
 * но при первом входе (или после начисления, которое прошло локально)
 * полезно попросить базу пересчитать условия.
 */
export async function requestAchievementCheck(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const { error } = await supabase.rpc("check_achievements_for_me");

  if (error) {
    // RPC может отсутствовать до применения миграции — это не критично,
    // триггеры всё равно сработают при следующей записи статистики.
    console.info("[achievements] пересчёт недоступен:", error.message);
  }
}
