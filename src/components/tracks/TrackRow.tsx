import { memo, useCallback, useState } from "react";
import { Heart, ListPlus, Pause, Play, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";

import type { PlaylistTrack } from "../../types/playlist";
import { TrackCover } from "./TrackCover";
import { useT } from "../../i18n/useT";
import { toast } from "../ui/Toast";

type TrackRowProps = {
  track: PlaylistTrack;
  queue?: PlaylistTrack[];
  isFavorite?: boolean;
  /** Трек сейчас активен в плеере. */
  isCurrent?: boolean;
  /** Плеер играет (для активного трека). */
  isPlaying?: boolean;
  onPlay?: (track: PlaylistTrack, queue?: PlaylistTrack[]) => void;
  /** Клик по активной карточке — пауза/возобновление. */
  onTogglePlay?: () => void;
  onAdd?: (track: PlaylistTrack) => void;
  /** Пуш трека в пользовательскую очередь воспроизведения (свайп вправо). */
  onQueue?: (track: PlaylistTrack) => void;
  /** Переключить избранное (свайп влево). */
  onToggleFavoriteTrack?: (track: PlaylistTrack) => void;
  onToggleFavorite?: (track: PlaylistTrack) => void;
  onRemove?: (track: PlaylistTrack) => void;
  addTitle?: string;
  removeTitle?: string;
};

const SWIPE_THRESHOLD = 70;

/**
 * Карточка трека.
 *
 * Обёрнута в `memo`: во время воспроизведения родитель перерисовывается на каждый
 * тик плеера, и без мемоизации перерисовывались бы все карточки списка. Ререндер
 * происходит только когда меняется сам трек, его статус (активный / пауза) или
 * статус лайка — колбэки родитель обязан оборачивать в `useCallback`.
 */
export const TrackRow = memo(function TrackRow({
  track,
  queue,
  isFavorite = false,
  isCurrent = false,
  isPlaying = false,
  onPlay,
  onTogglePlay,
  onAdd,
  onQueue,
  onToggleFavoriteTrack,
  onToggleFavorite,
  onRemove,
  addTitle,
  removeTitle,
}: TrackRowProps) {
  const { t } = useT();
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isCoverHovered, setIsCoverHovered] = useState(false);

  const addLabel = addTitle ?? t("workspace.add.playlist");
  const removeLabel = removeTitle ?? t("workspace.removeFavorites");

  const toggleFavorite = onToggleFavoriteTrack ?? onToggleFavorite;
  const isActive = isCurrent && isPlaying;

  /* ── стабильные колбэки: drag-жест дёргается на каждый кадр ── */
  const handleDragStart = useCallback(() => setIsDragging(true), []);

  const handleDragMove = useCallback(
    (_: unknown, info: { offset: { x: number } }) => setDragX(info.offset.x),
    [],
  );

  const handlePlayClick = useCallback(() => {
    if (isCurrent && onTogglePlay) {
      onTogglePlay();
      return;
    }
    onPlay?.(track, queue);
  }, [isCurrent, onTogglePlay, onPlay, track, queue]);

  const pushToQueue = useCallback(() => {
    onQueue?.(track);
    toast(t("player.addedToQueue"));
  }, [onQueue, track, t]);

  const toggleFav = useCallback(() => {
    if (!toggleFavorite) return;
    toggleFavorite(track);
    toast(
      isFavorite ? t("player.removedFromFavorites") : t("player.addedToFavorites"),
    );
  }, [toggleFavorite, track, isFavorite, t]);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number } }) => {
      setIsDragging(false);
      setDragX(0);

      if (info.offset.x > SWIPE_THRESHOLD) {
        pushToQueue();
      } else if (info.offset.x < -SWIPE_THRESHOLD) {
        toggleFav();
      }
    },
    [pushToQueue, toggleFav],
  );

  const handleAdd = useCallback(() => onAdd?.(track), [onAdd, track]);
  const handleRemove = useCallback(() => onRemove?.(track), [onRemove, track]);
  const handleCoverEnter = useCallback(() => setIsCoverHovered(true), []);
  const handleCoverLeave = useCallback(() => setIsCoverHovered(false), []);
  /** Клик по обложке — тот же сценарий, что и по кнопке плеера. */
  const handleCoverActivate = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      handlePlayClick();
    },
    [handlePlayClick],
  );

  // Прогресс раскрытия подложек: >0 — вправо (очередь), <0 — влево (избранное).
  const rightRatio = Math.max(0, Math.min(dragX / SWIPE_THRESHOLD, 1));
  const leftRatio = Math.max(0, Math.min(-dragX / SWIPE_THRESHOLD, 1));

  return (
    <div className="relative rounded-2xl">
      {/* Подложка: свайп влево — в избранное (розово-красная) */}
      {toggleFavorite && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-end gap-2 rounded-2xl bg-rose-500/30 pr-5 text-sm font-semibold text-white"
          style={{ opacity: leftRatio }}
          aria-hidden="true"
        >
          {t("player.addedToFavorites")}
          <Heart size={18} className={isFavorite ? "fill-white" : ""} />
        </div>
      )}

      {/* Подложка: свайп вправо — в очередь (акцентная) */}
      {onQueue && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center gap-2 rounded-2xl bg-purple-500/30 pl-5 text-sm font-semibold text-white"
          style={{ opacity: rightRatio }}
          aria-hidden="true"
        >
          <ListPlus size={18} />
          {t("player.addedToQueue")}
        </div>
      )}

      <motion.div
        drag="x"
        dragConstraints={{ left: -120, right: 120 }}
        dragElastic={0.15}
        dragSnapToOrigin
        onDragStart={handleDragStart}
        onDrag={handleDragMove}
        onDragEnd={handleDragEnd}
        className={`relative flex items-center gap-3 rounded-2xl border bg-neutral-900/60 p-3 transition-colors ${
          isCurrent
            ? "border-purple-300/35 bg-purple-500/[0.08]"
            : "border-white/10"
        } ${isDragging ? "cursor-grabbing" : "hover:border-purple-300/20"}`}
      >
        {/* Обложка — полноценный триггер воспроизведения */}
        {(onPlay || onTogglePlay) ? (
          <button
            type="button"
            onClick={handleCoverActivate}
            onPointerEnter={handleCoverEnter}
            onPointerLeave={handleCoverLeave}
            className="group/cover relative shrink-0 cursor-pointer overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            title={isActive ? t("player.pause") : t("player.playpause")}
            aria-label={isActive ? t("player.pause") : t("player.playpause")}
          >
            <TrackCover track={track} interactive={isCoverHovered} />

            {/* Оверлей управляется состоянием, а не CSS-hover: drag-слой выше
                в дереве перехватывает указатель и `group-hover` не срабатывает. */}
            <span
              className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                isCoverHovered ? "opacity-100" : "opacity-0"
              }`}
            >
              <span className="inline-flex aspect-square items-center justify-center rounded-full bg-black/55 p-1.5 leading-none">
                {isActive ? (
                  <Pause size={14} className="m-0 block text-white" />
                ) : (
                  <Play size={14} className="m-0 block text-white" />
                )}
              </span>
            </span>
          </button>
        ) : (
          <TrackCover track={track} />
        )}

        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-semibold ${
              isCurrent ? "text-purple-200" : "text-white"
            }`}
          >
            {track.title}
          </p>

          <p className="truncate text-xs text-purple-100/45">
            {track.artist} · {track.source}
          </p>
        </div>

        <span className="shrink-0 text-xs text-purple-100/35">
          {track.duration}
        </span>

        {/* Плей/Пауза (с индикацией активного трека) */}
        {(onPlay || onTogglePlay) && (
          <button
            onClick={handlePlayClick}
            className={`shrink-0 rounded-full p-2 transition ${
              isActive
                ? "bg-purple-500/40 text-white hover:bg-purple-500/55"
                : "bg-purple-500/25 text-white hover:bg-purple-500/40"
            }`}
            title={isActive ? t("player.pause") : t("player.playpause")}
          >
            {isActive ? <MiniEqualizer /> : <Play size={15} />}
          </button>
        )}

        {onAdd && (
          <button
            onClick={handleAdd}
            className="shrink-0 rounded-full bg-purple-500/15 p-2 text-purple-100 transition hover:bg-purple-500/30 hover:text-white"
            title={addLabel}
          >
            <Plus size={15} />
          </button>
        )}

        {onRemove && (
          <button
            onClick={handleRemove}
            className="shrink-0 rounded-full bg-red-500/10 p-2 text-red-100/65 transition hover:bg-red-500/20 hover:text-red-100"
            title={removeLabel}
          >
            <Trash2 size={15} />
          </button>
        )}
      </motion.div>
    </div>
  );
});

/** Мини-эквалайзер (3 анимированные полоски) для активного трека. */
function MiniEqualizer() {
  return (
    <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-white"
          style={{
            height: "60%",
            animation: `eqBar 700ms ease-in-out ${i * 120}ms infinite alternate`,
          }}
        />
      ))}
    </span>
  );
}
