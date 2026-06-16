import { Music } from "lucide-react";

import type { PlaylistTrack } from "../../types/playlist";

type TrackCoverProps = {
  track: PlaylistTrack;
  size?: string;
};

export function TrackCover({ track, size = "h-12 w-12" }: TrackCoverProps) {
  return (
    <div
      className={`relative ${size} shrink-0 overflow-hidden rounded-xl border border-purple-300/10 bg-black`}
    >
      {track.coverUrl ? (
        <img
          src={track.coverUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full scale-[1.08] object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500/35 to-black">
          <Music size={18} className="text-purple-100/65" />
        </div>
      )}
    </div>
  );
}