import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { useT } from "../../i18n/useT";
import {
  mountGoogleButton,
  requestGoogleIdToken,
  isGoogleOneTapConfigured,
} from "../../lib/google";
import type { GoogleIdTokenResult } from "../../lib/google";
import { signInWithGoogleIdToken } from "../../services/auth";
import { GoogleGlyph } from "./GoogleGlyph";

/**
 * Кнопка входа через Google с двумя путями.
 *
 * 1. Сначала пробуем One Tap (`prompt()`): он входит в одно нажатие, без окон.
 * 2. Если One Tap недоступен — показываем официальную кнопку Google.
 *
 * Второй путь принципиален. One Tap зависит от FedCM и сторонних cookie,
 * которые браузер может заблокировать: тогда окно не появляется вовсе, и без
 * резервного варианта вход просто перестаёт работать, хотя аккаунт исправен.
 * Кнопка Google использует другой механизм и в этих условиях работает.
 *
 * Пока идёт попытка One Tap, кнопка показывает «Загрузка»: иначе пользователь
 * успел бы нажать второй раз и запустил два параллельных входа.
 */

type GoogleSignInButtonProps = {
  onSuccess: () => void;
  onError: (code: string) => void;
  /** Ширина официальной кнопки Google (она принимает только пиксели). */
  width?: number;
};

export function GoogleSignInButton({
  onSuccess,
  onError,
  width = 320,
}: GoogleSignInButtonProps) {
  const { t } = useT();
  const [phase, setPhase] = useState<"idle" | "onetap" | "button" | "busy">(
    "idle",
  );
  const hostRef = useRef<HTMLDivElement | null>(null);

  /** Завершает вход по токену: обмен на сессию Supabase. */
  const complete = useCallback(
    async (result: GoogleIdTokenResult | null) => {
      if (!result) {
        onError("google_cancelled");
        setPhase("button");
        return;
      }

      setPhase("busy");

      const outcome = await signInWithGoogleIdToken(result.idToken, result.nonce);

      if (!outcome.ok) {
        onError(outcome.code);
        setPhase("button");
        return;
      }

      onSuccess();
    },
    [onError, onSuccess],
  );

  /** Попытка входа через One Tap. */
  const tryOneTap = useCallback(async () => {
    if (!isGoogleOneTapConfigured) {
      setPhase("button");
      return;
    }

    setPhase("onetap");

    const result = await requestGoogleIdToken();

    if (result) {
      await complete(result);
      return;
    }

    /*
     * One Tap не показался — не считаем это отказом пользователя.
     * Переходим на официальную кнопку, которая работает без FedCM.
     */
    setPhase("button");
  }, [complete]);

  /*
   * Рисуем официальную кнопку Google, когда выбран этот путь.
   *
   * Google сам создаёт внутри контейнера <iframe> и собственную разметку, а
   * поверх неё лежит наш невидимый кликабельный слой: так сохраняется
   * фирменный вид кнопки (его нельзя подделывать) и при этом клик гарантированно
   * доходит до Google.
   */
  useEffect(() => {
    if (phase !== "button") return;

    const host = hostRef.current;
    if (!host) return;

    const target = document.createElement("div");
    target.id = "noctra-google-button";
    target.className = "flex justify-center";
    host.replaceChildren(target);

    const unmount = mountGoogleButton((result) => {
      void complete(result);
    }, { width });

    return () => {
      unmount();
      host.replaceChildren();
    };
  }, [phase, complete, width]);

  // Первая попытка — One Tap, сразу при появлении кнопки.
  useEffect(() => {
    /*
     * Откладываем на микрозадачу.
     *
     * `tryOneTap` синхронно меняет состояние (переводит кнопку в «Загрузка»),
     * а вызов setState прямо в теле эффекта вызывает лишний проход рендера.
     * Микрозадача уводит его из тела эффекта, порядок при этом не меняется:
     * One Tap стартует сразу после монтирования.
     *
     * Запускается ровно один раз: повторный вызов Google блокирует как спам.
     */
    const id = window.setTimeout(() => void tryOneTap(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLoading = phase === "onetap" || phase === "busy";

  return (
    <div className="w-full">
      {phase === "button" ? (
        <div ref={hostRef} className="flex w-full justify-center" />
      ) : (
        <button
          type="button"
          onClick={() => void tryOneTap()}
          disabled={isLoading}
          className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/20 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition-all duration-300 hover:border-white/40 hover:shadow-[0_0_28px_-6px_rgba(255,255,255,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/[0.07] to-transparent transition-transform duration-700 group-hover:translate-x-full"
          />

          {isLoading ? (
            <Loader2 size={17} className="relative animate-spin" />
          ) : (
            <GoogleGlyph />
          )}

          <span className="relative">{t("auth.signInWithGoogle")}</span>
        </button>
      )}

      {/* Пояснение на резервном пути: человек должен понимать, почему
          вместо One Tap появилась кнопка Google. */}
      {phase === "button" && (
        <p className="mt-2 text-center text-[11px] leading-4 text-purple-100/40">
          {t("auth.googleButtonHint")}
        </p>
      )}
    </div>
  );
}
