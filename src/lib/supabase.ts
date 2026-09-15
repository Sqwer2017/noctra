import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Клиент Supabase.
 *
 * `VITE_SUPABASE_URL` работает как флаг:
 *   - значение задано  → облачный режим, весь прогресс синхронизируется с БД;
 *   - значение пустое  → локальный режим (localStorage), сеть не используется.
 *
 * Это позволяет держать один и тот же код для локальной разработки и деплоя:
 * переключение происходит через .env.local без правок в компонентах.
 *
 * ВАЖНО: anon-ключ публичный по задумке Supabase, доступ к данным ограничен
 * политиками RLS на стороне БД. Service-role ключ сюда класть нельзя.
 */

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/** Настроен ли облачный режим (есть URL и ключ). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** Понятная ошибка для случаев, когда облако не настроено, а код его требует. */
export const SUPABASE_NOT_CONFIGURED = "supabase_not_configured";

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Возвращает клиент или бросает ошибку.
 *
 * Используется в адаптерах: вызывающий код решает, как реагировать на
 * отсутствие облака (обычно — молча остаться в локальном режиме).
 */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error(SUPABASE_NOT_CONFIGURED);
  return supabase;
}
