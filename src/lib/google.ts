/**
 * Google Identity Services (One Tap).
 *
 * Скрипт `accounts.google.com/gsi/client` подключён в index.html. Здесь —
 * типобезопасная обёртка: загрузка, инициализация и получение idToken
 * вместе с nonce, который обязательно нужен Supabase для проверки токена.
 *
 * Если Client ID не задан, скрипт не загрузился (блокировщик, офлайн) или
 * Google не ответил — функции возвращают отказ, а UI показывает понятную
 * ошибку. Никаких тихих подмен на другие способы входа: человек должен
 * понимать, каким аккаунтом он входит.
 */

/** OAuth Client ID из Google Cloud Console (тип Web). */
export const GOOGLE_CLIENT_ID = (
  import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""
).trim();

/** Настроен ли One Tap (задан Client ID). */
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
    /** Nonce, который Google встроит в id_token для защиты от повтора. */
    nonce?: string;
    /** Как рисовать кнопку в режиме renderButton. */
    button_auto_select?: boolean;
  }) => void;
  prompt: (
    momentListener?: (notification: {
      isNotDisplayed?: () => boolean;
      isSkippedMoment?: () => boolean;
      isDismissedMoment?: () => boolean;
      getNotDisplayedReason?: () => string;
      getSkippedReason?: () => string;
      getDismissedReason?: () => string;
    }) => void,
  ) => void;
  /**
   * Рисует официальную кнопку Google в указанном контейнере.
   *
   * Ключевой момент: эта кнопка НЕ зависит от FedCM. Она открывает обычное
   * всплывающее окно Google и работает даже там, где One Tap заблокирован
   * настройками браузера, — именно поэтому она нам нужна как запасной путь.
   */
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number;
    },
  ) => void;
  disableAutoSelect?: () => void;
};

/** Результат входа: токен и nonce, с которым он был выдан. */
export type GoogleIdTokenResult = {
  idToken: string;
  /** Сырой (нехешированный) nonce — именно его ждёт Supabase. */
  nonce: string;
};

/**
 * Генерирует одноразовый nonce.
 *
 * Значение должно быть криптостойким — берём из Web Crypto.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(32);

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Крайне старые браузеры: Math.random слабее, но nonce здесь
    // одноразовый и живёт секунды — это приемлемый компромисс.
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Считает SHA-256 от nonce.
 *
 * ВАЖНО ПО МЕХАНИКЕ NONCE (иначе вход падает с ошибкой проверки):
 *  1. Google встраивает в id_token именно ХЕШ переданного ему nonce;
 *  2. Supabase, получив СЫРОЙ nonce, хеширует его сам и сверяет с токеном.
 *
 * Поэтому в Google уходит хеш, а в Supabase — сырое значение. Если отправить
 * в Google сырой nonce, получится SHA256(SHA256(nonce)) против SHA256(nonce)
 * — проверка не сойдётся.
 */
async function hashNonce(nonce: string): Promise<string> {
  const encoded = new TextEncoder().encode(nonce);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

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

/**
 * Показывает One Tap и возвращает id-токен вместе с nonce.
 *
 * Nonce генерируется здесь, передаётся в Google (он встраивает его в токен)
 * и возвращается вызывающему — тот обязан передать его же в Supabase,
 * иначе проверка не сойдётся и вход будет отклонён.
 *
 * `null` означает, что вход не состоялся: не настроен Client ID, скрипт
 * недоступен, окно закрыто пользователем.
 */
export async function requestGoogleIdToken(): Promise<GoogleIdTokenResult | null> {
  if (!isGoogleOneTapConfigured) return null;

  const sdk = await waitForGoogleSdk();
  if (!sdk) return null;

  /*
   * Nonce создаётся заново на каждую попытку входа: он одноразовый.
   * Кэшировать его нельзя — Google отклонит повторное использование.
   */
  const nonce = generateNonce();

  /*
   * В Google уходит ХЕШ nonce, в Supabase потом уйдёт сырое значение.
   * Это требование связки Google + Supabase: подробности в комментарии
   * к hashNonce выше.
   */
  const hashedNonce = await hashNonce(nonce);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: GoogleIdTokenResult | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };

    // Страховка: если Google не вызовет ни callback, ни momentListener.
    const timer = window.setTimeout(() => finish(null), 12_000);

    /*
     * initialize вызывается на каждую попытку, а не один раз за сессию:
     * nonce меняется, а Google берёт его из конфигурации в момент вызова.
     * Повторная инициализация с тем же client_id безопасна.
     */
    sdk.initialize({
      client_id: GOOGLE_CLIENT_ID,
      // Именно хеш: Google встроит его в токен, и Supabase сверит со своим.
      nonce: hashedNonce,
      callback: (response) => {
        const credential = response.credential;
        // Возвращаем СЫРОЙ nonce — его ждёт signInWithIdToken.
        finish(credential ? { idToken: credential, nonce } : null);
      },
      auto_select: false,
      cancel_on_tap_outside: true,

      /*
       * FedCM отключён намеренно.
       *
       * С ним One Tap попадает под блокировку сторонних cookie и настройку
       * браузера «FedCM disabled»: окно вообще не показывается, `prompt()`
       * мгновенно уходит в `isSkippedMoment`, и пользователь видит лишь
       * «Вход отменён» — без всякой возможности войти.
       *
       * Без FedCM Google использует классический механизм, который работает
       * независимо от этой настройки. Современным браузерам это не мешает:
       * они просто показывают обычное окно выбора аккаунта.
       */
      use_fedcm_for_prompt: false,
    });

    sdk.prompt((notification) => {
      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
        /*
         * One Tap не показался. Это НЕ повод объявлять вход отменённым:
         * причин масса (FedCM, блокировщик, отсутствие аккаунта в браузере,
         * слишком частые вызовы). Возвращаем null, а UI предложит кнопку
         * Google — она работает через отдельный механизм.
         */
        finish(null);
      }
    });
  });
}

// ── Резервный путь: официальная кнопка Google ────────────────────────

/**
 * Создаёт сессию входа под официальную кнопку Google.
 *
 * Возвращает функцию монтирования, которой передаётся контейнер: внутри неё
 * мы генерируем nonce, инициализируем SDK и просим Google нарисовать кнопку.
 * Токен придёт в `callback` — тот же путь, что и у One Tap, поэтому Supabase
 * получает корректную пару «токен + сырой nonce».
 *
 * Почему это нужно: One Tap может быть недоступен по причинам, которые от нас
 * не зависят (FedCM, сторонние cookie, блокировщики). Кнопка Google открывает
 * обычное окно и работает в этих условиях, так что вход не остаётся сломанным.
 */
export function mountGoogleButton(
  onResult: (result: GoogleIdTokenResult | null) => void,
  options?: { width?: number },
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;

  void (async () => {
    if (!isGoogleOneTapConfigured) {
      onResult(null);
      return;
    }

    const sdk = await waitForGoogleSdk();
    if (cancelled) return;

    if (!sdk) {
      onResult(null);
      return;
    }

    /*
     * Nonce нужен до отрисовки кнопки: Google встраивает его в токен в момент
     * клика, беря из конфигурации initialize. Поэтому сессия создаётся здесь,
     * а не в обработчике нажатия.
     *
     * Если кнопку смонтируют заново, сгенерируется новый nonce — прежний
     * к этому моменту уже неактуален, и это правильно.
     */
    const nonce = generateNonce();
    const hashedNonce = await hashNonce(nonce);

    if (cancelled) return;

    const container = document.createElement("div");
    container.style.display = "none";
    document.body.appendChild(container);

    sdk.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: hashedNonce,
      callback: (response) => {
        const credential = response.credential;
        onResult(credential ? { idToken: credential, nonce } : null);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: false,
    });

    // Контейнер-«цель» ищется в момент вызова: он должен существовать в DOM.
    const target =
      document.getElementById("noctra-google-button") ?? container;

    sdk.renderButton(target, {
      type: "standard",
      theme: "filled_black",
      size: "large",
      text: "signin_with",
      shape: "pill",
      logo_alignment: "left",
      width: options?.width ?? 320,
    });

    cleanup = () => {
      container.remove();
      target.replaceChildren();
    };
  })();

  return () => {
    cancelled = true;
    cleanup?.();
  };
}

/** Отключает автовыбор аккаунта (вызываем при выходе). */
export function disableGoogleAutoSelect(): void {
  window.google?.accounts?.id?.disableAutoSelect?.();
}
