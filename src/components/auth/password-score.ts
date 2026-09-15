/**
 * Оценка надёжности пароля.
 *
 * Отдельный модуль (не рядом с компонентом), потому что этой функцией
 * пользуются двое: индикатор в форме и валидация перед регистрацией.
 * Файл специально назван без совпадения по регистру с `PasswordStrength.tsx` —
 * на Windows и macOS файловая система регистронезависима, и такие имена
 * конфликтуют при сборке.
 *
 * Оценка намеренно простая и предсказуемая: длина + разнообразие символов.
 * Цель — не аудит безопасности, а подсказка при регистрации, чтобы
 * пользователь не оставил пароль из четырёх цифр.
 */

export type PasswordStrengthLevel = "weak" | "medium" | "strong";

export function scorePassword(password: string): PasswordStrengthLevel {
  if (!password) return "weak";

  let score = 0;

  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return "weak";
  if (score <= 3) return "medium";
  return "strong";
}
