import { supabase, isSupabaseConfigured } from "../supabase";
import { nickToHandle } from "../profile";

/**
 * Аутентификация Supabase.
 *
 * Три сценария:
 *  - вход по email/паролю (существующий аккаунт);
 *  - регистрация (ник уезжает в metadata, его подхватит триггер handle_new_user);
 *  - гостевой вход (anon), чтобы человек мог пользоваться приложением без почты.
 *
 * Все ошибки возвращаются кодом, а не текстом: UI переводит их через i18n.
 */

export type AuthResult =
  | { ok: true; needsEmailConfirm?: boolean }
  | { ok: false; code: AuthErrorCode };

export type AuthErrorCode =
  | "supabase_not_configured"
  | "invalid_credentials"
  | "email_taken"
  | "weak_password"
  | "email_invalid"
  | "anonymous_disabled"
  | "rate_limited"
  | "unknown";

/** Переводит ошибку Supabase в наш код. */
function mapError(error: { message?: string; status?: number; code?: string }): AuthErrorCode {
  const message = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";

  if (message.includes("invalid login credentials")) return "invalid_credentials";
  if (message.includes("already registered") || code === "user_already_exists") {
    return "email_taken";
  }
  if (message.includes("password should be at least") || code === "weak_password") {
    return "weak_password";
  }
  if (message.includes("invalid email") || code === "email_address_invalid") {
    return "email_invalid";
  }
  if (message.includes("anonymous") && message.includes("disabled")) {
    return "anonymous_disabled";
  }
  if (error.status === 429 || message.includes("rate limit")) return "rate_limited";

  return "unknown";
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, code: "supabase_not_configured" };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, code: mapError(error) };

  return { ok: true };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  nick: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, code: "supabase_not_configured" };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Триггер handle_new_user читает username отсюда и создаёт профиль.
      data: { username: nick, tag: nickToHandle(nick) },
    },
  });

  if (error) return { ok: false, code: mapError(error) };

  // Если в проекте включено подтверждение почты, сессии ещё нет.
  return { ok: true, needsEmailConfirm: !data.session };
}

export async function signInAnonymously(): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, code: "supabase_not_configured" };
  }

  const { error } = await supabase.auth.signInAnonymously();
  if (error) return { ok: false, code: mapError(error) };

  return { ok: true };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}
