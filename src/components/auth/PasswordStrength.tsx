import { motion } from "motion/react";

import { useT } from "../../i18n/useT";
import { scorePassword } from "./password-score";
import type { PasswordStrengthLevel } from "./password-score";

/**
 * Индикатор надёжности пароля: три сегмента + подпись.
 * Логика оценки живёт в отдельном модуле (password-score.ts).
 */

const LEVELS: Record<
  PasswordStrengthLevel,
  { filled: number; color: string; glow: string; text: string }
> = {
  weak: {
    filled: 1,
    color: "bg-red-400/80",
    glow: "rgba(248,113,113,0.5)",
    text: "text-red-300/80",
  },
  medium: {
    filled: 2,
    color: "bg-amber-400/80",
    glow: "rgba(251,191,36,0.5)",
    text: "text-amber-300/80",
  },
  strong: {
    filled: 3,
    color: "bg-emerald-400/80",
    glow: "rgba(52,211,153,0.5)",
    text: "text-emerald-300/80",
  },
};

export function PasswordStrength({ password }: { password: string }) {
  const { t } = useT();

  // Пока пароль пустой — индикатор не показываем, чтобы не пугать заранее.
  if (!password) return null;

  const level = scorePassword(password);
  const config = LEVELS[level];

  return (
    <div className="mt-2 flex items-center gap-2 px-1">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"
          >
            {index < config.filled && (
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                style={{
                  transformOrigin: "left",
                  boxShadow: `0 0 10px ${config.glow}`,
                }}
                className={`h-full w-full rounded-full ${config.color}`}
              />
            )}
          </div>
        ))}
      </div>

      <span
        className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] ${config.text}`}
      >
        {t(`login.strength.${level}`)}
      </span>
    </div>
  );
}
