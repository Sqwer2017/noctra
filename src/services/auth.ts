import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { requestGoogleIdToken, isGoogleOneTapConfigured } from "../lib/google";

/**
 * Сервис авторизации.
 *
 * Вход через Google реализован двумя путями, и это сделано намеренно:
 *
 *  1. Google One Tap (нативный GIS) — `signInWithIdToken`. Красиво и без
 *     редиректа, но требует OAuth Client ID и доступности скрипта Google.
 *  2. Redirect OAuth через Supabase — `signInWithOAuth`. Работает всегда,
 *     когда провайдер Google включён в Supabase.
 *
 * Основная функция `signInWithGoogle()` сама выбирает путь: пробует One Tap,
 * а если он недоступен или отменён — уходит на редирект. Кнопка в UI всегда
 * рабочая и не зависит от того, завёл ли владелец Client ID.
 */

export type AuthResult =
  | { ok: true; needsEmailConfirm?: boolean; redirected?: boolean }
  | { ok: false; code: AuthErrorCode };

export type AuthErrorCode =
  | "supabase_not_configured"
  | "invalid_credentials"
  | "email_taken"
  | "weak_password"
  | "email_invalid"
  | "anonymous_disabled"
  | "rate_limited"
  | "google_cancelled"
  | "google_failed"
  | "oauth_redirect_failed"
  | "unknown";

/** Переводит ошибку Supabase в наш код. */
function mapError(error: {
  message?: string;
  status?: number;
  code?: string;
}): AuthErrorCode {
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

// ── Вход по idToken (Google One Tap) ──────────────────────────────────

export async function signInWithGoogleIdToken(
  idToken: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, code: "supabase_not_configured" };
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });

  if (error) {
    console.warn("[auth] signInWithIdToken не удался:", error.message);
    return { ok: false, code: "google_failed" };
  }

  return { ok: true };
}

// ── Вход через редирект OAuth (фоллбэк) ───────────────────────────────

export async function signInWithGoogleRedirect(): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, code: "supabase_not_configured" };
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // Возвращаемся на текущий origin: работает и на localhost, и на Vercel.
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) {
    console.warn("[auth] signInWithOAuth не удался:", error.message);
    return { ok: false, code: "oauth_redirect_failed" };
  }

  // Браузер уходит на Google — сессия появится после возврата.
  return { ok: true, redirected: true };
}

/**
 * Основной вход через Google: One Tap, при неудаче — редирект.
 *
 * Возвращаем `redirected: true`, если пользователя уводит на страницу Google
 * (тогда UI не должен показывать «успех» — страница перезагрузится сама).
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, code: "supabase_not_configured" };
  }

  if (isGoogleOneTapConfigured) {
    const idToken = await requestGoogleIdToken();

    if (idToken) {
      return signInWithGoogleIdToken(idToken);
    }

    // One Tap не показался или пользователь закрыл окно. Молча уходим на
    // редирект — так кнопка остаётся рабочей в любом окружении.
    console.info("[auth] One Tap недоступен, переходим на OAuth-редирект");
  }

  return signInWithGoogleRedirect();
}

// ── Прочие способы входа ──────────────────────────────────────────────

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
      data: { username: nick, full_name: nick },
    },
  });

  if (error) return { ok: false, code: mapError(error) };

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
