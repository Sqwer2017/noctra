import { motion } from "motion/react";

import { useT } from "../../i18n/useT";
import { RARITY_GLOW } from "../../lib/achievements";
import type { AchievementDef } from "../../lib/achievements";

/**
 * Плитка достижения в профиле.
 *
 * Закрытое достижение показывается обесцвеченной иконкой: пользователь видит,
 * что оно существует и как выглядит, но не знает условия — так интереснее
 * разгадывать. Название тоже скрыто за «???».
 *
 * Открытое — цветное, со свечением по редкости, подписано.
 */

type AchievementTileProps = {
  achievement: AchievementDef;
  isUnlocked: boolean;
  /** Прогресс 0..100 или null, если условие событийное. */
  progress: number | null;
  /** Текущее значение и цель — для подписи «47 / 100». */
  current?: number;
  delay?: number;
};

export function AchievementTile({
  achievement,
  isUnlocked,
  progress,
  current,
  delay = 0,
}: AchievementTileProps) {
  const { t } = useT();

  const glow = RARITY_GLOW[achievement.rarity];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      className="group flex flex-col items-center gap-2"
      title={
        isUnlocked
          ? t(achievement.titleKey)
          : t("achievement.hidden.hint")
      }
    >
      <div className="relative">
        {/* Свечение: только у открытых, сила зависит от редкости */}
        {isUnlocked && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{ boxShadow: `0 0 ${12 + glow * 26}px var(--accent-glow)` }}
          />
        )}

        <motion.div
          whileHover={{ scale: isUnlocked ? 1.06 : 1.02 }}
          transition={{ type: "spring", stiffness: 380, damping: 24 }}
          className={`relative h-20 w-20 overflow-hidden rounded-2xl border ${
            isUnlocked
              ? "border-[color:var(--accent-border)]"
              : "border-white/10"
          }`}
        >
          <img
            src={achievement.icon}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className={`h-full w-full object-cover transition-all duration-500 ${
              isUnlocked
                ? "brightness-110 saturate-100"
                : // Закрытое: обесцвечено и притемнено, но силуэт различим —
                  // так видно, что награда существует и к ней стоит стремиться.
                  "brightness-[0.45] contrast-[0.7] grayscale"
            }`}
          />

          {/* Затемняющая вуаль поверх закрытого достижения */}
          {!isUnlocked && (
            <div className="pointer-events-none absolute inset-0 bg-black/35" />
          )}

          {/* Блик при наведении на открытое */}
          {isUnlocked && (
            <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          )}
        </motion.div>
      </div>

      <p
        className={`line-clamp-2 text-center text-[11px] leading-tight ${
          isUnlocked ? "font-semibold text-purple-100/80" : "text-purple-100/25"
        }`}
      >
        {isUnlocked ? t(achievement.titleKey) : t("achievement.hidden")}
      </p>

      {/* Полоса прогресса: только для измеримых и ещё не полученных */}
      {!isUnlocked && progress !== null && (
        <div className="w-full px-1">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: progress / 100 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{ transformOrigin: "left" }}
              className="h-full w-full rounded-full bg-[var(--accent)]/70"
            />
          </div>

          {achievement.target !== null && current !== undefined && (
            <p className="mt-1 text-center text-[9px] tabular-nums text-purple-100/30">
              {Math.min(current, achievement.target)} / {achievement.target}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
