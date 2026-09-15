import {
  Bot,
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
  checkTelegramHealth,
  getTelegramTracks,
  syncTelegramTracks,
} from "../../services/telegramTracks";
import { searchAudiusTracks } from "../../services/audius";

import { getWindowMeta } from "../../data/windowRegistry";
import type { WindowId } from "../../types/windows";
import { DesktopWindow } from "../windows/DesktopWindow";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Playlist, PlaylistPrivacy, PlaylistTrack } from "../../types/playlist";
import { LayoutGroup, motion } from "motion/react";
import { VirtualTrackList } from "../tracks/VirtualTrackList";
import { useT } from "../../i18n/useT";
import {
  WINDOW_SUBTITLE_KEYS,
  WINDOW_TITLE_KEYS,
} from "../../i18n/windowKeys";
import { useAppStore } from "../../store/useAppStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { ACCENT_PRESETS } from "../../theme/accents";
import type { AccentPresetId } from "../../theme/accents";

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
  const { t } = useT();

  // Плеер-стор: подсветка активного трека, очередь, плей/пауза в списках.
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id ?? null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const pushToQueue = usePlayerStore((s) => s.pushToQueue);

  // Стабильная идентичность колбэка — обязательное условие для `memo` на TrackRow.
  const toggleActiveTrack = useCallback(() => {
    const player = usePlayerStore.getState();
    player.setIsPlaying(!player.isPlaying);
  }, []);

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
                title={t(WINDOW_TITLE_KEYS[windowId])}
                subtitle={t(WINDOW_SUBTITLE_KEYS[windowId])}
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
                  currentTrackId,
                  isPlaying,
                  onQueueTrack: pushToQueue,
                  onToggleActiveTrack: toggleActiveTrack,
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
  /** id активного трека в плеере (для подсветки/статуса). */
  currentTrackId: string | null;
  isPlaying: boolean;
  /** Добавить трек в пользовательскую очередь. */
  onQueueTrack: (track: PlaylistTrack) => void;
  /** Пауза/возобновление активного трека. */
  onToggleActiveTrack: () => void;
};

function renderWindowContent(id: WindowId, context: WindowContentContext) {
  switch (id) {
    case "music-search":
      return (
        <MusicSearchWindowContent
          playlists={context.playlists}
          onAddTrackToPlaylist={context.onAddTrackToPlaylist}
          onOpenCreatePlaylist={() => context.onOpenWindow("create-playlist")}
          onPlayTrack={context.onPlayTrack}
          currentTrackId={context.currentTrackId}
          isPlaying={context.isPlaying}
          onQueueTrack={context.onQueueTrack}
          onToggleActiveTrack={context.onToggleActiveTrack}
          favoriteTracks={context.favoriteTracks}
          onToggleFavoriteTrack={context.onToggleFavoriteTrack}
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
          currentTrackId={context.currentTrackId}
          isPlaying={context.isPlaying}
          onQueueTrack={context.onQueueTrack}
          onToggleActiveTrack={context.onToggleActiveTrack}
          favoriteTracks={context.favoriteTracks}
          onToggleFavoriteTrack={context.onToggleFavoriteTrack}
        />
      );
    
    case "favorites":
      return (
        <FavoritesWindowContent
          favoriteTracks={context.favoriteTracks}
          onPlayTrack={context.onPlayTrack}
          onRemoveFavoriteTrack={context.onRemoveFavoriteTrack}
          currentTrackId={context.currentTrackId}
          isPlaying={context.isPlaying}
          onQueueTrack={context.onQueueTrack}
          onToggleActiveTrack={context.onToggleActiveTrack}
          onToggleFavoriteTrack={context.onToggleFavoriteTrack}
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
  currentTrackId,
  isPlaying,
  onQueueTrack,
  onToggleActiveTrack,
  onToggleFavoriteTrack,
}: {
  favoriteTracks: PlaylistTrack[];
  onPlayTrack: (track: PlaylistTrack, queue?: PlaylistTrack[]) => void;
  onRemoveFavoriteTrack: (trackId: string) => void;
  currentTrackId: string | null;
  isPlaying: boolean;
  onQueueTrack: (track: PlaylistTrack) => void;
  onToggleActiveTrack: () => void;
  onToggleFavoriteTrack: (track: PlaylistTrack) => void;
}) {
  const { t } = useT();
  const [searchQuery, setSearchQuery] = useState("");

  // В этом окне все треки уже избранные; ссылку держим стабильной для `memo`.
  const alwaysFavorite = useCallback(() => true, []);
  const removeFavorite = useCallback(
    (track: PlaylistTrack) => onRemoveFavoriteTrack(track.id),
    [onRemoveFavoriteTrack],
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredFavoriteTracks = useMemo(
    () =>
      normalizedSearchQuery
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
        : favoriteTracks,
    [favoriteTracks, normalizedSearchQuery],
  );

  if (favoriteTracks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-purple-300/20 bg-white/[0.025] p-6 text-center">
        <div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15">
            <Heart size={24} />
          </div>

          <h3 className="text-lg font-semibold text-white">
            {t("workspace.favorites.none")}
          </h3>

          <p className="mt-2 max-w-xs text-sm leading-6 text-purple-100/45">
            {t("workspace.favorites.none.body")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-3xl border border-purple-300/15 bg-purple-500/10 p-4">
        <p className="text-sm font-semibold text-white">
          {t("workspace.favorites.title")}
        </p>
        <p className="mt-1 text-xs text-purple-100/45">
          {t("workspace.favorites.saved", { count: favoriteTracks.length })}
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-purple-100/45 transition focus-within:border-purple-300/35">
        <Search size={16} />

        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t("workspace.favorites.search")}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-purple-100/35"
        />

        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="rounded-full p-1 text-purple-100/35 transition hover:bg-white/10 hover:text-white"
            title={t("workspace.search.clear")}
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
                {t("workspace.favorites.empty")}
              </p>

              <p className="mt-2 text-xs leading-5 text-purple-100/45">
                {t("workspace.tracks.empty.body")}
              </p>
            </div>
          </div>
        ) : (
          <VirtualTrackList
            tracks={filteredFavoriteTracks}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            isFavorite={alwaysFavorite}
            onPlay={onPlayTrack}
            onTogglePlay={onToggleActiveTrack}
            onQueue={onQueueTrack}
            onToggleFavoriteTrack={onToggleFavoriteTrack}
            onRemove={removeFavorite}
            removeTitle={t("workspace.removeFavorites")}
          />
        )}
      </div>
    </div>
  );
}

function EmptyWorkspace() {
  const { t } = useT();

  return (
    <div className="flex min-h-0 items-center justify-center rounded-[28px] border border-purple-200/15 bg-black/40 p-8 text-center">
      <div>
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-purple-300/20 bg-purple-500/15">
          <Music size={28} />
        </div>

        <h2 className="text-2xl font-semibold">{t("workspace.empty.title")}</h2>

        <p className="mt-3 max-w-md text-sm leading-6 text-purple-100/50">
          {t("workspace.empty.body")}
        </p>
      </div>
    </div>
  );
}


function MusicSearchWindowContent({
  playlists,
  onAddTrackToPlaylist,
  onOpenCreatePlaylist,
  onPlayTrack,
  currentTrackId,
  isPlaying,
  onQueueTrack,
  onToggleActiveTrack,
  favoriteTracks,
  onToggleFavoriteTrack,
}: {
  playlists: Playlist[];
  onAddTrackToPlaylist: (playlistId: string, track: PlaylistTrack) => void;
  onOpenCreatePlaylist: () => void;
  onPlayTrack: (track: PlaylistTrack, queue?: PlaylistTrack[]) => void;
  currentTrackId: string | null;
  isPlaying: boolean;
  onQueueTrack: (track: PlaylistTrack) => void;
  onToggleActiveTrack: () => void;
  favoriteTracks: PlaylistTrack[];
  onToggleFavoriteTrack: (track: PlaylistTrack) => void;
}) {
  const { t } = useT();
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
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // ── Источник музыки: Telegram (сервер) или Audius (открытый API) ──
  const [source, setSource] = useState<"telegram" | "audius">("telegram");
  const [audiusQuery, setAudiusQuery] = useState("");
  const [audiusResults, setAudiusResults] = useState<PlaylistTrack[]>([]);
  const [isLoadingAudius, setIsLoadingAudius] = useState(false);
  const [audiusError, setAudiusError] = useState<string | null>(null);

  async function runAudiusSearch() {
    const query = audiusQuery.trim();
    if (!query) return;

    try {
      setIsLoadingAudius(true);
      setAudiusError(null);
      const results = await searchAudiusTracks(query);
      setAudiusResults(results);
    } catch (error) {
      setAudiusError(
        error instanceof Error ? error.message : "audius_error",
      );
      setAudiusResults([]);
    } finally {
      setIsLoadingAudius(false);
    }
  }

  async function loadTelegramTracks(sync = false) {
    try {
      setIsLoadingTelegram(true);
      setTelegramError(null);

      const loadedTracks = sync
        ? await syncTelegramTracks()
        : await getTelegramTracks();

      setTracks(loadedTracks.length > 0 ? loadedTracks : fallbackTracks);
      setServerOnline(true);
    } catch (error) {
      setServerOnline(false);
      setTelegramError(
        error instanceof Error ? error.message : t("workspace.telegram.error"),
      );
    } finally {
      setIsLoadingTelegram(false);
    }
  }

  useEffect(() => {
    loadTelegramTracks(false);
    void checkTelegramHealth().then((health) =>
      setServerOnline(Boolean(health?.ok)),
    );
  }, []);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredTracks = useMemo(
    () =>
      source === "audius"
        ? audiusResults
        : normalizedSearchQuery
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
          : tracks,
    [source, audiusResults, tracks, normalizedSearchQuery],
  );

  // Стабильные колбэки и быстрый lookup избранного для виртуализированного списка.
  const favoriteIds = useMemo(
    () => new Set(favoriteTracks.map((track) => track.id)),
    [favoriteTracks],
  );
  const isFavoriteTrack = useCallback(
    (track: PlaylistTrack) => favoriteIds.has(track.id),
    [favoriteIds],
  );
  const openAddMenu = useCallback((track: PlaylistTrack) => {
    setIsAddMenuClosing(false);
    setSelectedTrack(track);
  }, []);

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
      {/* Табы источника */}
      <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-black/25 p-1">
        {([
          { id: "telegram", label: "Telegram" },
          { id: "audius", label: "Audius" },
        ] as const).map((item) => (
          <button
            key={item.id}
            onClick={() => setSource(item.id)}
            className={`rounded-xl px-4 py-2 text-sm transition ${
              source === item.id
                ? "bg-purple-500/25 text-white"
                : "text-purple-100/45 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {source === "telegram" ? (
        <>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-purple-100/45 transition focus-within:border-purple-300/35">
            <Search size={16} />

            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("workspace.search.placeholder")}
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-purple-100/35"
            />

            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="inline-flex aspect-square items-center justify-center rounded-full p-1 leading-none text-purple-100/35 transition hover:bg-white/10 hover:text-white"
                title={t("workspace.search.clear")}
              >
                <X size={14} className="m-0 block" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => loadTelegramTracks(false)}
              disabled={isLoadingTelegram}
              className="rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-3 text-sm text-purple-50 transition hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoadingTelegram
                ? t("workspace.telegram.loading")
                : t("workspace.telegram.load")}
            </button>

            <button
              onClick={() => loadTelegramTracks(true)}
              disabled={isLoadingTelegram}
              className="rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-50 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("workspace.telegram.sync")}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-purple-100/45 transition focus-within:border-purple-300/35">
            <Search size={16} />

            <input
              value={audiusQuery}
              onChange={(event) => setAudiusQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runAudiusSearch();
              }}
              placeholder={t("workspace.audius.search")}
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-purple-100/35"
            />

            {audiusQuery && (
              <button
                onClick={() => {
                  setAudiusQuery("");
                  setAudiusResults([]);
                  setAudiusError(null);
                }}
                className="inline-flex aspect-square items-center justify-center rounded-full p-1 leading-none text-purple-100/35 transition hover:bg-white/10 hover:text-white"
                title={t("workspace.search.clear")}
              >
                <X size={14} className="m-0 block" />
              </button>
            )}
          </div>

          <button
            onClick={() => void runAudiusSearch()}
            disabled={isLoadingAudius || !audiusQuery.trim()}
            className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoadingAudius
              ? t("workspace.telegram.loading")
              : t("workspace.audius.searchAction")}
          </button>
        </>
      )}

      {source === "telegram" && (
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              serverOnline === null
                ? "bg-zinc-500"
                : serverOnline
                  ? "bg-emerald-400"
                  : "bg-red-400"
            }`}
          />
          <span className="text-purple-100/45">
            {t("workspace.telegram.server")}:{" "}
            {serverOnline === null
              ? t("workspace.telegram.checking")
              : serverOnline
                ? t("workspace.telegram.online")
                : t("workspace.telegram.offline")}
          </span>
        </div>
      )}

      {source === "telegram" && telegramError && (
        <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100/75">
          {telegramError}
        </div>
      )}

      {source === "audius" && audiusError && (
        <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100/75">
          {t("workspace.audius.error")}
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
                    {t("workspace.add.playlist")}
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
                    {t("workspace.youHaveNoPlaylists")}
                  </p>

                  <button
                    onClick={onOpenCreatePlaylist}
                    className="mt-3 rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-2 text-sm text-purple-50 transition hover:bg-purple-500/25"
                  >
                    {t("workspace.createPlaylist")}
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
                              ? t("workspace.alreadyAdded")
                              : t("workspace.countTracks", {
                                  count: playlist.tracks.length,
                                })}
                          </span>
                        </div>

                        <button
                          onClick={() => handleAddTrack(playlist.id)}
                          disabled={alreadyAdded}
                          className="shrink-0 rounded-xl border border-purple-300/20 bg-purple-500/15 px-3 py-2 text-xs text-purple-50 transition hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {alreadyAdded
                            ? t("workspace.added")
                            : t("workspace.add")}
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
                {source === "audius" && !audiusQuery.trim() && !audiusResults.length
                  ? t("workspace.audius.hint")
                  : t("workspace.tracks.empty")}
              </p>

              <p className="mt-2 text-xs leading-5 text-purple-100/45">
                {source === "audius"
                  ? t("workspace.audius.hintBody")
                  : t("workspace.tracks.empty.body")}
              </p>
            </div>
          </div>
        ) : (
          <VirtualTrackList
            tracks={filteredTracks}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            isFavorite={isFavoriteTrack}
            onPlay={onPlayTrack}
            onTogglePlay={onToggleActiveTrack}
            onQueue={onQueueTrack}
            onToggleFavoriteTrack={onToggleFavoriteTrack}
            onAdd={openAddMenu}
            addTitle={t("workspace.add.playlist")}
          />
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
  const { t } = useT();
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
          placeholder={t("workspace.playlists.search")}
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
        {t("workspace.playlists.create")}
      </button>

      {playlists.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-3xl border border-dashed border-purple-300/20 bg-white/[0.025] p-6 text-center">
          <div>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15">
              <ListMusic size={24} />
            </div>

            <h3 className="text-lg font-semibold text-white">
              {t("workspace.playlists.none")}
            </h3>

            <p className="mt-2 max-w-xs text-sm leading-6 text-purple-100/45">
              {t("workspace.playlists.none.body")}
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
              {t("workspace.playlists.noneFound")}
            </h3>

            <p className="mt-2 max-w-xs text-sm leading-6 text-purple-100/45">
              {t("workspace.playlists.noneFound.body")}
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
                      {playlist.description || t("workspace.noDescription")}
                    </p>
                  </div>

                  <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-purple-100/45">
                    {playlist.privacy}
                  </span>
                </div>

                <p className="mt-2 text-xs text-purple-200/45">
                  {t("workspace.countTracks", { count: playlist.tracks.length })}
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
  currentTrackId,
  isPlaying,
  onQueueTrack,
  onToggleActiveTrack,
  favoriteTracks,
  onToggleFavoriteTrack,
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
  currentTrackId: string | null;
  isPlaying: boolean;
  onQueueTrack: (track: PlaylistTrack) => void;
  onToggleActiveTrack: () => void;
  favoriteTracks: PlaylistTrack[];
  onToggleFavoriteTrack: (track: PlaylistTrack) => void;
}) {
  const { t } = useT();
  const playlist = playlists.find((item) => item.id === selectedPlaylistId);

  // Стабильный lookup избранного для виртуализированного списка треков плейлиста.
  const favoriteIds = useMemo(
    () => new Set(favoriteTracks.map((track) => track.id)),
    [favoriteTracks],
  );
  const isFavoriteTrack = useCallback(
    (track: PlaylistTrack) => favoriteIds.has(track.id),
    [favoriteIds],
  );
  const removeFromPlaylist = useCallback(
    (track: PlaylistTrack) => {
      if (playlist) onRemoveTrackFromPlaylist(playlist.id, track.id);
    },
    [playlist, onRemoveTrackFromPlaylist],
  );

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
            {t("workspace.details.none")}
          </h3>

          <p className="mt-2 max-w-xs text-sm leading-6 text-purple-100/45">
            {t("workspace.details.none.body")}
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
      t("workspace.details.delete.confirm", { name: playlist.name }),
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
              {t("workspace.playlist.cover")}
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
                placeholder={t("workspace.playlist.name")}
              />

              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="h-20 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-purple-100/30 focus:border-purple-300/40"
                placeholder={t("workspace.playlist.description")}
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
                      {t(`workspace.create.privacy.${item}`)}
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
                  {t("workspace.saveChanges")}
                </button>

                <button
                  onClick={handleCancel}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-purple-100/60 transition hover:bg-white/[0.08] hover:text-white"
                >
                  {t("workspace.cancel")}
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
                    {playlist.description || t("workspace.noDescription")}
                  </p>
                </div>

                <span className="shrink-0 rounded-full border border-purple-300/15 bg-black/25 px-3 py-1 text-xs text-purple-100/50">
                  {t(`workspace.create.privacy.${playlist.privacy}`)}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-lg font-semibold text-white">
                    {playlist.tracks.length}
                  </p>
                  <p className="text-xs text-purple-100/40">
                    {t("workspace.details.tracks")}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-lg font-semibold text-white">
                    {playlist.tracks.length === 0
                      ? "—"
                      : t("workspace.details.status.ready")}
                  </p>
                  <p className="text-xs text-purple-100/40">
                    {t("workspace.details.status")}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-lg font-semibold text-white">Noctra</p>
                  <p className="text-xs text-purple-100/40">
                    {t("workspace.details.source")}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-2 text-sm text-purple-50 transition hover:bg-purple-500/25"
                >
                  {t("workspace.details.edit")}
                </button>

                <button
                  onClick={handleDelete}
                  className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-2 text-sm text-red-100/75 transition hover:bg-red-500/20"
                >
                  {t("workspace.details.delete")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-white">
            {t("workspace.details.tracks")}
          </h4>

          <p className="text-xs text-purple-100/40">
            {t("workspace.details.total", { count: playlist.tracks.length })}
          </p>
        </div>

        {playlist.tracks.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-purple-300/15 bg-white/[0.025] p-6 text-center">
            <div>
              <Music size={26} className="mx-auto mb-3 text-purple-100/40" />

              <p className="text-sm font-semibold text-white">
                {t("workspace.details.noTracks")}
              </p>

              <p className="mt-2 max-w-xs text-xs leading-5 text-purple-100/45">
                {t("workspace.details.noTracks.body")}
              </p>
            </div>
          </div>
        ) : (
          <VirtualTrackList
            tracks={playlist.tracks}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            isFavorite={isFavoriteTrack}
            onPlay={onPlayTrack}
            onTogglePlay={onToggleActiveTrack}
            onQueue={onQueueTrack}
            onToggleFavoriteTrack={onToggleFavoriteTrack}
            onRemove={removeFromPlaylist}
            removeTitle={t("workspace.removeFromPlaylist")}
          />
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
  const { t } = useT();
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
              {t("workspace.create.coverPreview")}
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-3 text-sm text-purple-50 transition hover:bg-purple-500/25">
          {t("workspace.create.uploadCover")}
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
            {t("workspace.create.labelName")}
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
            {t("workspace.create.labelDesc")}
          </label>

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("workspace.create.labelDescPlaceholder")}
            className="h-32 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 outline-none placeholder:text-purple-100/30 focus:border-purple-300/40"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-purple-100/40">
            {t("workspace.create.labelPrivacy")}
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
                  {t(`workspace.create.privacy.${item}`)}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <div>
            <p className="text-sm font-semibold text-white">
              {t("workspace.create.ready")}
            </p>
            <p className="mt-1 text-xs text-purple-100/45">
              {t("workspace.create.ready.body")}
            </p>
          </div>

          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="rounded-2xl border border-purple-300/25 bg-purple-500/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("workspace.createPlaylist")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FriendsWindowContent() {
  const { t } = useT();
  const fixture = [
    { name: "Nyxshade", actKey: "workspace.friends.act1", color: "bg-emerald-400" },
    { name: "Lunaris", actKey: "workspace.friends.act2", color: "bg-yellow-300" },
    { name: "Svaria", actKey: "workspace.friends.act3", color: "bg-zinc-500" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-purple-100/45">
        <Search size={16} />
        {t("workspace.friends.search")}
      </div>

      {fixture.map((friend) => (
        <div
          key={friend.name}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/[0.07]"
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/20 font-semibold">
              {friend.name[0]}

              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-black ${friend.color}`}
              />
            </div>

            <div>
              <p className="text-sm font-semibold">{friend.name}</p>
              <p className="text-xs text-purple-100/45">
                {t(friend.actKey)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatWindowContent() {
  const { t } = useT();
  const messages = [
    t("workspace.chat.msg1"),
    t("workspace.chat.msg2"),
    t("workspace.chat.msg3"),
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      {messages.map((message) => (
        <div
          key={message}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-purple-100/70"
        >
          {message}
        </div>
      ))}

      <div className="mt-auto flex gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">
        <input
          placeholder={t("workspace.chat.placeholder")}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-purple-100/35"
        />

        <button className="rounded-xl bg-purple-500/25 px-4 text-sm">
          {t("workspace.chat.send")}
        </button>
      </div>
    </div>
  );
}

function CustomizeWindowContent() {
  const { t } = useT();
  const accentPreset = useAppStore((s) => s.accentPreset);
  const accentCustomColor = useAppStore((s) => s.accentCustomColor);
  const setAccentPreset = useAppStore((s) => s.setAccentPreset);
  const setAccentCustomColor = useAppStore((s) => s.setAccentCustomColor);
  const colorInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex h-full flex-col gap-3">
      <Panel title={t("workspace.customize.accent")}>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ACCENT_PRESETS) as Exclude<AccentPresetId, "custom">[]).map(
            (id) => {
              const preset = ACCENT_PRESETS[id];
              const active = accentPreset === id;
              return (
                <button
                  key={id}
                  onClick={() => setAccentPreset(id)}
                  title={t(preset.labelKey)}
                  className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs transition ${
                    active
                      ? "border-purple-300/50 bg-purple-500/20 text-white"
                      : "border-white/10 bg-black/25 text-purple-100/60 hover:bg-white/[0.08]"
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-white/30"
                    style={{ background: preset.swatch }}
                  />
                  {t(preset.labelKey)}
                </button>
              );
            },
          )}

          {/* Свой цвет: клик по всей кнопке открывает скрытый нативный пикер */}
          <button
            type="button"
            onClick={() => colorInputRef.current?.click()}
            className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs transition ${
              accentPreset === "custom"
                ? "border-purple-300/50 bg-purple-500/20 text-white"
                : "border-white/10 bg-black/25 text-purple-100/60 hover:bg-white/[0.08]"
            }`}
          >
            <span
              className="h-4 w-4 rounded-full border border-white/40"
              style={{ background: accentCustomColor }}
            />
            {t("settings.accent.custom")}
          </button>

          <input
            ref={colorInputRef}
            type="color"
            value={accentCustomColor}
            onChange={(e) => setAccentCustomColor(e.target.value)}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      </Panel>
    </div>
  );
}

function TelegramWindowContent() {
  const { t } = useT();
  const [link, setLink] = useState("");
  const [imported, setImported] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-4">
        <p className="text-sm font-semibold text-yellow-100">
          {t("workspace.telegram.experimental")}
        </p>

        <p className="mt-2 text-xs leading-5 text-yellow-100/55">
          {t("workspace.telegram.experimental.body")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label={t("workspace.telegram.botStatus")} value={imported ? "Live" : t("workspace.telegram.mock")} />
        <Stat label={t("settings.language")} value={t("brand.tagline")} />
      </div>

      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder={t("workspace.telegram.channelLink")}
        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-purple-100/35 focus:border-purple-300/40"
      />

      <button
        onClick={() => setImported(Boolean(link.trim()))}
        disabled={!link.trim()}
        className="w-full rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-3 text-sm transition hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("workspace.telegram.import")}
      </button>

      {imported && (
        <p className="text-xs text-emerald-100/70">
          ✦ {t("workspace.telegram.experimental.body")}
        </p>
      )}
    </div>
  );
}

function TelegramTracksWindowContent() {
  const { t } = useT();
  const telegramTracks = [
    {
      id: "tg-1",
      title: t("workspace.tgfeed.t1title"),
      artist: t("workspace.tgfeed.t1artist"),
      source: "Mock",
      duration: "3:16",
    },
    {
      id: "tg-2",
      title: t("workspace.tgfeed.t2title"),
      artist: t("workspace.tgfeed.t2artist"),
      source: "Mock",
      duration: "4:02",
    },
    {
      id: "tg-3",
      title: t("workspace.tgfeed.t3title"),
      artist: t("workspace.tgfeed.t3artist"),
      source: "Mock",
      duration: "2:44",
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-4">
        <p className="text-sm font-semibold text-yellow-100">
          {t("workspace.tgfeed.mock")}
        </p>

        <p className="mt-2 text-xs leading-5 text-yellow-100/55">
          {t("workspace.tgfeed.mock.body")}
        </p>
      </div>

      <div className="flex gap-2">
        <input
          placeholder={t("workspace.tgfeed.channelOrChat")}
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-purple-100/35 focus:border-purple-300/40"
        />

        <button className="rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-3 text-sm text-purple-50 transition hover:bg-purple-500/25">
          {t("workspace.tgfeed.import")}
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
  const { t } = useT();
  const languagePreference = useAppStore((s) => s.languagePreference);
  const resolvedLocale = useAppStore((s) => s.resolvedLocale);
  const setLanguagePreference = useAppStore((s) => s.setLanguagePreference);
  const profile = useAppStore((s) => s.profile);

  const sourceItems: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: "SoundCloud", label: t("settings.soundcloud"), icon: <Music size={16} /> },
    { key: "Audius", label: t("settings.audius"), icon: <Heart size={16} /> },
    { key: "Telegram", label: t("settings.telegram.bot"), icon: <Bot size={16} /> },
  ];

  const langOptions: { value: "auto" | "ru" | "en"; label: string }[] = [
    { value: "auto", label: t("settings.language.auto") },
    { value: "ru", label: t("settings.language.ru") },
    { value: "en", label: t("settings.language.en") },
  ];

  return (
    <div className="space-y-3">
      {/* Язык интерфейса */}
      <div className="rounded-2xl border border-purple-300/20 bg-purple-500/10 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-purple-100">
          <PaletteLangIcon />
          {t("settings.language")} · {resolvedLocale === "ru" ? "Русский" : "English"}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {langOptions.map((opt) => {
            const active = languagePreference === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setLanguagePreference(opt.value)}
                className={`rounded-2xl border px-3 py-2.5 text-xs font-semibold transition ${
                  active
                    ? "border-purple-300/40 bg-purple-500/25 text-white"
                    : "border-white/10 bg-white/[0.04] text-purple-100/60 hover:bg-white/[0.08]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Аккаунт / профиль */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-purple-100">
          <UserPillIcon size={16} />
          {profile ? profile.nick : t("settings.accountInfo")}
        </div>

        <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-purple-100/45">
          {profile ? `${profile.nick} · ${profile.handle}` : t("settings.demoAccount")}
        </div>

        <p className="mt-3 text-xs leading-5 text-purple-100/45">
          {t("settings.demoAccount")}
        </p>
      </div>

      {/* Музыкальные источники */}
      <div className="mt-1 border-t border-white/10 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-purple-100/40">
          {t("settings.musicSources")}
        </p>

        <div className="flex flex-col gap-3">
          {sourceItems.map((source) => (
            <div
              key={source.key}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-purple-300/15 bg-purple-500/10">
                  {source.icon}
                </span>
                <p className="text-sm font-semibold">{source.label}</p>
                <span className="ml-auto rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-purple-100/35">
                  {t("workspace.telegram.mock")}
                </span>
              </div>

              <p className="mt-2 text-xs leading-5 text-purple-100/45">
                {t("settings.notConnected")}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-red-100">
          <Settings size={16} />
          {t("settings.apiSafety")}
        </div>

        <p className="text-xs leading-5 text-red-100/55">
          {t("settings.apiSafety.body")}
        </p>
      </div>
    </div>
  );
}

// Иконки для настроек.
function PaletteLangIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}

function UserPillIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs text-purple-100/40">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}