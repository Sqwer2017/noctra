import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";

import type { PlaylistTrack } from "../../types/playlist";
import { useT } from "../../i18n/useT";

type TrackFocusModalProps = {
  track: PlaylistTrack | null;
  isOpen: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
};

const CARD_SIZE = 380;

/**
 * Focus Mode: 3D-«голографическая» карточка трека.
 * Обложка вылетает из плеера (shared layoutId) и превращается в крупную
 * интерактивную карточку с наклоном за курсором и бликом.
 */
export function TrackFocusModal({
  track,
  isOpen,
  isPlaying,
  onTogglePlay,
  onNext,
  onPrevious,
  onClose,
}: TrackFocusModalProps) {
  const { t } = useT();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50 });

  // Esc — закрыть
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (typeof document === "undefined") return null;

  const layoutId = track ? `cover-${track.id}` : "cover-empty";

  function handleMouseMove(event: React.MouseEvent) {
    const el = cardRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width; // 0..1
    const py = (event.clientY - rect.top) / rect.height;

    // Наклон: центр — 0, края — ±12°.
    const ry = (px - 0.5) * 24;
    const rx = (0.5 - py) * 24;

    setTilt({ rx, ry, mx: px * 100, my: py * 100 });
  }

  function resetTilt() {
    setTilt({ rx: 0, ry: 0, mx: 50, my: 50 });
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && track && (
        <motion.div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 bg-black/70 px-4 backdrop-blur-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
          onClick={onClose}
        >
          {/* 3D-карточка */}
          <div
            style={{ perspective: 1000 }}
            className="flex flex-col items-center gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              ref={cardRef}
              layoutId={layoutId}
              onMouseMove={handleMouseMove}
              onMouseLeave={resetTilt}
              style={{
                width: CARD_SIZE,
                height: CARD_SIZE,
                transformStyle: "preserve-3d",
                transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
                transition: "transform 120ms ease-out",
              }}
              className="relative overflow-hidden rounded-[32px] border border-white/15 bg-black shadow-2xl shadow-black/60"
            >
              {track.coverUrl ? (
                <img
                  src={track.coverUrl}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,var(--accent-glow),rgba(20,14,32,0.95))] text-6xl font-bold text-white/80">
                  {track.title?.[0]?.toUpperCase() ?? "♪"}
                </div>
              )}

              {/* Голографический блик, следующий за курсором */}
              <div
                className="pointer-events-none absolute inset-0 mix-blend-overlay"
                style={{
                  background: `radial-gradient(circle at ${tilt.mx}% ${tilt.my}%, rgba(255,255,255,0.55), rgba(255,255,255,0) 45%), linear-gradient(120deg, rgba(255,0,200,0.18), rgba(0,220,255,0.18))`,
                }}
              />

              {/* Тонкая рамка-перелив */}
              <div className="pointer-events-none absolute inset-0 rounded-[32px] ring-1 ring-inset ring-white/10" />
            </motion.div>

            {/* Детали трека */}
            <div className="text-center">
              <p className="max-w-[420px] truncate text-2xl font-bold text-white">
                {track.title}
              </p>
              <p className="mt-1 text-sm text-purple-100/60">
                {track.artist} · {track.source}
              </p>
            </div>

            {/* Мини-контролы */}
            <div className="flex items-center gap-5">
              <button
                onClick={onPrevious}
                className="text-purple-100/60 transition hover:text-white"
                title={t("player.previous")}
              >
                <SkipBack size={22} />
              </button>

              <button
                onClick={onTogglePlay}
                className="rounded-full bg-purple-500/30 p-4 text-white shadow-lg shadow-purple-950/40 transition hover:bg-purple-500/45"
                title={t("player.playpause")}
              >
                {isPlaying ? <Pause size={22} /> : <Play size={22} />}
              </button>

              <button
                onClick={onNext}
                className="text-purple-100/60 transition hover:text-white"
                title={t("player.next")}
              >
                <SkipForward size={22} />
              </button>
            </div>
          </div>

          {/* Кнопка закрытия */}
          <button
            onClick={onClose}
            className="absolute right-6 top-6 rounded-full border border-white/10 bg-black/50 p-3 text-purple-100/70 backdrop-blur transition hover:bg-white/10 hover:text-white"
            title={t("player.closeFocus")}
          >
            <X size={20} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
