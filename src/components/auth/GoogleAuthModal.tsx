import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useT } from "../../i18n/useT";
import { isSupabaseConfigured } from "../../lib/supabase";
import { signInAnonymously, signInWithGoogle } from "../../services/auth";

/**
 * Неоновое модальное окно входа.
 *
 * Появляется для гостя, который ещё не авторизован. Основной сценарий —
 * Google, дополнительно доступны гостевой вход и обычная форма.
 */

type GoogleAuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Вызывается, когда сессия появилась (после Google или гостя). */
  onAuthenticated: () => void;
};

export function GoogleAuthModal({
  isOpen,
  onClose,
  onAuthenticated,
}: GoogleAuthModalProps) {
  const { t } = useT();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Закрытие окна. Всегда сбрасывает ошибку, чтобы следующий вход начинался
   * с чистого состояния. Объявлено до эффекта Escape, чтобы не было ссылки
   * вперёд, и стабилизировано useCallback.
   */
  const close = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  // Закрытие по Escape — привычное поведение для модалок.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  const errorText = useCallback(
    (code: string) => {
      const key = `login.error.${code}`;
      const translated = t(key);
      return translated === key ? t("login.error.unknown") : translated;
    },
    [t],
  );

  const handleGoogle = useCallback(async () => {
    setError(null);
    setIsBusy(true);

    try {
      const result = await signInWithGoogle();

      if (!result.ok) {
        setError(errorText(result.code));
        return;
      }

      // При редиректе страница перезагрузится сама — просто гасим спиннер.
      if (result.redirected) {
        onClose();
        return;
      }

      onAuthenticated();
      onClose();
    } finally {
      setIsBusy(false);
    }
  }, [errorText, onAuthenticated, onClose]);

  const handleGuest = useCallback(async () => {
    setError(null);
    setIsBusy(true);

    try {
      const result = await signInAnonymously();

      if (!result.ok) {
        setError(errorText(result.code));
        return;
      }

      onAuthenticated();
      onClose();
    } finally {
      setIsBusy(false);
    }
  }, [errorText, onAuthenticated, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={(event) => event.stopPropagation()}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-purple-300/25 bg-[#0b0a12]/95 p-6 shadow-[0_0_60px_-12px_var(--accent-glow)]"
          >
            {/* Неоновая подсветка сверху */}
            <div className="pointer-events-none absolute inset-x-0 -top-24 h-40 bg-[radial-gradient(ellipse_at_center,var(--accent-glow),transparent_65%)] opacity-70" />

            <button
              onClick={close}
              aria-label={t("auth.close")}
              className="absolute right-3 top-3 inline-flex aspect-square items-center justify-center rounded-full p-1.5 leading-none text-purple-100/50 transition hover:bg-white/10 hover:text-white"
            >
              <X size={16} className="m-0 block" />
            </button>

            <div className="relative">
              <h2 className="text-center text-xl font-bold text-white">
                {t("auth.modal.title")}
              </h2>

              <p className="mt-2 text-center text-xs leading-5 text-purple-100/50">
                {t("auth.modal.subtitle")}
              </p>

              {!isSupabaseConfigured && (
                <p className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-100/80">
                  {t("auth.modal.notConfigured")}
                </p>
              )}

              <div className="mt-6 space-y-3">
                <button
                  onClick={() => void handleGoogle()}
                  disabled={isBusy}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBusy ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <GoogleGlyph />
                  )}
                  {t("auth.signInWithGoogle")}
                </button>

                <button
                  onClick={() => void handleGuest()}
                  disabled={isBusy}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-purple-100/65 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("login.guest")}
                </button>
              </div>

              {error && (
                <p className="mt-4 rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-2.5 text-xs text-red-100/80">
                  {error}
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Фирменный знак Google (официальные цвета, как требует их брендбук). */
function GoogleGlyph() {
  return (
    <svg width={17} height={17} viewBox="0 0 48 48" aria-hidden="true" className="m-0 block">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
