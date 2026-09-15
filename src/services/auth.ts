import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { requestGoogleIdToken, isGoogleOneTapConfigured } from "../lib/google";

/**
 * Сервис авторизации.
 *
 * Вход через Google — ТОЛЬКО нативный One Tap (Google Identity Services).
 *
 * Токен получаем прямо в браузере через `google.accounts.id.prompt()` и
 * передаём в Supabase как idToken. Никаких редиректов: пользователь остаётся
 * на той же странице, состояние приложения не теряется, а сам вход занимает
 * одно нажатие.
 *
 * Прежний фоллбэк на `signInWithOAuth` убран: он полностью перезагружал
 * страницу и терял состояние плеера. Если One Tap недоступен (нет Client ID,
 * скрипт заблокирован, FedCM выключен), мы честно сообщаем об этом, а не
 * подменяем способ входа — иначе человек считал бы, что вошёл через Google,
 * хотя получил другой аккаунт.
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
  | "server_error"
  | "google_cancelled"
  | "google_not_configured"
  | "google_nonce_mismatch"
  | "google_failed"
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

  /*
   * Ошибка на стороне базы при создании пользователя.
   *
   * Так выглядит сбой триггера handle_new_user: Supabase отвечает
   * HTTP 500 «Database error creating anonymous user». Со стороны клиента
   * это не отличимо от прочих сбоев, поэтому выделяем в отдельный код —
   * по нему сразу понятно, что чинить надо в SQL, а не в приложении.
   */
  if (message.includes("database error") || error.status === 500) {
    return "server_error";
  }

  return "unknown";
}

// ── Вход по idToken (Google One Tap) ──────────────────────────────────

/**
 * Обменивает Google id-токен на сессию Supabase.
 *
 * Nonce обязателен с обеих сторон: Google встраивает его в токен, а Supabase
 * сверяет с переданным. Если отправить токен без nonce (или наоборот),
 * Supabase отклонит вход с ошибкой 400:
 *   «Passed nonce and nonce in id_token should either both exist or not».
 * Именно это ломало вход раньше — токен приходил с nonce, а мы его не
 * передавали.
 */
export async function signInWithGoogleIdToken(
  idToken: string,
  nonce: string,
): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, code: "supabase_not_configured" };
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce,
  });

  if (error) {
    console.warn("[auth] signInWithIdToken не удался:", error.message);

    // Отдельно отмечаем рассинхрон nonce: это ошибка конфигурации,
    // а не отказ пользователя, и лечится она иначе.
    if (error.message.toLowerCase().includes("nonce")) {
      return { ok: false, code: "google_nonce_mismatch" };
    }

    return { ok: false, code: "google_failed" };
  }

  return { ok: true };
}

/**
 * Вход через Google — строго нативный One Tap.
 *
 * Никаких редиректов: токен получаем прямо в браузере через Google Identity
 * Services (`google.accounts.id.prompt()`) и передаём в Supabase как idToken.
 * Пользователь остаётся на той же странице, состояние приложения не теряется.
 *
 * Если One Tap недоступен (не задан Client ID, скрипт не загрузился, FedCM
 * выключен, пользователь закрыл окно) — возвращаем понятный код ошибки.
 * Молчаливая подмена другим способом входа была бы обманом: человек думал бы,
 * что вошёл через Google, хотя получил другой аккаунт.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, code: "supabase_not_configured" };
  }

  if (!isGoogleOneTapConfigured) {
    return { ok: false, code: "google_not_configured" };
  }

  const result = await requestGoogleIdToken();

  if (!result) {
    // One Tap не показался или пользователь его закрыл.
    return { ok: false, code: "google_cancelled" };
  }

  // nonce передаём вместе с токеном: Google встроил его в токен,
  // Supabase должен получить то же значение для проверки.
  return signInWithGoogleIdToken(result.idToken, result.nonce);
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
