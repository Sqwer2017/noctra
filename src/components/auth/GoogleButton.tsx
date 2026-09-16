import { Loader2 } from "lucide-react";

import { GoogleGlyph } from "./GoogleGlyph";

/**
 * Стилизованная кнопка входа через Google.
 *
 * Используется в модальном окне, где One Tap не нужен: там вход запускается
 * по нажатию. Логотип рисуется фирменными цветами на белом фоне — это
 * требование брендбука Google (знак нельзя перекрашивать и нельзя класть
 * на тёмный фон).
 *
 * Для страницы входа есть отдельный компонент GoogleSignInButton: он умеет
 * дополнительно показывать официальную кнопку Google, если One Tap заблокирован.
 */

type GoogleButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  label: string;
  className?: string;
};

export function GoogleButton({
  onClick,
  disabled = false,
  isLoading = false,
  label,
  className = "",
}: GoogleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/20 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition-all duration-300 hover:border-white/40 hover:shadow-[0_0_28px_-6px_rgba(255,255,255,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {/* Блик, пробегающий по кнопке при наведении */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/[0.07] to-transparent transition-transform duration-700 group-hover:translate-x-full"
      />

      {isLoading ? (
        <Loader2 size={17} className="relative animate-spin" />
      ) : (
        <GoogleGlyph />
      )}

      <span className="relative">{label}</span>
    </button>
  );
}

export { GoogleGlyph };
