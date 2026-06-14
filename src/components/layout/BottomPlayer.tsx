import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";

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
  VolumeX,
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [isMuted, setIsMuted] = useState(false);

  const hasAudioSource = Boolean(currentTrack?.streamUrl);

  const effectiveVolume = isMuted ? 0 : volume;
  const volumeProgress = Math.round(effectiveVolume * 100);

  const safeAudioDuration = Number.isFinite(audioDuration) ? audioDuration : 0;

  const progress =
    safeAudioDuration > 0
      ? Math.min((currentTime / safeAudioDuration) * 100, 100)
      : 0;

  function getRangeStyle(value: number) {
    return {
      "--range-progress": `${value}%`,
    } as CSSProperties;
  }

  useEffect(() => {
    if (!audioRef.current) return;

    audioRef.current.volume = effectiveVolume;
  }, [effectiveVolume]);

  function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    if (!audioRef.current || !hasAudioSource) return;

    const nextTime = Number(event.target.value);

    if (Number.isNaN(nextTime)) return;

    audioRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const nextVolume = Number(event.target.value) / 100;

    if (Number.isNaN(nextVolume)) return;

    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
  }

  function toggleMute() {
    setIsMuted((value) => !value);
  }

  function formatTime(seconds: number) {
    if (!seconds || Number.isNaN(seconds)) {
      return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const restSeconds = Math.floor(seconds % 60);

    return `${minutes}:${String(restSeconds).padStart(2, "0")}`;
  }

  function togglePlayback() {
    if (!audioRef.current || !hasAudioSource) return;

    if (audioRef.current.paused) {
      audioRef.current.play().then(() => setIsPlaying(true));
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }

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
        <audio
          ref={audioRef}
          src={currentTrack?.streamUrl}
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime);
          }}
          onLoadedMetadata={(event) => {
            setAudioDuration(event.currentTarget.duration);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={onNextTrack}
          />
        
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
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-purple-300/10 bg-purple-500/10">
                      {track.coverUrl ? (
                        <img src={track.coverUrl} alt="" className="h-full w-full object-cover" />
                      ) : isCurrent ? (
                        <Pause size={15} />
                      ) : (
                        <Play size={15} />
                      )}
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

      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/40 to-black shadow-lg shadow-purple-950/30">
        {currentTrack?.coverUrl && (
          <img
            src={currentTrack.coverUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>

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
            onClick={togglePlayback}
            disabled={!hasAudioSource}
            className="rounded-full bg-purple-500/30 p-3 text-white shadow-lg shadow-purple-900/30 transition hover:bg-purple-500/45 disabled:cursor-not-allowed disabled:opacity-40"
            title={hasAudioSource ? "Play / Pause" : "No audio source"}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
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
          <span>{hasAudioSource ? formatTime(currentTime) : "—"}</span>

        <input
          type="range"
          min="0"
          max={safeAudioDuration || 0}
          step="0.1"
          value={hasAudioSource ? Math.min(currentTime, safeAudioDuration || 0) : 0}
          onChange={handleSeek}
          disabled={!hasAudioSource}
          style={getRangeStyle(progress)}
          className="noctra-range flex-1 cursor-pointer disabled:cursor-not-allowed"
        />

        <span>{hasAudioSource ? formatTime(safeAudioDuration) : duration}</span>

        </div>
      </div>

        <button
          onClick={toggleQueueMenu}
          className={`rounded-full p-2 transition hover:bg-white/10 hover:text-white ${
            queueMenuState === "open" ? "bg-purple-500/20 text-white" : ""
          }`}
          title="Open queue"
        >
          <ListMusic size={18} />
        </button>

        <button
          onClick={toggleMute}
          className="rounded-full p-1 transition hover:bg-white/10 hover:text-white"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted || volumeProgress === 0 ? (
            <VolumeX size={18} />
          ) : (
            <Volume2 size={18} />
          )}
        </button>

        <input
          type="range"
          min="0"
          max="100"
          value={volumeProgress}
          onChange={handleVolumeChange}
          style={getRangeStyle(volumeProgress)}
          className="noctra-range w-24 cursor-pointer"
        />

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