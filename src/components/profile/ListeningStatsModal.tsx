import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Headphones, TrendingUp, X } from "lucide-react";

import { useT } from "../../i18n/useT";
import { useProgressionStore } from "../../store/useProgressionStore";
import { formatListeningTime } from "../../lib/format";

type ListeningStatsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type StatsRange = "7d" | "30d" | "year" | "all";

const RANGE_DAYS: Record<StatsRange, number> = {
  "7d": 7,
  "30d": 30,
  year: 365,
  all: 365,
};

/**
 * Красиво раскрывающаяся модалка со статистикой прослушивания.
 * Все данные — реальные (progression-стор, persist в localStorage).
 */
export function ListeningStatsModal({
  isOpen,
  onClose,
}: ListeningStatsModalProps) {
  const { t } = useT();
  const totalSecondsListened = useProgressionStore((s) => s.totalSecondsListened);
  const totalTracksPlayed = useProgressionStore((s) => s.totalTracksPlayed);
  const historyMap = useProgressionStore((s) => s.historyMap);

  const [range, setRange] = useState<StatsRange>("30d");

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const activeDays = Object.keys(historyMap).length;
  const totalMinutes = totalSecondsListened / 60;

  const ranges: { id: StatsRange; label: string }[] = [
    { id: "7d", label: t("dash.range.7d") },
    { id: "30d", label: t("dash.range.30d") },
    { id: "year", label: t("dash.range.year") },
    { id: "all", label: t("dash.range.all") },
  ];

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[97] flex items-center justify-center bg-black/70 p-4 backdrop-blur-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-[720px] overflow-hidden rounded-3xl border border-white/10 bg-[#0b0a12]/95 p-6 shadow-2xl shadow-black/60"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-purple-200">
                  <Headphones size={15} />
                  {t("dash.listeningStats")}
                </p>
                <p className="mt-2 text-4xl font-extrabold text-white">
                  {formatListeningTime(totalSecondsListened, t)}
                </p>
              </div>

              <button
                onClick={onClose}
                className="rounded-full border border-white/10 bg-black/40 p-2 text-purple-100/70 transition hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Разбивка */}
            <div className="mb-5 grid grid-cols-3 gap-3">
              <MiniStat
                label={t("dash.tracksPlayed")}
                value={totalTracksPlayed.toLocaleString()}
              />
              <MiniStat
                label={t("dash.activeDays")}
                value={activeDays.toLocaleString()}
              />
              <MiniStat
                label={t("dash.avgPerDay")}
                value={formatListeningTime(
                  activeDays > 0 ? totalMinutes / activeDays : 0,
                  t,
                )}
              />
            </div>

            {/* Фильтры периода */}
            <div className="mb-4 flex flex-wrap gap-2">
              {ranges.map((item) => {
                const active = range === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setRange(item.id)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                      active
                        ? "border-purple-300/45 bg-purple-500/20 text-white"
                        : "border-white/10 bg-white/[0.03] text-purple-100/55 hover:bg-white/[0.07]"
                    }`}
                    style={
                      active
                        ? { boxShadow: "0 0 16px var(--accent-glow)" }
                        : undefined
                    }
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <HeatmapGrid historyMap={historyMap} days={RANGE_DAYS[range]} />

            <div className="mt-4 flex items-center justify-end gap-2 text-[11px] text-purple-100/40">
              <span>{t("dash.less")}</span>
              <span className="h-3 w-3 rounded-[3px] border border-white/5 bg-neutral-800/40" />
              <span className="h-3 w-3 rounded-[3px] border border-white/5 bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]" />
              <span className="h-3 w-3 rounded-[3px] border border-white/5 bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]" />
              <span
                className="h-3 w-3 rounded-[3px] bg-[var(--accent)]"
                style={{ boxShadow: "0 0 6px var(--accent-glow)" }}
              />
              <span>{t("dash.more")}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3.5">
      <p className="text-[11px] text-purple-100/45">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-lg font-bold text-white">
        <TrendingUp size={13} className="text-emerald-300" />
        {value}
      </p>
    </div>
  );
}

/** Класс интенсивности ячейки по минутам прослушивания за день. */
function heatClass(minutes: number): string {
  if (!minutes || minutes <= 0) return "bg-neutral-800/40";
  if (minutes <= 15)
    return "bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]";
  if (minutes <= 45)
    return "bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]";
  return "bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]";
}

function HeatmapGrid({
  historyMap,
  days,
}: {
  historyMap: Record<string, number>;
  days: number;
}) {
  const cells = useMemo(() => {
    const result: { date: string; minutes: number }[] = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      result.push({ date: key, minutes: historyMap[key] ?? 0 });
    }

    return result;
  }, [historyMap, days]);

  // Раскладываем по колонкам-неделям (по 7 дней).
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <div className="overflow-x-auto pb-2 noctra-scrollbar">
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => (
              <span
                key={day.date}
                title={`${day.date} · ${Math.round(day.minutes)} min`}
                className={`h-3.5 w-3.5 rounded-[3px] border border-white/5 transition hover:ring-1 hover:ring-white/30 ${heatClass(
                  day.minutes,
                )}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
