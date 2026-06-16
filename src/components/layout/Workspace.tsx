import {
  Bot,
  Crown,
  Heart,
  ListMusic,
  Music,
  Play,
  Plus,
  Radio,
  Search,
  Settings,
  X,
} from "lucide-react";

import {
  getTelegramTracks,
  syncTelegramTracks,
} from "../../services/telegramTracks";

import { getWindowMeta } from "../../data/windowRegistry";
import type { WindowId } from "../../types/windows";
import { DesktopWindow } from "../windows/DesktopWindow";
import { useEffect, useState } from "react";
import type { Playlist, PlaylistPrivacy, PlaylistTrack } from "../../types/playlist";
import { LayoutGroup, motion } from "motion/react";
import { TrackRow } from "../tracks/TrackRow";

type WorkspaceProps = {
  openedWindows: WindowId[];
  closingWindows: WindowId[];
  activeWindow: WindowId | null;
  setActiveWindow: (id: WindowId) => void;
  closeWindow: (id: WindowId) => void;
  playlists: Playlist[];
  favoriteTracks: PlaylistTrack[];
  onToggleFavoriteTrack: (track: PlaylistTrack) => void;
  onRemoveFavoriteTrack: (trackId: string) => void;
  onCreatePlaylist: (playlist: Omit<Playlist, "id" | "tracks">) => void;
  onUpdatePlaylist: (
    playlistId: string,
    playlist: Omit<Playlist, "id" | "tracks">,
  ) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onAddTrackToPlaylist: (playlistId: string, track: PlaylistTrack) => void;
  onOpenWindow: (id: WindowId) => void;
  selectedPlaylistId: string | null;
  onOpenPlaylistDetails: (playlistId: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  onPlayTrack: (track: PlaylistTrack, queue?: PlaylistTrack[]) => void;
};

const friends = [
  ["Nyxshade", "listening to Eclipse of the Fallen", "bg-emerald-400"],
  ["Lunaris", "editing profile theme", "bg-yellow-300"],
  ["Svaria", "last seen 2h ago", "bg-zinc-500"],
];

export function Workspace({
  selectedPlaylistId,
  onOpenPlaylistDetails,
  onRemoveTrackFromPlaylist,
  openedWindows,
  onAddTrackToPlaylist,
  closingWindows,
  activeWindow,
  setActiveWindow,
  closeWindow,
  playlists,
  favoriteTracks,
  onToggleFavoriteTrack,
  onRemoveFavoriteTrack,
  onCreatePlaylist,
  onOpenWindow,
  onUpdatePlaylist,
  onPlayTrack,
  onDeletePlaylist,
}: WorkspaceProps) {
  if (openedWindows.length === 0) {
    return <EmptyWorkspace />;
  }

  return (
    <LayoutGroup>
      <motion.section
        layout
        transition={{
          layout: {
            duration: 0.5,
            ease: [0.16, 1, 0.3, 1],
          },
        }}
        className={`grid h-full min-h-0 max-h-full overflow-hidden gap-4 ${getWorkspaceGridClass(
          openedWindows.length,
        )}`}
      >
        {openedWindows.map((windowId) => {
          const meta = getWindowMeta(windowId);

          if (!meta) return null;

          return (
            <motion.div
              key={windowId}
              layout
              initial={{
                opacity: 0,
                x: -28,
                scale: 0.975,
              }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
              }}
              transition={{
                duration: 0.42,
                ease: [0.16, 1, 0.3, 1],
                layout: {
                  duration: 0.5,
                  ease: [0.16, 1, 0.3, 1],
                },
              }}
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <DesktopWindow
                title={meta.title}
                subtitle={meta.subtitle}
                icon={meta.icon}
                isActive={activeWindow === windowId}
                isClosing={closingWindows.includes(windowId)}
                onFocus={() => setActiveWindow(windowId)}
                onClose={() => closeWindow(windowId)}
              >
                {renderWindowContent(windowId, {
                  playlists,
                  selectedPlaylistId,
                  favoriteTracks,
                  onCreatePlaylist,
                  onUpdatePlaylist,
                  onDeletePlaylist,
                  onAddTrackToPlaylist,
                  onOpenPlaylistDetails,
                  onRemoveTrackFromPlaylist,
                  onToggleFavoriteTrack,
                  onRemoveFavoriteTrack,
                  onPlayTrack,
                  onOpenWindow,
                })}
              </DesktopWindow>
            </motion.div>
          );
        })}
      </motion.section>
    </LayoutGroup>
  );
}

function getWorkspaceGridClass(count: number) {
  if (count === 1) {
    return "grid-cols-1 grid-rows-1";
  }

  if (count === 2) {
    return "grid-cols-2 grid-rows-1";
  }

  if (count === 3) {
    return "grid-cols-[1.15fr_1fr] grid-rows-2 [&>*:first-child]:row-span-2";
  }

  return "grid-cols-2 grid-rows-2";
}

type WindowContentContext = {
  playlists: Playlist[];
  favoriteTracks: PlaylistTrack[];
  onToggleFavoriteTrack: (track: PlaylistTrack) => void;
  onRemoveFavoriteTrack: (trackId: string) => void;
  selectedPlaylistId: string | null;
  onUpdatePlaylist: (
    playlistId: string,
    playlist: Omit<Playlist, "id" | "tracks">,
  ) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onCreatePlaylist: (playlist: Omit<Playlist, "id" | "tracks">) => void;
  onAddTrackToPlaylist: (playlistId: string, track: PlaylistTrack) => void;
  onOpenPlaylistDetails: (playlistId: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  onPlayTrack: (track: PlaylistTrack, queue?: PlaylistTrack[]) => void;
  onOpenWindow: (id: WindowId) => void;
};

function renderWindowContent(id: WindowId, context: WindowContentContext) {
  switch (id) {
    case "profile":
      return <ProfileWindowContent />;

    case "music-search":
      return (
        <MusicSearchWindowContent
          playlists={context.playlists}
          onAddTrackToPlaylist={context.onAddTrackToPlaylist}
          onOpenCreatePlaylist={() => context.onOpenWindow("create-playlist")}
          onPlayTrack={context.onPlayTrack}
        />
      );

    case "playlists":
      return (
        <PlaylistsWindowContent
          playlists={context.playlists}
          onOpenCreate={() => context.onOpenWindow("create-playlist")}
          onOpenPlaylistDetails={context.onOpenPlaylistDetails}
        />
      );

    case "playlist-details":
      return (
        <PlaylistDetailsWindowContent
          playlists={context.playlists}
          selectedPlaylistId={context.selectedPlaylistId}
          onUpdatePlaylist={context.onUpdatePlaylist}
          onDeletePlaylist={context.onDeletePlaylist}
          onRemoveTrackFromPlaylist={context.onRemoveTrackFromPlaylist}
          onPlayTrack={context.onPlayTrack}
        />
      );
    
    case "favorites":
      return (
        <FavoritesWindowContent
          favoriteTracks={context.favoriteTracks}
          onPlayTrack={context.onPlayTrack}
          onRemoveFavoriteTrack={context.onRemoveFavoriteTrack}
        />
      );

    case "create-playlist":
      return <CreatePlaylistWindowContent onCreate={context.onCreatePlaylist} />;

    case "friends":
      return <FriendsWindowContent />;

    case "chat":
      return <ChatWindowContent />;

    case "customize":
      return <CustomizeWindowContent />;

    case "telegram":
      return <TelegramWindowContent />;
    
    case "telegram-tracks":
      return <TelegramTracksWindowContent />;

    case "settings":
      return <SettingsWindowContent />;

    default:
      return null;
  }
}

function FavoritesWindowContent({
  favoriteTracks,
  onPlayTrack,
  onRemoveFavoriteTrack,
}: {
  favoriteTracks: PlaylistTrack[];
  onPlayTrack: (track: PlaylistTrack, queue?: PlaylistTrack[]) => void;
  onRemoveFavoriteTrack: (trackId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredFavoriteTracks = normalizedSearchQuery
    ? favoriteTracks.filter((track) => {
        const searchableText = [
          track.title,
          track.artist,
          track.source,
          track.duration,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearchQuery);
      })
    : favoriteTracks;

  if (favoriteTracks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-purple-300/20 bg-white/[0.025] p-6 text-center">
        <div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15">
            <Heart size={24} />
          </div>

          <h3 className="text-lg font-semibold text-white">
            No favorites yet
          </h3>

          <p className="mt-2 max-w-xs text-sm leading-6 text-purple-100/45">
            Play a track and press the heart button in the player to save it
            here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-3xl border border-purple-300/15 bg-purple-500/10 p-4">
        <p className="text-sm font-semibold text-white">Favorite tracks</p>
        <p className="mt-1 text-xs text-purple-100/45">
          {favoriteTracks.length} saved tracks
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-purple-100/45 transition focus-within:border-purple-300/35">
        <Search size={16} />

        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search favorite tracks..."
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-purple-100/35"
        />

        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="rounded-full p-1 text-purple-100/35 transition hover:bg-white/10 hover:text-white"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1 noctra-scrollbar">
        {filteredFavoriteTracks.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center rounded-3xl border border-dashed border-purple-300/20 bg-white/[0.025] p-6 text-center">
            <div>
              <Heart size={26} className="mx-auto mb-3 text-purple-100/40" />

              <p className="text-sm font-semibold text-white">
                No favorite tracks found
              </p>

              <p className="mt-2 text-xs leading-5 text-purple-100/45">
                Try another title, artist or source.
              </p>
            </div>
          </div>
        ) : (
          filteredFavoriteTracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              queue={filteredFavoriteTracks}
              isFavorite
              onPlay={onPlayTrack}
              onRemove={(trackToRemove) =>
                onRemoveFavoriteTrack(trackToRemove.id)
              }
              removeTitle="Remove from favorites"
            />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyWorkspace() {
  return (
    <div className="flex min-h-0 items-center justify-center rounded-[28px] border border-purple-200/15 bg-black/40 p-8 text-center backdrop-blur-2xl">
      <div>
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-purple-300/20 bg-purple-500/15">
          <Music size={28} />
        </div>

        <h2 className="text-2xl font-semibold">Noctra workspace is empty</h2>

        <p className="mt-3 max-w-md text-sm leading-6 text-purple-100/50">
          Open modules from the sidebar. Windows will automatically arrange
          themselves like a fixed tiling desktop.
        </p>
      </div>
    </div>
  );
}

function ProfileWindowContent() {
  return (
    <div className="space-y-4">
      <div className="h-28 rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.5),rgba(30,20,45,0.9))]" />

      <div className="-mt-12 flex items-end gap-4 px-2">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-purple-200/25 bg-black/70 text-2xl font-bold shadow-xl shadow-purple-950/40">
          M
        </div>

        <div className="pb-2">
          <h3 className="text-xl font-bold">Mocevn</h3>
          <p className="text-sm text-purple-100/45">@mocevn</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-purple-100">
          <Crown size={16} />
          Nightborn
        </div>

        <p className="text-sm leading-5 text-purple-100/65">
          Dark fantasy enjoyer, playlist collector, and late-night gamer.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Followers" value="1.2K" />
        <Stat label="Playlists" value="18" />
      </div>
    </div>
  );
}

function MusicSearchWindowContent({
  playlists,
  onAddTrackToPlaylist,
  onOpenCreatePlaylist,
  onPlayTrack,
}: {
  playlists: Playlist[];
  onAddTrackToPlaylist: (playlistId: string, track: PlaylistTrack) => void;
  onOpenCreatePlaylist: () => void;
  onPlayTrack: (track: PlaylistTrack, queue?: PlaylistTrack[]) => void;
}) {
  const fallbackTracks: PlaylistTrack[] = [
    {
      id: "track-1",
      title: "Eclipse of the Fallen",
      artist: "Nyxshade",
      source: "Telegram Test",
      duration: "3:42",
    },
    {
      id: "track-2",
      title: "Castle Under Static Rain",
      artist: "Viremoon",
      source: "Telegram Test",
      duration: "4:18",
    },
    {
      id: "track-3",
      title: "Ashes in the Lobby",
      artist: "Grimveil",
      source: "Telegram Test",
      duration: "2:57",
    },
  ];

  const [selectedTrack, setSelectedTrack] = useState<PlaylistTrack | null>(
    null,
  );
  const [isAddMenuClosing, setIsAddMenuClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tracks, setTracks] = useState<PlaylistTrack[]>(fallbackTracks);
  const [isLoadingTelegram, setIsLoadingTelegram] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  async function loadTelegramTracks(sync = false) {
    try {
      setIsLoadingTelegram(true);
      setTelegramError(null);

      const loadedTracks = sync
        ? await syncTelegramTracks()
        : await getTelegramTracks();

      setTracks(loadedTracks.length > 0 ? loadedTracks : fallbackTracks);
    } catch (error) {
      setTelegramError(
        error instanceof Error ? error.message : "Telegram loading error",
      );
    } finally {
      setIsLoadingTelegram(false);
    }
  }

  useEffect(() => {
    loadTelegramTracks(false);
  }, []);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredTracks = normalizedSearchQuery
    ? tracks.filter((track) => {
        const searchableText = [
          track.title,
          track.artist,
          track.source,
          track.duration,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearchQuery);
      })
    : tracks;

  function openAddMenu(track: PlaylistTrack) {
    setIsAddMenuClosing(false);
    setSelectedTrack(track);
  }

  function closeAddMenu() {
    if (!selectedTrack) return;

    setIsAddMenuClosing(true);

    window.setTimeout(() => {
      setSelectedTrack(null);
      setIsAddMenuClosing(false);
    }, 240);
  }

  function handleAddTrack(playlistId: string) {
    if (!selectedTrack) return;

    onAddTrackToPlaylist(playlistId, selectedTrack);
    closeAddMenu();
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-purple-100/45 transition focus-within:border-purple-300/35">
        <Search size={16} />

        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search tracks, artists or sources..."
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-purple-100/35"
        />

        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="rounded-full p-1 text-purple-100/35 transition hover:bg-white/10 hover:text-white"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => loadTelegramTracks(false)}
          disabled={isLoadingTelegram}
          className="rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-3 text-sm text-purple-50 transition hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoadingTelegram ? "Loading..." : "Load Telegram tracks"}
        </button>

        <button
          onClick={() => loadTelegramTracks(true)}
          disabled={isLoadingTelegram}
          className="rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-50 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sync bot messages
        </button>
      </div>

      {telegramError && (
        <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100/75">
          {telegramError}
        </div>
      )}

      {selectedTrack &&
        (() => {
          const trackToAdd = selectedTrack;

          return (
            <div
              className={`rounded-3xl border border-purple-300/20 bg-purple-500/10 p-4 ${
                isAddMenuClosing
                  ? "animate-[playerMenuOut_240ms_cubic-bezier(0.7,0,0.84,0)_forwards]"
                  : "animate-[playerMenuIn_340ms_cubic-bezier(0.16,1,0.3,1)]"
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Add to playlist
                  </p>
                  <p className="mt-1 text-xs text-purple-100/45">
                    {trackToAdd.title} · {trackToAdd.artist}
                  </p>
                </div>

                <button
                  onClick={closeAddMenu}
                  className="rounded-full p-1 text-purple-100/40 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              {playlists.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-purple-300/20 bg-black/25 p-4 text-center">
                  <p className="text-sm text-purple-100/60">
                    You do not have playlists yet.
                  </p>

                  <button
                    onClick={onOpenCreatePlaylist}
                    className="mt-3 rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-2 text-sm text-purple-50 transition hover:bg-purple-500/25"
                  >
                    Create playlist
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {playlists.map((playlist) => {
                    const alreadyAdded = playlist.tracks.some(
                      (track) => track.id === trackToAdd.id,
                    );

                    return (
                      <div
                        key={playlist.id}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-sm transition ${
                          alreadyAdded
                            ? "border-white/10 bg-white/[0.03] text-purple-100/30"
                            : "border-purple-300/15 bg-black/25 text-purple-50 hover:bg-purple-500/10"
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="block truncate font-semibold">
                            {playlist.name}
                          </span>

                          <span className="mt-1 block text-xs text-purple-100/40">
                            {alreadyAdded
                              ? "Already added"
                              : `${playlist.tracks.length} tracks`}
                          </span>
                        </div>

                        <button
                          onClick={() => handleAddTrack(playlist.id)}
                          disabled={alreadyAdded}
                          className="shrink-0 rounded-xl border border-purple-300/20 bg-purple-500/15 px-3 py-2 text-xs text-purple-50 transition hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {alreadyAdded ? "Added" : "Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1 noctra-scrollbar">
        {filteredTracks.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center rounded-3xl border border-dashed border-purple-300/20 bg-white/[0.025] p-6 text-center">
            <div>
              <Music size={26} className="mx-auto mb-3 text-purple-100/40" />

              <p className="text-sm font-semibold text-white">
                No tracks found
              </p>

              <p className="mt-2 text-xs leading-5 text-purple-100/45">
                Try another title, artist or source.
              </p>
            </div>
          </div>
        ) : (
          filteredTracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              queue={filteredTracks}
              onPlay={onPlayTrack}
              onAdd={openAddMenu}
              addTitle="Add to playlist"
            />
          ))
        )}
      </div>
    </div>
  );
}

function PlaylistsWindowContent({
  playlists,
  onOpenCreate,
  onOpenPlaylistDetails,
}: {
  playlists: Playlist[];
  onOpenCreate: () => void;
  onOpenPlaylistDetails: (playlistId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredPlaylists = normalizedSearchQuery
    ? playlists.filter((playlist) => {
        const searchableText = [
          playlist.name,
          playlist.description,
          playlist.privacy,
          `${playlist.tracks.length} tracks`,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearchQuery);
      })
    : playlists;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-purple-100/45 transition focus-within:border-purple-300/35">
        <Search size={16} />

        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search playlists..."
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-purple-100/35"
        />

        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="rounded-full p-1 text-purple-100/35 transition hover:bg-white/10 hover:text-white"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <button
        onClick={onOpenCreate}
        className="flex items-center justify-center gap-2 rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-3 text-sm text-purple-50 transition hover:bg-purple-500/25"
      >
        <Plus size={16} />
        Create playlist
      </button>

      {playlists.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-3xl border border-dashed border-purple-300/20 bg-white/[0.025] p-6 text-center">
          <div>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15">
              <ListMusic size={24} />
            </div>

            <h3 className="text-lg font-semibold text-white">
              No playlists yet
            </h3>

            <p className="mt-2 max-w-xs text-sm leading-6 text-purple-100/45">
              Create your first playlist with a custom name, cover and
              description.
            </p>
          </div>
        </div>
      ) : filteredPlaylists.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-3xl border border-dashed border-purple-300/20 bg-white/[0.025] p-6 text-center">
          <div>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15">
              <ListMusic size={24} />
            </div>

            <h3 className="text-lg font-semibold text-white">
              No playlists found
            </h3>

            <p className="mt-2 max-w-xs text-sm leading-6 text-purple-100/45">
              Try another playlist name, description or privacy type.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1 noctra-scrollbar">
          {filteredPlaylists.map((playlist) => (
            <button
              key={playlist.id}
              onClick={() => onOpenPlaylistDetails(playlist.id)}
              className="flex w-full gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-purple-300/25 hover:bg-white/[0.07]"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-purple-300/15 bg-gradient-to-br from-purple-500/35 to-black">
                {playlist.cover && (
                  <img
                    src={playlist.cover}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="truncate text-sm font-semibold">
                      {playlist.name}
                    </h3>

                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-purple-100/45">
                      {playlist.description || "No description yet."}
                    </p>
                  </div>

                  <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-purple-100/45">
                    {playlist.privacy}
                  </span>
                </div>

                <p className="mt-2 text-xs text-purple-200/45">
                  {playlist.tracks.length} tracks
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaylistDetailsWindowContent({
  playlists,
  selectedPlaylistId,
  onUpdatePlaylist,
  onDeletePlaylist,
  onRemoveTrackFromPlaylist,
  onPlayTrack,
}: {
  playlists: Playlist[];
  selectedPlaylistId: string | null;
  onUpdatePlaylist: (
    playlistId: string,
    playlist: Omit<Playlist, "id" | "tracks">,
  ) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  onPlayTrack: (track: PlaylistTrack, queue?: PlaylistTrack[]) => void;
}) {
  const playlist = playlists.find((item) => item.id === selectedPlaylistId);

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<PlaylistPrivacy>("Public");
  const [cover, setCover] = useState<string | null>(null);

  useEffect(() => {
    if (!playlist) return;

    setName(playlist.name);
    setDescription(playlist.description);
    setPrivacy(playlist.privacy);
    setCover(playlist.cover);
    setIsEditing(false);
  }, [playlist?.id]);

  if (!playlist) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-purple-300/20 bg-white/[0.025] p-6 text-center">
        <div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15">
            <ListMusic size={24} />
          </div>

          <h3 className="text-lg font-semibold text-white">
            No playlist selected
          </h3>

          <p className="mt-2 max-w-xs text-sm leading-6 text-purple-100/45">
            Open the Playlists window and choose a playlist to inspect.
          </p>
        </div>
      </div>
    );
  }

  function handleCoverChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCover(reader.result);
      }
    };

    reader.readAsDataURL(file);
  }

  function handleSave() {
    if (!playlist) return;

    const trimmedName = name.trim();

    if (!trimmedName) return;

    onUpdatePlaylist(playlist.id, {
      name: trimmedName,
      description: description.trim(),
      privacy,
      cover,
    });

    setIsEditing(false);
}

  function handleCancel() {
    if (!playlist) return;

    setName(playlist.name);
    setDescription(playlist.description);
    setPrivacy(playlist.privacy);
    setCover(playlist.cover);
    setIsEditing(false);
  }

  function handleDelete() {
    if (!playlist) return;

    const shouldDelete = window.confirm(
      `Delete playlist "${playlist.name}"? This cannot be undone.`,
    );

    if (!shouldDelete) return;

    onDeletePlaylist(playlist.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="grid grid-cols-[180px_1fr] gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
        <div className="space-y-3">
          <div className="h-44 overflow-hidden rounded-3xl border border-purple-300/15 bg-gradient-to-br from-purple-500/35 to-black">
            {cover && (
              <img
                src={cover}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </div>

          {isEditing && (
            <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-2 text-xs text-purple-50 transition hover:bg-purple-500/25">
              Change cover
              <input
                type="file"
                accept="image/*"
                onChange={handleCoverChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        <div className="min-w-0">
          {isEditing ? (
            <div className="space-y-3">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xl font-bold text-white outline-none placeholder:text-purple-100/30 focus:border-purple-300/40"
                placeholder="Playlist name"
              />

              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="h-20 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-purple-100/30 focus:border-purple-300/40"
                placeholder="Playlist description"
              />

              <div className="grid grid-cols-3 gap-2">
                {(["Public", "Friends", "Private"] as PlaylistPrivacy[]).map(
                  (item) => (
                    <button
                      key={item}
                      onClick={() => setPrivacy(item)}
                      className={`rounded-2xl border px-3 py-2 text-xs transition ${
                        privacy === item
                          ? "border-purple-300/35 bg-purple-500/25 text-white"
                          : "border-white/10 bg-white/[0.04] text-purple-100/55 hover:bg-white/[0.07]"
                      }`}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={!name.trim()}
                  className="rounded-2xl border border-purple-300/25 bg-purple-500/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save changes
                </button>

                <button
                  onClick={handleCancel}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-purple-100/60 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-2xl font-bold text-white">
                    {playlist.name}
                  </h3>

                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-purple-100/45">
                    {playlist.description || "No description yet."}
                  </p>
                </div>

                <span className="shrink-0 rounded-full border border-purple-300/15 bg-black/25 px-3 py-1 text-xs text-purple-100/50">
                  {playlist.privacy}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-lg font-semibold text-white">
                    {playlist.tracks.length}
                  </p>
                  <p className="text-xs text-purple-100/40">Tracks</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-lg font-semibold text-white">
                    {playlist.tracks.length === 0 ? "—" : "Ready"}
                  </p>
                  <p className="text-xs text-purple-100/40">Status</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-lg font-semibold text-white">Noctra</p>
                  <p className="text-xs text-purple-100/40">Source</p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-2 text-sm text-purple-50 transition hover:bg-purple-500/25"
                >
                  Edit playlist
                </button>

                <button
                  onClick={handleDelete}
                  className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-2 text-sm text-red-100/75 transition hover:bg-red-500/20"
                >
                  Delete playlist
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-white">Tracks</h4>

          <p className="text-xs text-purple-100/40">
            {playlist.tracks.length} total
          </p>
        </div>

        {playlist.tracks.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-purple-300/15 bg-white/[0.025] p-6 text-center">
            <div>
              <Music size={26} className="mx-auto mb-3 text-purple-100/40" />

              <p className="text-sm font-semibold text-white">
                No tracks inside yet
              </p>

              <p className="mt-2 max-w-xs text-xs leading-5 text-purple-100/45">
                Open Music Search and add tracks to this playlist.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {playlist.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                queue={playlist.tracks}
                onPlay={onPlayTrack}
                onRemove={(trackToRemove) =>
                  onRemoveTrackFromPlaylist(playlist.id, trackToRemove.id)
                }
                removeTitle="Remove from playlist"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreatePlaylistWindowContent({
  onCreate,
}: {
  onCreate: (playlist: Omit<Playlist, "id" | "tracks">) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<PlaylistPrivacy>("Public");
  const [cover, setCover] = useState<string | null>(null);

  function handleCoverChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCover(reader.result);
      }
    };

  reader.readAsDataURL(file);
}

  function handleCreate() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    onCreate({
      name: trimmedName,
      description: description.trim(),
      privacy,
      cover,
    });

    setName("");
    setDescription("");
    setPrivacy("Public");
    setCover(null);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_1fr] gap-4">
      <div className="space-y-4">
        <div className="h-64 overflow-hidden rounded-3xl border border-purple-300/15 bg-gradient-to-br from-purple-500/35 to-black shadow-xl shadow-purple-950/25">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm leading-6 text-purple-100/45">
              Playlist cover preview
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-3 text-sm text-purple-50 transition hover:bg-purple-500/25">
          Upload cover
          <input
            type="file"
            accept="image/*"
            onChange={handleCoverChange}
            className="hidden"
          />
        </label>
      </div>

      <div className="flex min-h-0 flex-col gap-4">
        <div>
          <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-purple-100/40">
            Playlist name
          </label>

          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Dark Sovereigns"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-purple-100/30 focus:border-purple-300/40"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-purple-100/40">
            Description
          </label>

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the atmosphere of this playlist..."
            className="h-32 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 outline-none placeholder:text-purple-100/30 focus:border-purple-300/40"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-purple-100/40">
            Privacy
          </label>

          <div className="grid grid-cols-3 gap-2">
            {(["Public", "Friends", "Private"] as PlaylistPrivacy[]).map(
              (item) => (
                <button
                  key={item}
                  onClick={() => setPrivacy(item)}
                  className={`rounded-2xl border px-4 py-3 text-sm transition ${
                    privacy === item
                      ? "border-purple-300/35 bg-purple-500/25 text-white"
                      : "border-white/10 bg-white/[0.04] text-purple-100/55 hover:bg-white/[0.07]"
                  }`}
                >
                  {item}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <div>
            <p className="text-sm font-semibold text-white">
              Ready to compose?
            </p>
            <p className="mt-1 text-xs text-purple-100/45">
              Create a new playlist and add tracks later.
            </p>
          </div>

          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="rounded-2xl border border-purple-300/25 bg-purple-500/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create playlist
          </button>
        </div>
      </div>
    </div>
  );
}

function FriendsWindowContent() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-purple-100/45">
        <Search size={16} />
        Search friends...
      </div>

      {friends.map(([name, activity, statusColor]) => (
        <div
          key={name}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/[0.07]"
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/20 font-semibold">
              {name[0]}

              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-black ${statusColor}`}
              />
            </div>

            <div>
              <p className="text-sm font-semibold">{name}</p>
              <p className="text-xs text-purple-100/45">{activity}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatWindowContent() {
  return (
    <div className="flex h-full flex-col gap-3">
      {[
        "This profile theme looks insane.",
        "Need to add music sync next.",
        "Telegram bot could send activity notifications.",
      ].map((message) => (
        <div
          key={message}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-purple-100/70"
        >
          {message}
        </div>
      ))}

      <div className="mt-auto flex gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">
        <input
          placeholder="Send a test message..."
          className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-purple-100/35"
        />

        <button className="rounded-xl bg-purple-500/25 px-4 text-sm">
          Send
        </button>
      </div>
    </div>
  );
}

function CustomizeWindowContent() {
  return (
    <div className="grid h-full grid-cols-3 gap-3">
      <Panel title="Accent color">
        <div className="flex gap-2">
          {["bg-purple-500", "bg-blue-500", "bg-pink-500", "bg-red-500"].map(
            (color) => (
              <button
                key={color}
                className={`h-7 w-7 rounded-full border border-white/20 ${color}`}
              />
            ),
          )}
        </div>
      </Panel>

      <Panel title="Widgets">
        <div className="space-y-2 text-xs text-purple-100/55">
          <Toggle label="Profile" />
          <Toggle label="Music search" />
          <Toggle label="Telegram feed" />
        </div>
      </Panel>

      <Panel title="Layout preset">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((item) => (
            <button
              key={item}
              className="h-14 rounded-xl border border-purple-300/15 bg-purple-500/10"
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function TelegramWindowContent() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-4">
        <p className="text-sm font-semibold text-yellow-100">
          Experimental integration
        </p>

        <p className="mt-2 text-xs leading-5 text-yellow-100/55">
          Telegram is planned for test chat, notifications and music feed. Bot
          tokens must stay on backend.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Bot status" value="Mock" />
        <Stat label="Mode" value="Test" />
      </div>

      <input
        placeholder="Paste Telegram channel link..."
        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-purple-100/35 focus:border-purple-300/40"
      />

      <button className="w-full rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-3 text-sm transition hover:bg-purple-500/25">
        Import test feed
      </button>
    </div>
  );
}

function TelegramTracksWindowContent() {
  const telegramTracks = [
    {
      id: "tg-1",
      title: "Noctra Channel Drop",
      artist: "Telegram Feed",
      source: "Mock channel post",
      duration: "3:16",
    },
    {
      id: "tg-2",
      title: "Dark Ambient Upload",
      artist: "Noctra Music Test",
      source: "Audio post",
      duration: "4:02",
    },
    {
      id: "tg-3",
      title: "Community Track Submission",
      artist: "Unknown Artist",
      source: "Forwarded post",
      duration: "2:44",
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-4">
        <p className="text-sm font-semibold text-yellow-100">
          Telegram feed mock
        </p>

        <p className="mt-2 text-xs leading-5 text-yellow-100/55">
          Real Telegram tracks require a backend. The bot token must stay in
          server environment variables, never in frontend code.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          placeholder="Paste channel link or chat id..."
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-purple-100/35 focus:border-purple-300/40"
        />

        <button className="rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-3 text-sm text-purple-50 transition hover:bg-purple-500/25">
          Import
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1 noctra-scrollbar">
        {telegramTracks.map((track) => (
          <div
            key={track.id}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/[0.07]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-purple-950/40">
              <Radio size={18} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {track.title}
              </p>
              <p className="text-xs text-purple-100/45">
                {track.artist} · {track.source}
              </p>
            </div>

            <span className="text-xs text-purple-100/35">
              {track.duration}
            </span>

            <button className="rounded-full bg-purple-500/25 p-2 text-white transition hover:bg-purple-500/40">
              <Play size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsWindowContent() {
  return (
    <div className="space-y-3">
      {["SoundCloud", "Audius", "Telegram Bot"].map((source) => (
        <div
          key={source}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
        >
          <div className="flex items-center gap-2">
            {source === "SoundCloud" && <Music size={16} />}
            {source === "Audius" && <Heart size={16} />}
            {source === "Telegram Bot" && <Bot size={16} />}

            <p className="text-sm font-semibold">{source}</p>
          </div>

          <p className="mt-2 text-xs leading-5 text-purple-100/45">
            Not connected yet. Must be connected through backend/serverless
            functions, not directly in frontend code.
          </p>
        </div>
      ))}

      <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-red-100">
          <Settings size={16} />
          API safety
        </div>

        <p className="text-xs leading-5 text-red-100/55">
          API keys and Telegram bot tokens must never be stored directly in
          frontend code.
        </p>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-purple-100/45">
        {title}
      </p>

      {children}
    </div>
  );
}

function Toggle({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>

      <span className="h-5 w-9 rounded-full bg-purple-500/30 p-0.5">
        <span className="block h-4 w-4 rounded-full bg-purple-200" />
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs text-purple-100/40">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}