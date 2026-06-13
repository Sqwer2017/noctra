import { useState } from "react";
import {
  Check,
  Heart,
  ListMusic,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from "lucide-react";

import type { Playlist, PlaylistTrack } from "../../types/playlist";

type PlayerMenuState = "closed" | "open" | "closing";

type BottomPlayerProps = {
  currentTrack: PlaylistTrack | null;
  playQueue: PlaylistTrack[];
  currentTrackIndex: number;
  playlists: Playlist[];
  isCurrentTrackFavorite: boolean;
  isClosing: boolean;
  onToggleFavoriteTrack: (track: PlaylistTrack) => void;
  onAddTrackToPlaylist: (playlistId: string, track: PlaylistTrack) => void;
  onSelectQueueTrack: (track: PlaylistTrack) => void;
  onNextTrack: () => void;
  onPreviousTrack: () => void;
  onClose: () => void;
};

export function BottomPlayer({
  currentTrack,
  playQueue,
  currentTrackIndex,
  playlists,
  isCurrentTrackFavorite,
  isClosing,
  onToggleFavoriteTrack,
  onAddTrackToPlaylist,
  onSelectQueueTrack,
  onNextTrack,
  onPreviousTrack,
  onClose,
}: BottomPlayerProps) {
  const [queueMenuState, setQueueMenuState] =
    useState<PlayerMenuState>("closed");
  const [playlistMenuState, setPlaylistMenuState] =
    useState<PlayerMenuState>("closed");

  const title = currentTrack?.title ?? "No track selected";
  const artist = currentTrack?.artist ?? "Choose a track from Music Search";
  const source = currentTrack?.source ?? "Noctra";
  const duration = currentTrack?.duration ?? "0:00";

  const isQueueVisible = queueMenuState !== "closed";
  const isPlaylistMenuVisible = playlistMenuState !== "closed";

  function closeQueueMenu() {
    if (queueMenuState !== "open") return;

    setQueueMenuState("closing");

    window.setTimeout(() => {
      setQueueMenuState("closed");
    }, 240);
  }

  function closePlaylistMenu() {
    if (playlistMenuState !== "open") return;

    setPlaylistMenuState("closing");

    window.setTimeout(() => {
      setPlaylistMenuState("closed");
    }, 240);
  }

  function toggleQueueMenu() {
    if (queueMenuState === "open") {
      closeQueueMenu();
      return;
    }

    closePlaylistMenu();
    setQueueMenuState("open");
  }

  function togglePlaylistMenu() {
    if (playlistMenuState === "open") {
      closePlaylistMenu();
      return;
    }

    closeQueueMenu();
    setPlaylistMenuState("open");
  }

  function handleAddToPlaylist(playlistId: string) {
    if (!currentTrack) return;

    onAddTrackToPlaylist(playlistId, currentTrack);
  }

  return (
    <footer 
      className={`relative flex items-center gap-4 rounded-[28px] border border-purple-200/15 bg-black/60 px-5 shadow-2xl shadow-purple-950/30 backdrop-blur-2xl transition-all duration-500 ease-out ${
        isClosing
          ? "animate-[playerOut_320ms_cubic-bezier(0.7,0,0.84,0)_forwards]"
          : "animate-[playerIn_420ms_cubic-bezier(0.16,1,0.3,1)]"
        }`}
      >
        
      {isPlaylistMenuVisible && (
        <div
          className={`absolute bottom-[calc(100%+12px)] left-32 z-30 w-[360px] overflow-hidden rounded-3xl border border-purple-300/15 bg-black/80 shadow-2xl shadow-purple-950/50 backdrop-blur-2xl ${
            playlistMenuState === "closing"
              ? "animate-[playerMenuOut_240ms_cubic-bezier(0.7,0,0.84,0)_forwards]"
              : "animate-[playerMenuIn_340ms_cubic-bezier(0.16,1,0.3,1)]"
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">
                Add to playlist
              </p>
              <p className="text-xs text-purple-100/40">
                {currentTrack ? currentTrack.title : "No track selected"}
              </p>
            </div>

            <button
              onClick={closePlaylistMenu}
              className="rounded-full p-1 text-purple-100/40 transition hover:bg-white/10 hover:text-white"
            >
              <X size={15} />
            </button>
          </div>

          {!currentTrack ? (
            <div className="p-5 text-center text-sm text-purple-100/45">
              Play or select a track first.
            </div>
          ) : playlists.length === 0 ? (
            <div className="p-5 text-center">
              <p className="text-sm text-purple-100/55">
                You do not have playlists yet.
              </p>
              <p className="mt-2 text-xs leading-5 text-purple-100/35">
                Create a playlist first, then you can quickly add tracks here.
              </p>
            </div>
          ) : (
            <div className="max-h-72 space-y-1 overflow-auto p-2 noctra-scrollbar">
              {playlists.map((playlist) => {
                const alreadyAdded = playlist.tracks.some(
                  (track) => track.id === currentTrack.id,
                );

                return (
                  <div
                    key={playlist.id}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2 transition ${
                      alreadyAdded
                        ? "bg-white/[0.03] text-purple-100/35"
                        : "text-purple-100/65 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-purple-300/10 bg-gradient-to-br from-purple-500/30 to-black">
                      {playlist.cover && (
                        <img
                          src={playlist.cover}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {playlist.name}
                      </p>
                      <p className="truncate text-xs text-purple-100/40">
                        {playlist.tracks.length} tracks · {playlist.privacy}
                      </p>
                    </div>

                    <button
                      onClick={() => handleAddToPlaylist(playlist.id)}
                      disabled={alreadyAdded}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-purple-300/20 bg-purple-500/15 text-purple-50 transition hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                      title={alreadyAdded ? "Already added" : "Add track"}
                    >
                      {alreadyAdded ? <Check size={15} /> : <Plus size={15} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isQueueVisible && (
        <div
          className={`absolute bottom-[calc(100%+12px)] right-4 z-30 w-[380px] overflow-hidden rounded-3xl border border-purple-300/15 bg-black/80 shadow-2xl shadow-purple-950/50 backdrop-blur-2xl ${
            queueMenuState === "closing"
              ? "animate-[playerMenuOut_240ms_cubic-bezier(0.7,0,0.84,0)_forwards]"
              : "animate-[playerMenuIn_340ms_cubic-bezier(0.16,1,0.3,1)]"
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Queue</p>
              <p className="text-xs text-purple-100/40">
                {playQueue.length} tracks
              </p>
            </div>

            <button
              onClick={closeQueueMenu}
              className="rounded-full p-1 text-purple-100/40 transition hover:bg-white/10 hover:text-white"
            >
              <X size={15} />
            </button>
          </div>

          {playQueue.length === 0 ? (
            <div className="p-5 text-center text-sm text-purple-100/45">
              No queue yet. Play a track first.
            </div>
          ) : (
            <div className="max-h-72 space-y-1 overflow-auto p-2 noctra-scrollbar">
              {playQueue.map((track, index) => {
                const isCurrent = index === currentTrackIndex;

                return (
                  <button
                    key={`${track.id}-${index}`}
                    onClick={() => onSelectQueueTrack(track)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
                      isCurrent
                        ? "bg-purple-500/20 text-white"
                        : "text-purple-100/55 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-purple-300/10 bg-purple-500/10">
                      {isCurrent ? <Pause size={15} /> : <Play size={15} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-purple-100/40">
                        {track.artist} · {track.source}
                      </p>
                    </div>

                    <span className="text-xs text-purple-100/35">
                      {track.duration}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="h-14 w-14 shrink-0 rounded-2xl bg-gradient-to-br from-purple-500/40 to-black shadow-lg shadow-purple-950/30" />

      <div className="w-40 min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="truncate text-xs text-purple-100/45">
          {artist} · {source}
        </p>
      </div>
    <div className="flex items-center gap-2">
      <button
        onClick={togglePlaylistMenu}
        disabled={!currentTrack}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-purple-100/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${
          playlistMenuState === "open" ? "bg-purple-500/20 text-white" : ""
        }`}
        title="Add current track to playlist"
      >
        <Plus size={17} />
      </button>

      <button
        onClick={() => {
          if (!currentTrack) return;

          onToggleFavoriteTrack(currentTrack);
        }}
        disabled={!currentTrack}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${
          isCurrentTrackFavorite
            ? "bg-purple-500/20 text-purple-200"
            : "text-purple-100/60"
        }`}
        title={
          isCurrentTrackFavorite ? "Remove from favorites" : "Add to favorites"
        }
      >
        <Heart
          size={17}
          className={isCurrentTrackFavorite ? "fill-purple-300" : ""}
        />
      </button>
    </div>

      <div className="flex flex-1 flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={onPreviousTrack}
            disabled={playQueue.length <= 1}
            className="text-purple-100/50 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            <SkipBack size={17} />
          </button>

          <button
            disabled={!currentTrack}
            className="rounded-full bg-purple-500/30 p-3 text-white shadow-lg shadow-purple-900/30 transition hover:bg-purple-500/45 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Pause size={18} />
          </button>

          <button
            onClick={onNextTrack}
            disabled={playQueue.length <= 1}
            className="text-purple-100/50 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            <SkipForward size={17} />
          </button>
        </div>

        <div className="flex w-full max-w-xl items-center gap-3 text-[11px] text-purple-100/35">
          <span>{currentTrack ? "0:00" : "—"}</span>

          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-purple-300 ${
                currentTrack ? "w-1/3" : "w-0"
              }`}
            />
          </div>

          <span>{duration}</span>
        </div>
      </div>

      <div className="hidden items-center gap-3 text-purple-100/50 lg:flex">
        <button
          onClick={toggleQueueMenu}
          className={`rounded-full p-2 transition hover:bg-white/10 hover:text-white ${
            queueMenuState === "open" ? "bg-purple-500/20 text-white" : ""
          }`}
          title="Open queue"
        >
          <ListMusic size={18} />
        </button>

        <Volume2 size={18} />

        <div className="h-1 w-24 rounded-full bg-white/10">
          <div className="h-full w-2/3 rounded-full bg-purple-200" />
        </div>
      </div>

      <button
        onClick={onClose}
        className="rounded-full p-2 text-purple-100/45 transition hover:bg-red-500/20 hover:text-red-100"
        title="Close player"
      >
        <X size={16} />
      </button>
    </footer>
  );
}