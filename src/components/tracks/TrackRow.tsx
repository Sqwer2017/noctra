import { Heart, Play, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";

import type { PlaylistTrack } from "../../types/playlist";
import { TrackCover } from "./TrackCover";

type TrackRowProps = {
  track: PlaylistTrack;
  queue?: PlaylistTrack[];
  isFavorite?: boolean;
  onPlay?: (track: PlaylistTrack, queue?: PlaylistTrack[]) => void;
  onAdd?: (track: PlaylistTrack) => void;
  onToggleFavorite?: (track: PlaylistTrack) => void;
  onRemove?: (track: PlaylistTrack) => void;
  addTitle?: string;
  removeTitle?: string;
};

export function TrackRow({
  track,
  queue,
  isFavorite = false,
  onPlay,
  onAdd,
  onToggleFavorite,
  onRemove,
  addTitle = "Add to playlist",
  removeTitle = "Remove track",
}: TrackRowProps) {
  return (
    <motion.div
      layout
      initial={{
        opacity: 0,
        y: 10,
        scale: 0.985,
      }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
      }}
      transition={{
        duration: 0.28,
        ease: [0.16, 1, 0.3, 1],
        layout: {
          duration: 0.35,
          ease: [0.16, 1, 0.3, 1],
        },
      }}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-purple-300/20 hover:bg-white/[0.07]"
    >
      <TrackCover track={track} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {track.title}
        </p>

        <p className="truncate text-xs text-purple-100/45">
          {track.artist} · {track.source}
        </p>
      </div>

      <span className="text-xs text-purple-100/35">{track.duration}</span>

      {onPlay && (
        <button
          onClick={() => onPlay(track, queue)}
          className="rounded-full bg-purple-500/25 p-2 text-white transition hover:bg-purple-500/40"
          title="Play track"
        >
          <Play size={15} />
        </button>
      )}

      {onAdd && (
        <button
          onClick={() => onAdd(track)}
          className="rounded-full bg-purple-500/15 p-2 text-purple-100 transition hover:bg-purple-500/30 hover:text-white"
          title={addTitle}
        >
          <Plus size={15} />
        </button>
      )}

      {onToggleFavorite && (
        <button
          onClick={() => onToggleFavorite(track)}
          className={`rounded-full p-2 transition hover:bg-white/10 hover:text-white ${
            isFavorite
              ? "text-purple-200"
              : "text-purple-100/55"
          }`}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            size={15}
            className={isFavorite ? "fill-purple-300" : ""}
          />
        </button>
      )}

      {onRemove && (
        <button
          onClick={() => onRemove(track)}
          className="rounded-full bg-red-500/10 p-2 text-red-100/65 transition hover:bg-red-500/20 hover:text-red-100"
          title={removeTitle}
        >
          <Trash2 size={15} />
        </button>
      )}
    </motion.div>
  );
}