import { ListMusic, Plus } from "lucide-react";
import { mockPlaylists } from "../../data/mockPlaylists";
import { NoctraWindow } from "./NoctraWindow";

export function PlaylistsWindow() {
  return (
    <NoctraWindow title="Playlists" icon={<ListMusic size={17} />}>
      <div className="space-y-3">
        <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-purple-200/20 bg-purple-500/15 px-4 py-3 text-sm text-purple-50 hover:bg-purple-500/25">
          <Plus size={16} />
          Create playlist
        </button>

        {mockPlaylists.map((playlist) => (
          <div
            key={playlist.id}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">{playlist.name}</h3>
                <p className="mt-1 text-xs leading-5 text-purple-100/45">
                  {playlist.description}
                </p>
              </div>

              <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-purple-100/55">
                {playlist.privacy}
              </span>
            </div>

            <p className="text-xs text-purple-200/45">
              {playlist.trackCount} tracks
            </p>
          </div>
        ))}
      </div>
    </NoctraWindow>
  );
}