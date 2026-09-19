import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  Heart,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";

import { useT } from "../../i18n/useT";
import { usePlayerStore } from "../../store/usePlayerStore";
import { TrackCover } from "../tracks/TrackCover";
import type { PlaylistTrack } from "../../types/playlist";

type MobilePlayerSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
};

/**
 * Полноэкранный плеер мобильной версии (BottomSheet).
 *
 * По референсу: шторка на весь экран с крупной обложкой, названием трека,
 * прогрессом, кнопками управления и карточкой «Следующий трек». Открывается
 * тапом по мини-плееру.
 *
 * Управление жестами:
 *  - свайп вниз по шторке закрывает её (drag down to dismiss);
 *  - свайп распознаётся только при достаточной скорости или смещении,
 *    иначе шторка пружиной возвращается на место.
 *
 * Сам плеер здесь не дублируется: кнопки вызывают те же методы стора, что и
 * десктопный BottomPlayer. Звук идёт из уже играющего источника, состояние
 * не рассинхронизируется.
 */

/** Насколько нужно потянуть вниз, чтобы шторка закрылась. */
const DISMISS_OFFSET_PX = 120;

/** Скорость свайпа вниз, при которой закрываем даже без большого смещения. */
const DISMISS_VELOCITY = 500;

export function MobilePlayerSheet({
  isOpen,
  onClose,
  isFavorite,
  onToggleFavorite,
}: MobilePlayerSheetProps) {
  const { t } = useT();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const currentTrackIndex = usePlayerStore((s) => s.currentTrackIndex);
  const userQueue = usePlayerStore((s) => s.trackQueue);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const requestToggle = usePlayerStore((s) => s.requestToggle);
  const requestSeek = usePlayerStore((s) => s.requestSeek);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);
  const playMode = usePlayerStore((s) => s.playMode);

  /*
   * Что играет дальше.
   *
   * Сначала пользовательская очередь (треки, добавленные кнопкой «+»),
   * затем — остаток плейлиста после текущего трека. В режиме «по кругу»
   * список зацикливается, чтобы было видно продолжение, а не обрыв.
   */
  const upcoming = (() => {
    if (userQueue.length > 0) return userQueue;

    const next = playQueue.slice(currentTrackIndex + 1);

    if (next.length === 0 && playMode === "repeat-all" && playQueue.length > 0) {
      return playQueue;
    }

    return next;
  })();

  // Закрытие по Escape — для десктопного тестирования мобильной вёрстки.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  /*
   * Блокируем прокрутку страницы под шторкой.
   *
   * Шторка занимает весь экран, и скролл фона под ней выглядел бы как баг.
   * Возвращаем прокрутку при закрытии — иначе страница останется замороженной.
   */
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (typeof document === "undefined") return null;

  const durationSec = Number.isFinite(duration) ? duration : 0;
  const progress =
    durationSec > 0 ? Math.min((currentTime / durationSec) * 100, 100) : 0;

  return createPortal(
    <AnimatePresence>
      {isOpen && currentTrack && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col bg-[#0a0812]/95 backdrop-blur-2xl"
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          /*
           * Свайп вниз для закрытия.
           *
           * `dragConstraints={{ top: 0 }}` запрещает тянуть вверх, `elastic`
           * даёт упругое сопротивление. В `onDragEnd` смотрим смещение и
           * скорость: если потянули достаточно далеко или резко — закрываем,
           * иначе framer-motion сам вернёт шторку на место.
           */
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.4, bottom: 0.9 }}
          onDragEnd={(_, info) => {
            if (
              info.offset.y > DISMISS_OFFSET_PX ||
              info.velocity.y > DISMISS_VELOCITY
            ) {
              onClose();
            }
          }}
        >
          {/* Ручка шторки */}
          <div className="flex shrink-0 justify-center pb-1 pt-3">
            <span className="h-1 w-10 rounded-full bg-white/20" />
          </div>

          {/* Шапка */}
          <div className="flex shrink-0 items-center justify-between px-4 py-2">
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="rounded-full p-2 text-purple-100/60 transition hover:bg-white/10 hover:text-white"
            >
              <ChevronDown size={22} className="m-0 block" />
            </button>
            <p className="text-[11px] uppercase tracking-[0.24em] text-purple-100/40">
              {t("mobile.sheet.nowPlaying")}
            </p>
            <span className="w-10" />
          </div>

          {/* Обложка */}
          <div className="flex min-h-0 flex-1 items-center justify-center px-8">
            <motion.div
              className="w-full max-w-[320px] overflow-hidden rounded-[28px] border border-white/15 shadow-2xl shadow-black/60"
              style={{ boxShadow: "0 0 60px var(--accent-glow)", touchAction: "none" }}
              /*
               * Свайп по обложке — предыдущий/следующий трек.
               *
               * `dragPropagation={false}` — ключевая деталь: без него жест
               * всплывал бы до контейнера шторки, который закрывается свайпом
               * вниз, и горизонтальное движение по обложке начинало тянуть
               * всю шторку. Теперь обложка забирает жест себе.
               *
               * Пороги те же, что на мини-плеере, — жесты ощущаются одинаково.
               */
              drag="x"
              dragPropagation={false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.4}
              onDragEnd={(_, info) => {
                if (info.offset.x < -50 || info.velocity.x < -300) {
                  playNext();
                } else if (info.offset.x > 50 || info.velocity.x > 300) {
                  playPrevious();
                }
              }}
            >
              <TrackCover
                track={currentTrack}
                size="aspect-square h-auto w-full"
              />
            </motion.div>
          </div>

          {/* Название + лайк */}
          <div className="flex shrink-0 items-center gap-3 px-6">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-bold text-white">
                {currentTrack.title}
              </p>
              <p className="truncate text-sm text-purple-100/55">
                {currentTrack.artist}
              </p>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={onToggleFavorite}
              aria-label={isFavorite ? t("player.fav.remove") : t("player.fav.add")}
              className={`shrink-0 rounded-full p-2.5 transition ${
                isFavorite
                  ? "bg-purple-500/25 text-purple-200"
                  : "text-purple-100/50 hover:text-white"
              }`}
            >
              <Heart
                size={20}
                className={`m-0 block ${isFavorite ? "fill-purple-300" : ""}`}
              />
            </motion.button>
          </div>

          {/* Прогресс */}
          <div className="flex shrink-0 items-center gap-3 px-6 pt-4 text-[11px] tabular-nums text-purple-100/40">
            <span>{formatClock(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={durationSec || 0}
              step={0.1}
              value={Math.min(currentTime, durationSec || 0)}
              onChange={(event) => requestSeek(Number(event.target.value))}
              disabled={durationSec <= 0}
              className="noctra-range flex-1"
              style={{ "--range-progress": `${progress}%` } as React.CSSProperties}
            />
            <span>
              {durationSec > 0 ? formatClock(durationSec) : currentTrack.duration}
            </span>
          </div>

          {/* Управление */}
          <div className="flex shrink-0 items-center justify-center gap-7 py-5">
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => usePlayerStore.getState().cyclePlayMode()}
              aria-label={t("player.mode.shuffle")}
              className={`transition ${
                playMode !== "sequence"
                  ? "text-purple-200"
                  : "text-purple-100/40 hover:text-white"
              }`}
            >
              <Shuffle size={20} className="m-0 block" />
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={playPrevious}
              aria-label={t("player.previous")}
              className="text-white transition hover:text-purple-200"
            >
              <SkipBack size={28} className="m-0 block fill-current" />
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={requestToggle}
              aria-label={t("player.playpause")}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-xl"
              style={{ boxShadow: "0 0 32px var(--accent-glow)" }}
            >
              {isPlaying ? (
                <Pause size={26} className="m-0 block fill-current" />
              ) : (
                <Play size={26} className="m-0 block fill-current" />
              )}
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={playNext}
              aria-label={t("player.next")}
              className="text-white transition hover:text-purple-200"
            >
              <SkipForward size={28} className="m-0 block fill-current" />
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => usePlayerStore.getState().cyclePlayMode()}
              aria-label={t("player.mode.repeat-all")}
              className={`transition ${
                playMode !== "sequence"
                  ? "text-purple-200"
                  : "text-purple-100/40 hover:text-white"
              }`}
            >
              <Repeat size={20} className="m-0 block" />
            </motion.button>
          </div>

          {/* Очередь воспроизведения */}
          <QueueSection
            upcoming={upcoming}
            playQueue={playQueue}
            currentTrackIndex={currentTrackIndex}
            trackQueue={userQueue}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function formatClock(seconds: number): string {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Очередь воспроизведения в шторке.
 *
 * Показывает, что будет играть дальше: пользовательская очередь (треки,
 * добавленные кнопкой «+») либо остаток плейлиста. Без этого в мобильном
 * плеере было непонятно, что после текущего трека — особенно когда очередь
 * собиралась вручную.
 *
 * Список свёрнут по умолчанию: шторка и без него плотная, а очередь нужна
 * не всегда. Разворачивается тапом по заголовку, счётчик виден сразу.
 */
function QueueSection({
  upcoming,
  playQueue,
  currentTrackIndex,
  trackQueue,
}: {
  upcoming: PlaylistTrack[];
  playQueue: PlaylistTrack[];
  currentTrackIndex: number;
  trackQueue: PlaylistTrack[];
}) {
  const { t } = useT();
  const [isExpanded, setIsExpanded] = useState(false);

  // Текущий трек — чтобы показать его первым в полном списке очереди.
  const currentTrack = playQueue[currentTrackIndex] ?? null;

  // Показываем либо пользовательскую очередь, либо остаток плейлиста.
  const list = upcoming;
  const total = list.length;

  if (total === 0 && !currentTrack) return null;

  return (
    <div className="shrink-0 px-6 pb-8">
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        className="mb-2 flex w-full items-center justify-between text-left"
      >
        <span className="text-[11px] uppercase tracking-[0.2em] text-purple-100/40">
          {trackQueue.length > 0
            ? t("mobile.sheet.userQueue")
            : t("mobile.sheet.queue")}
        </span>

        <span className="flex items-center gap-1.5 text-[11px] text-purple-100/45">
          {total}
          <ChevronDown
            size={14}
            className={`m-0 block transition-transform duration-300 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {/*
        Список очереди.
        
        Высота ограничена (`max-h-52`) и прокручивается: в плейлисте может
        быть сотня треков, и растягивать шторку на всю длину нельзя —
        кнопки управления уехали бы за экран.
      */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
              {total === 0 ? (
                <p className="py-3 text-center text-xs text-purple-100/35">
                  {t("mobile.sheet.queueEmpty")}
                </p>
              ) : (
                list.map((track, index) => (
                  <button
                    key={`${track.id}-${index}`}
                    type="button"
                    onClick={() =>
                      usePlayerStore.getState().selectQueueTrack(track)
                    }
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-left transition hover:bg-white/[0.08]"
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl">
                      <TrackCover track={track} size="h-9 w-9" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">
                        {track.title}
                      </p>
                      <p className="truncate text-[11px] text-purple-100/50">
                        {track.artist}
                      </p>
                    </div>

                    <span className="shrink-0 text-[11px] tabular-nums text-purple-100/35">
                      {track.duration}
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
