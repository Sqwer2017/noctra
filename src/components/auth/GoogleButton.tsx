import { Loader2 } from "lucide-react";

/**
 * Кнопка входа через Google.
 *
 * Вынесена отдельным компонентом, потому что используется и на странице входа,
 * и в модальном окне. Логотип Google рисуется фирменными цветами на белом фоне —
 * это требование их брендбука (нельзя перекрашивать знак и класть на тёмный фон).
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

/** Официальный знак Google «G» в четырёх фирменных цветах. */
export function GoogleGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="relative m-0 block shrink-0"
    >
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
