import { memo } from "react";
import { Music } from "lucide-react";

import type { PlaylistTrack } from "../../types/playlist";

type TrackCoverProps = {
  track: PlaylistTrack;
  size?: string;
  /** Курсор над обложкой: лёгкий зум и затемнение под иконку Play/Pause. */
  interactive?: boolean;
};

/**
 * Миниатюра обложки.
 *
 * Картинки грузятся нативно-лениво и декодируются асинхронно: в виртуализированном
 * списке одновременно живёт ~15 карточек, и `decoding="async"` не даёт декодированию
 * блокировать главный поток во время скролла.
 */
export const TrackCover = memo(function TrackCover({
  track,
  size = "h-12 w-12",
  interactive = false,
}: TrackCoverProps) {
  return (
    <div
      className={`relative ${size} shrink-0 overflow-hidden rounded-xl border border-purple-300/10 bg-black`}
    >
      {track.coverUrl ? (
        <img
          src={track.coverUrl}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover transition duration-200 ${
            interactive
              ? "scale-[1.14] brightness-[0.55]"
              : "scale-[1.08]"
          }`}
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500/35 to-black transition ${
            interactive ? "brightness-[0.55]" : ""
          }`}
        >
          <Music size={18} className="text-purple-100/65" />
        </div>
      )}
    </div>
  );
});
