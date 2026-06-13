import { Heart, Music, Play, Plus, Search } from "lucide-react";
import { mockTracks } from "../../data/mockTracks";
import { NoctraWindow } from "./NoctraWindow";

export function MusicWindow() {
  return (
    <NoctraWindow title="Music Source" icon={<Music size={17} />}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-purple-100/55">
          <Search size={16} />
          Search SoundCloud, Audius, Telegram Test...
        </div>

        <div className="flex gap-2">
          {["SoundCloud", "Audius", "Telegram Test"].map((source) => (
            <button
              key={source}
              className="rounded-full border border-purple-200/15 bg-purple-500/10 px-3 py-1 text-xs text-purple-100/70"
            >
              {source}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mockTracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:bg-white/[0.06]"
            >
              <img
                src={track.cover}
                alt=""
                className="h-12 w-12 rounded-xl object-cover"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {track.title}
                </p>
                <p className="text-xs text-purple-100/45">
                  {track.artist} · {track.duration}
                </p>
              </div>

              <span className="hidden rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-purple-100/55 md:block">
                {track.source}
              </span>

              <button className="rounded-full p-2 hover:bg-white/10">
                <Heart size={15} />
              </button>
              <button className="rounded-full p-2 hover:bg-white/10">
                <Plus size={15} />
              </button>
              <button className="rounded-full bg-purple-500/25 p-2 text-white hover:bg-purple-500/40">
                <Play size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </NoctraWindow>
  );
}