import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Поле ввода с «плавающим» лейблом.
 *
 * Лейбл сидит внутри поля и уезжает вверх при фокусе или непустом значении —
 * так подпись всегда видна, но не занимает отдельную строку. Ошибка выводится
 * под полем и помечает границу красным.
 *
 * Реализовано на CSS-переходе (`peer` + `placeholder-shown`), а не на состоянии
 * React: браузер сам знает про автозаполнение и вставку, поэтому подпись не
 * «залипает» при автозаполнении пароля из менеджера.
 */

type FloatingFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "password";
  icon?: ReactNode;
  autoComplete?: string;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Показать кнопку «глаз» (для паролей). */
  revealable?: boolean;
  onBlur?: () => void;
  /** Подсказка под полем справа (например, предпросмотр @handle). */
  hint?: ReactNode;
};

export function FloatingField({
  label,
  value,
  onChange,
  type = "text",
  icon,
  autoComplete,
  error,
  disabled = false,
  autoFocus = false,
  revealable = false,
  onBlur,
  hint,
}: FloatingFieldProps) {
  const id = useId();
  const [isRevealed, setIsRevealed] = useState(false);

  const resolvedType =
    revealable && isRevealed ? "text" : type;

  return (
    <div className="w-full">
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 inline-flex aspect-square -translate-y-1/2 items-center justify-center p-0 leading-none text-purple-100/35 transition-colors peer-focus:text-purple-200">
            {icon}
          </span>
        )}

        <input
          id={id}
          type={resolvedType}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          placeholder=" "
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`peer w-full rounded-2xl border bg-black/35 pb-2.5 pt-6 text-sm text-white outline-none transition-all duration-200 placeholder-shown:pt-[1.15rem] focus:bg-black/55 disabled:cursor-not-allowed disabled:opacity-50 ${
            icon ? "pl-11" : "pl-4"
          } ${revealable ? "pr-11" : "pr-4"} ${
            error
              ? "border-red-400/50 focus:border-red-400/80"
              : "border-white/10 focus:border-purple-300/50"
          }`}
        />

        {/* Плавающий лейбл: поднимается при фокусе или заполненном поле. */}
        <label
          htmlFor={id}
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-purple-100/40 transition-all duration-200 peer-focus:top-3.5 peer-focus:text-[10px] peer-focus:uppercase peer-focus:tracking-[0.14em] peer-focus:text-purple-200/70 peer-[:not(:placeholder-shown)]:top-3.5 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-[0.14em] peer-[:not(:placeholder-shown)]:text-purple-200/60 ${
            icon ? "left-11" : "left-4"
          }`}
        >
          {label}
        </label>

        {revealable && (
          <button
            type="button"
            onClick={() => setIsRevealed((current) => !current)}
            disabled={disabled}
            aria-label={isRevealed ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 inline-flex aspect-square -translate-y-1/2 items-center justify-center rounded-full p-1.5 leading-none text-purple-100/40 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            {isRevealed ? (
              <EyeOff size={15} className="m-0 block" />
            ) : (
              <Eye size={15} className="m-0 block" />
            )}
          </button>
        )}
      </div>

      {(error || hint) && (
        <div className="mt-1.5 flex items-start justify-between gap-2 px-1">
          {error ? (
            <p id={`${id}-error`} className="text-[11px] text-red-300/90">
              {error}
            </p>
          ) : (
            <span />
          )}
          {hint}
        </div>
      )}
    </div>
  );
}
