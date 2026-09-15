import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

import { useT } from "../../i18n/useT";
import { RARITY_GLOW } from "../../lib/achievements";
import type { AchievementDef } from "../../lib/achievements";

/**
 * Уведомление об открытии достижения.
 *
 * Показывается сверху по центру поверх всего интерфейса и держится дольше
 * обычного тоста: достижение — событие, которое нельзя пропустить.
 * Помимо появления карточки по ней проходит световой блик, а вокруг иконки
 * расходятся волны — так уведомление заметно даже боковым зрением.
 */

export function AchievementToast({
  achievement,
}: {
  achievement: AchievementDef;
}) {
  const { t } = useT();
  const glow = RARITY_GLOW[achievement.rarity];

  return (
    <div className="pointer-events-auto relative w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-[color:var(--accent-border)] bg-[#0b0a12]/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
      {/* Свечение по редкости достижения */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: `inset 0 0 ${30 + glow * 40}px var(--accent-glow)` }}
      />

      {/* Блик, пробегающий по карточке */}
      <motion.div
        aria-hidden="true"
        initial={{ x: "-120%" }}
        animate={{ x: "120%" }}
        transition={{ duration: 1.4, delay: 0.25, ease: "easeInOut" }}
        className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/18 to-transparent"
      />

      <div className="relative flex items-center gap-3.5 px-4 py-3.5">
        <div className="relative shrink-0">
          {/* Расходящиеся волны вокруг иконки */}
          {[0, 1].map((index) => (
            <motion.span
              key={index}
              aria-hidden="true"
              initial={{ opacity: 0.55, scale: 1 }}
              animate={{ opacity: 0, scale: 1.7 }}
              transition={{
                duration: 1.6,
                delay: index * 0.35,
                ease: "easeOut",
              }}
              className="pointer-events-none absolute inset-0 rounded-xl border border-[color:var(--accent-border)]"
            />
          ))}

          <motion.img
            src={achievement.icon}
            alt=""
            draggable={false}
            initial={{ scale: 0.6, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            className="h-14 w-14 rounded-xl object-cover"
            style={{ filter: `drop-shadow(0 0 ${10 + glow * 12}px var(--accent-glow))` }}
          />
        </div>

        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-purple-200/70">
            <Sparkles size={11} className="m-0 block shrink-0" />
            {t("achievement.unlocked.title")}
          </p>

          <p className="mt-0.5 truncate text-sm font-bold text-white">
            {t(achievement.titleKey)}
          </p>

          <p className="mt-0.5 text-[11px] text-purple-100/50">
            {t(`achievement.rarity.${achievement.rarity}`)}
          </p>
        </div>
      </div>
    </div>
  );
}
