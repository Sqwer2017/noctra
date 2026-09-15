/**
 * Google Identity Services (One Tap).
 *
 * Скрипт `accounts.google.com/gsi/client` подключён в index.html. Здесь —
 * типобезопасная обёртка: загрузка, инициализация и получение idToken.
 *
 * Важно: если Client ID не задан, скрипт не загрузился (блокировщик,
 * офлайн) или Google не ответил — все функции возвращают null/отказ.
 * Вызывающий код в этом случае уходит на редирект-вариант OAuth, поэтому
 * вход через Google работает в любом случае.
 */

/** OAuth Client ID из Google Cloud Console (тип Web). */
export const GOOGLE_CLIENT_ID = (
  import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""
).trim();

/** Настроен ли One Tap. Без Client ID используем редирект-флоу. */
export const isGoogleOneTapConfigured = Boolean(GOOGLE_CLIENT_ID);

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  prompt: (
    momentListener?: (notification: {
      isNotDisplayed?: () => boolean;
      isSkippedMoment?: () => boolean;
      getNotDisplayedReason?: () => string;
    }) => void,
  ) => void;
  disableAutoSelect?: () => void;
};

type GoogleNamespace = {
  accounts?: {
    id?: GoogleAccountsId;
  };
};

declare global {
  interface Window {
    google?: GoogleNamespace;
  }
}

/** Ждёт появления window.google.accounts.id (скрипт грузится с async defer). */
function waitForGoogleSdk(timeoutMs = 6000): Promise<GoogleAccountsId | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  const existing = window.google?.accounts?.id;
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const startedAt = Date.now();

    const poll = window.setInterval(() => {
      const sdk = window.google?.accounts?.id;

      if (sdk) {
        window.clearInterval(poll);
        resolve(sdk);
        return;
      }

      // Не ждём бесконечно: при блокировке скрипта промис должен разрешиться,
      // иначе кнопка входа «зависнет».
      if (Date.now() - startedAt > timeoutMs) {
        window.clearInterval(poll);
        resolve(null);
      }
    }, 200);
  });
}

let isInitialized = false;

/**
 * Показывает One Tap. Возвращает idToken или null, если Google не предложил
 * вход (не настроен, отклонён пользователем, скрипт недоступен).
 */
export async function requestGoogleIdToken(): Promise<string | null> {
  if (!isGoogleOneTapConfigured) return null;

  const sdk = await waitForGoogleSdk();
  if (!sdk) return null;

  return new Promise((resolve) => {
    let settled = false;

    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(token);
    };

    // Страховка: если Google не вызовет ни callback, ни momentListener.
    const timer = window.setTimeout(() => finish(null), 12_000);

    if (!isInitialized) {
      sdk.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => finish(response.credential ?? null),
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
      });
      isInitialized = true;
    }

    sdk.prompt((notification) => {
      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
        finish(null);
      }
    });
  });
}

/** Отключает автовыбор аккаунта (вызываем при выходе). */
export function disableGoogleAutoSelect(): void {
  window.google?.accounts?.id?.disableAutoSelect?.();
}
