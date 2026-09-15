import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useT } from "../../i18n/useT";
import { signInAnonymously, signInWithGoogle } from "../../services/auth";
import { GoogleButton } from "./GoogleButton";

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

              <div className="mt-6 space-y-3">
                <GoogleButton
                  onClick={() => void handleGoogle()}
                  isLoading={isBusy}
                  label={t("auth.signInWithGoogle")}
                />

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

