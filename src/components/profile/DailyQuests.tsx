import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, Gift, Info, Timer, X } from "lucide-react";

import { useT } from "../../i18n/useT";
import {
  QUESTS,
  secondsUntilTomorrow,
  useProgressionStore,
} from "../../store/useProgressionStore";
import type { QuestId } from "../../store/useProgressionStore";

/**
 * Ежедневные задания: горизонтальный ряд мини-карточек с подробной модалкой,
 * зелёным состоянием «выполнено», анимацией сбора награды и кулдауном.
 */
export function DailyQuests() {
  const { t } = useT();

  const daily = useProgressionStore((s) => s.daily);
  const claimQuest = useProgressionStore((s) => s.claimQuest);
  const getQuestProgress = useProgressionStore((s) => s.getQuestProgress);

  const [infoQuest, setInfoQuest] = useState<QuestId | null>(null);
  const [claimFx, setClaimFx] = useState<{ id: QuestId; xp: number } | null>(
    null,
  );
  const [claimingId, setClaimingId] = useState<QuestId | null>(null);

  /** Награду не выдала база — показываем пояснение вместо молчания. */
  const [claimError, setClaimError] = useState<string | null>(null);

  // Общий тикающий таймер до полуночи.
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntilTomorrow());
  useEffect(() => {
    const id = window.setInterval(
      () => setSecondsLeft(secondsUntilTomorrow()),
      1000,
    );
    return () => window.clearInterval(id);
  }, []);

  const countdown = formatCountdown(secondsLeft);

  function handleClaim(id: QuestId, rewardXP: number) {
    const quest = QUESTS.find((q) => q.id === id);
    const progress = getQuestProgress(id);
    if (!quest || progress < quest.target || daily.quests[id].claimed) return;

    // 1) «Сбор опыта…» → 2) взлетающие +XP → 3) начисление и кулдаун.
    setClaimingId(id);
    setClaimFx({ id, xp: rewardXP });

    /*
     * Решение о начислении принимает база, поэтому показываем анимацию,
     * но результат берём из ответа: если награда уже была забрана (например,
     * в другой вкладке или до перезагрузки), опыт не начислится, и обещать
     * его в анимации нельзя — только если база подтвердила выдачу.
     */
    window.setTimeout(() => {
      void claimQuest(id).then((granted) => {
        setClaimingId(null);

        if (!granted) {
          // Награда не выдана — убираем анимацию и объясняем причину.
          setClaimFx(null);
          setClaimError(t("quest.claimUnavailable"));
          window.setTimeout(() => setClaimError(null), 4000);
        }
      });
    }, 550);

    window.setTimeout(() => setClaimFx(null), 1400);
  }

  const infoQuestData = infoQuest
    ? QUESTS.find((q) => q.id === infoQuest) ?? null
    : null;

  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-100/40">
        {t("quest.title")}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {QUESTS.map((quest) => {
          const progress = Math.min(getQuestProgress(quest.id), quest.target);
          const done = progress >= quest.target;
          const claimed = daily.quests[quest.id].claimed;
          const percent = Math.round((progress / quest.target) * 100);
          const isClaiming = claimingId === quest.id;
          const showFlyXp = claimFx?.id === quest.id;

          return (
            <div
              key={quest.id}
              className={`relative flex flex-col justify-between overflow-hidden rounded-xl border p-3.5 transition-colors ${
                claimed
                  ? "border-white/5 bg-white/[0.02] opacity-75"
                  : done
                    ? "animate-pulse border-emerald-500/80 bg-emerald-950/40 shadow-[0_0_25px_rgba(16,185,129,0.35)]"
                    : "border-white/5 bg-white/[0.03]"
              }`}
            >
              {/* Верх: название + «!» */}
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-bold leading-tight text-white/90">
                  {t(quest.titleKey)}
                </p>
                <button
                  onClick={() => setInfoQuest(quest.id)}
                  className="inline-flex aspect-square h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 p-0 leading-none text-neutral-400 transition hover:border-[var(--accent)] hover:text-white"
                  title={t("quest.more")}
                >
                  <Info size={11} className="m-0 block" />
                </button>
              </div>

              {/* Низ: прогресс + действие */}
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${
                      done ? "bg-emerald-400" : "bg-[var(--accent)]"
                    }`}
                    style={{
                      width: `${percent}%`,
                      boxShadow: done
                        ? "0 0 8px rgba(16,185,129,0.7)"
                        : "0 0 8px var(--accent-glow)",
                    }}
                  />
                </div>

                {done && !claimed ? (
                  <button
                    onClick={() => handleClaim(quest.id, quest.rewardXP)}
                    disabled={isClaiming}
                    className="mt-2.5 w-full rounded-lg border border-emerald-400/50 bg-emerald-500/25 px-3 py-2 text-xs font-bold text-emerald-100 shadow-[0_0_16px_rgba(16,185,129,0.45)] transition hover:bg-emerald-500/35 disabled:opacity-80"
                  >
                    {isClaiming ? t("quest.claiming") : t("quest.readyClaim")}
                  </button>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-purple-100/45">
                      {formatProgress(quest.id, progress, quest.target, t)}
                    </span>

                    {claimed ? (
                      <span className="flex items-center gap-1 text-[10px] text-purple-100/45">
                        <Timer size={11} className="m-0 block" />
                        {countdown}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-purple-100/40">
                        <Gift size={11} className="m-0 block" />+
                        {quest.rewardXP} XP
                      </span>
                    )}
                  </div>
                )}

                {claimed && (
                  <p className="mt-1 text-center text-[10px] text-purple-100/40">
                    {t("quest.availableIn")} {countdown}
                  </p>
                )}
              </div>

              {/* Анимация сбора: взлетающий +XP и галочка */}
              <AnimatePresence>
                {showFlyXp && (
                  <motion.div
                    initial={{ opacity: 1, y: 0, scale: 1 }}
                    animate={{ opacity: 0, y: -35, scale: 1.25 }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                    className="pointer-events-none absolute inset-x-0 bottom-1/2 flex items-center justify-center gap-1 text-base font-extrabold text-emerald-300"
                    style={{ textShadow: "0 0 12px rgba(16,185,129,0.9)" }}
                  >
                    <Check size={15} className="m-0 block" />+{claimFx.xp} XP
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Пояснение, если база не выдала награду: молчание выглядело бы
          как поломка кнопки. */}
      <AnimatePresence>
        {claimError && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 rounded-lg border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/80"
          >
            {claimError}
          </motion.p>
        )}
      </AnimatePresence>
      {infoQuestData && (
        <QuestInfoModal
          quest={infoQuestData}
          progress={Math.min(
            getQuestProgress(infoQuestData.id),
            infoQuestData.target,
          )}
          claimed={daily.quests[infoQuestData.id].claimed}
          countdown={countdown}
          onClose={() => setInfoQuest(null)}
        />
      )}
    </div>
  );
}

function QuestInfoModal({
  quest,
  progress,
  claimed,
  countdown,
  onClose,
}: {
  quest: { id: QuestId; titleKey: string; target: number; rewardXP: number };
  progress: number;
  claimed: boolean;
  countdown: string;
  onClose: () => void;
}) {
  const { t } = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const done = progress >= quest.target;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[98] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/80 p-5 shadow-2xl shadow-black/60"
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="text-sm font-bold text-white">{t(quest.titleKey)}</p>
            <button
              onClick={onClose}
              className="inline-flex aspect-square items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-1.5 leading-none text-purple-100/60 transition hover:bg-white/10 hover:text-white"
            >
              <X size={14} className="m-0 block" />
            </button>
          </div>

          <p className="text-xs leading-5 text-purple-100/60">
            {t(`quest.desc.${quest.id}`)}
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className="flex items-center gap-1.5 rounded-full bg-[var(--accent)]/15 px-3 py-1 text-xs font-semibold text-[var(--accent)]">
              <Gift size={12} className="m-0 block" />+{quest.rewardXP} XP
            </span>

            <span className="text-[11px] text-purple-100/50">
              {claimed
                ? `${t("quest.availableIn")} ${countdown}`
                : `${progress} / ${quest.target}`}
            </span>
          </div>

          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className={`h-full rounded-full ${
                  done ? "bg-emerald-400" : "bg-[var(--accent)]"
                }`}
                style={{
                  width: `${Math.round((progress / quest.target) * 100)}%`,
                  boxShadow: done
                    ? "0 0 8px rgba(16,185,129,0.7)"
                    : "0 0 8px var(--accent-glow)",
                }}
              />
            </div>
            <p className="mt-2 text-center text-[11px] text-purple-100/45">
              {claimed
                ? t("quest.claimed")
                : done
                  ? t("quest.ready")
                  : t("quest.inProgress")}
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

/** Подпись прогресса с единицами («4 / 30 мин», «0 / 3 трека»). */
function formatProgress(
  id: QuestId,
  progress: number,
  target: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (id === "immersion") {
    return t("quest.progressMinutes", { current: progress, target });
  }
  if (id === "collector") {
    return t("quest.progressFavorites", { current: progress, target });
  }
  return t("quest.progressTracks", { current: progress, target });
}

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
    s,
  ).padStart(2, "0")}`;
}
