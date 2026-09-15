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

/**
 * Приводит адрес проекта к базовому виду.
 *
 * Supabase Dashboard показывает URL в разных местах по-разному, и легко
 * скопировать его вместе с путём API — например
 * `https://xxx.supabase.co/rest/v1/`. Но клиент сам добавляет `/rest/v1/`
 * и `/auth/v1/` к базовому адресу, поэтому такой URL даёт
 * `/rest/v1/rest/v1/profiles` → 404, а вход уходит на
 * `/rest/v1/auth/v1/token` и не работает вообще.
 *
 * Здесь мы отрезаем всё после домена: остаётся только
 * `https://<project>.supabase.co`. Лишние слэши тоже убираются.
 */
function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);

    // Отбрасываем путь, query и hash — клиенту нужен только origin.
    // Исключение: если проект развёрнут на своём домене с подпутём,
    // такие пути всё равно не являются API-префиксами Supabase.
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    // Не распознали как URL — отдаём как есть, чтобы ошибка была видна
    // в консоли, а не превращалась в молчаливый локальный режим.
    return trimmed.replace(/\/+$/, "");
  }
}

const supabaseUrl = normalizeSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL ?? "",
);
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

/*
 * Диагностика при старте.
 *
 * Раньше при незаполненных переменных приложение молча уходило в локальный
 * режим, и понять, почему «данные не синхронизируются», было невозможно.
 * Теперь в консоли видно точную причину.
 */
if (typeof console !== "undefined") {
  if (isSupabaseConfigured) {
    console.info(`[supabase] облачный режим: ${supabaseUrl}`);
  } else {
    const missing = [
      !supabaseUrl && "VITE_SUPABASE_URL",
      !supabaseAnonKey && "VITE_SUPABASE_ANON_KEY",
    ].filter(Boolean);

    console.warn(
      `[supabase] локальный режим — данные НЕ уходят в базу. Не задано: ${missing.join(", ")}. ` +
        "Добавь переменные в .env.local (локально) или в Environment Variables (Vercel) и перезапусти сборку.",
    );
  }
}

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
