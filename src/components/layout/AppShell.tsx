import { useEffect, useState } from "react";

import { Background } from "./Background";
import { BottomPlayer } from "./BottomPlayer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Workspace } from "./Workspace";
import { ProfileDashboard } from "../profile/ProfileDashboard";
import type { Playlist, PlaylistTrack } from "../../types/playlist";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useLibraryStore } from "../../store/useLibraryStore";
import { useProgressionStore } from "../../store/useProgressionStore";

import type { WindowId } from "../../types/windows";

type AppShellProps = {
  onLogout: () => void;
  /** Открыть окно входа — для гостя без аккаунта. */
  onRequestSignIn: () => void;
};

const MAX_REGULAR_WINDOWS = 4;

const defaultWindows: WindowId[] = ["music-search", "playlists"];

export function AppShell({ onLogout, onRequestSignIn }: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [openedWindows, setOpenedWindows] =
    useState<WindowId[]>(defaultWindows);
  const [closingWindows, setClosingWindows] = useState<WindowId[]>([]);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [isPlayerClosing, setIsPlayerClosing] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [activeWindow, setActiveWindow] = useState<WindowId | null>(
    defaultWindows[0],
  );

  // Избранное и плейлисты живут в сторе: он знает userId, умеет писать
  // в Supabase в фоне и переживает перезагрузку через persist.
  const favoriteTracks = useLibraryStore((s) => s.favoriteTracks);
  const playlists = useLibraryStore((s) => s.playlists);
  const toggleFavoriteTrack = useLibraryStore((s) => s.toggleFavoriteTrack);
  const removeFavoriteTrackFromStore = useLibraryStore(
    (s) => s.removeFavoriteTrack,
  );
  const createPlaylistInStore = useLibraryStore((s) => s.createPlaylist);
  const updatePlaylistInStore = useLibraryStore((s) => s.updatePlaylist);
  const deletePlaylistInStore = useLibraryStore((s) => s.deletePlaylist);
  const addTrackToPlaylistInStore = useLibraryStore((s) => s.addTrackToPlaylist);
  const removeTrackFromPlaylistInStore = useLibraryStore(
    (s) => s.removeTrackFromPlaylist,
  );

  // Регистрируем «открыть плеер» — чтобы действия из дашборда профиля
  // («Сейчас играет») могли развернуть модульный плеер.
  const registerPlayerOpener = usePlayerStore((s) => s.registerPlayerOpener);

  useEffect(() => {
    registerPlayerOpener(() => {
      setIsPlayerClosing(false);
      setIsPlayerOpen(true);
    });
    return () => registerPlayerOpener(null);
  }, [registerPlayerOpener]);

  /** Делегируем в стор: он синхронизирует изменения с Supabase. */
  function addTrackToPlaylist(playlistId: string, track: PlaylistTrack) {
    addTrackToPlaylistInStore(playlistId, track);
  }

  function openWindow(windowId: WindowId) {
  if (windowId === "player") {
    setIsPlayerClosing(false);
    setIsPlayerOpen(true);
    return;
  }

  setClosingWindows((current) => current.filter((id) => id !== windowId));

  setOpenedWindows((currentWindows) => {
    if (currentWindows.includes(windowId)) {
      return currentWindows;
    }

    const nextWindows = [...currentWindows, windowId];

    if (nextWindows.length > MAX_REGULAR_WINDOWS) {
      return nextWindows.slice(nextWindows.length - MAX_REGULAR_WINDOWS);
    }

    return nextWindows;
  });

  setActiveWindow(windowId);
}

  function closeWindow(windowId: WindowId) {
  if (windowId === "player") {
    if (!isPlayerOpen || isPlayerClosing) {
      return;
    }

    setIsPlayerClosing(true);

    window.setTimeout(() => {
      setIsPlayerOpen(false);
      setIsPlayerClosing(false);
    }, 320);

    return;
  }

  if (closingWindows.includes(windowId)) {
    return;
  }

  setClosingWindows((current) => [...current, windowId]);

  window.setTimeout(() => {
    setOpenedWindows((currentWindows) => {
      const nextWindows = currentWindows.filter((id) => id !== windowId);

      if (activeWindow === windowId) {
        setActiveWindow(nextWindows[nextWindows.length - 1] ?? null);
      }

      return nextWindows;
    });

    setClosingWindows((current) => current.filter((id) => id !== windowId));
  }, 320);
}

  const openedWithSpecials: WindowId[] = isPlayerOpen
    ? [...openedWindows, "player"]
    : openedWindows;

  const shouldShowTopBar = openedWindows.length === 0;

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );

  // ── Плеер живёт в zustand-сторе (persist) ──────────────────────────
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const currentTrackIndex = usePlayerStore((s) => s.currentTrackIndex);
  const storePlayTrack = usePlayerStore((s) => s.playTrack);
  const storePlayNext = usePlayerStore((s) => s.playNext);
  const storePlayPrevious = usePlayerStore((s) => s.playPrevious);
  const storeSelectQueueTrack = usePlayerStore((s) => s.selectQueueTrack);

  useEffect(() => {
    // Перед закрытием вкладки дописываем прогресс: иначе последние секунды
    // прослушивания и свежий XP могут не успеть уйти в облако.
    const flush = () => {
      void useProgressionStore.getState().flushToCloud();
    };

    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

function createPlaylist(newPlaylist: Omit<Playlist, "id" | "tracks">) {
  createPlaylistInStore(newPlaylist);
  openWindow("playlists");
}

function openPlaylistDetails(playlistId: string) {
  setSelectedPlaylistId(playlistId);
  openWindow("playlist-details");
}

function removeTrackFromPlaylist(playlistId: string, trackId: string) {
  removeTrackFromPlaylistInStore(playlistId, trackId);
}

function updatePlaylist(
  playlistId: string,
  updatedPlaylist: Omit<Playlist, "id" | "tracks">,
) {
  updatePlaylistInStore(playlistId, updatedPlaylist);
}

function deletePlaylist(playlistId: string) {
  deletePlaylistInStore(playlistId);

  if (selectedPlaylistId === playlistId) {
    setSelectedPlaylistId(null);
    closeWindow("playlist-details");
  }
}

function playTrack(track: PlaylistTrack, queue: PlaylistTrack[] = [track]) {
  storePlayTrack(track, queue);
  setIsPlayerOpen(true);
}

function playNextTrack() {
  storePlayNext();
}

function playPreviousTrack() {
  storePlayPrevious();
}

function selectQueueTrack(track: PlaylistTrack) {
  storeSelectQueueTrack(track);
}

/** Обёртка: UI вызывает по id, стор — по id (удаление из избранного). */
function removeFavoriteTrack(trackId: string) {
  removeFavoriteTrackFromStore(trackId);
}

const isCurrentTrackFavorite = currentTrack
  ? favoriteTracks.some((track) => track.id === currentTrack.id)
  : false;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#05040a] text-white">
      <Background />

      <div
        className={`relative z-10 grid h-screen max-h-screen gap-4 overflow-hidden p-4 transition-[grid-template-columns] duration-500 ease-out ${
          isSidebarCollapsed ? "grid-cols-[92px_1fr]" : "grid-cols-[300px_1fr]"
        }`}
      >
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          openedWindows={openedWithSpecials}
          onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
          onOpenWindow={openWindow}
          onLogout={onLogout}
          onOpenDashboard={() => setIsDashboardOpen(true)}
          isDashboardOpen={isDashboardOpen}
          onRequestSignIn={onRequestSignIn}
        />

        <section
          className={`min-h-0 overflow-hidden grid min-w-0 gap-4 transition-[grid-template-rows] duration-500 ease-out ${
            isPlayerOpen
              ? shouldShowTopBar
                ? "grid-rows-[48px_1fr_92px]"
                : "grid-rows-[1fr_92px]"
              : shouldShowTopBar
                ? "grid-rows-[48px_1fr]"
                : "grid-rows-[1fr]"
          }`}
        >
          {shouldShowTopBar && (
            <TopBar
              openedWindowsCount={openedWindows.length}
              activeWindow={activeWindow}
              maxWindows={MAX_REGULAR_WINDOWS}
            />
          )}

          <Workspace
            openedWindows={openedWindows}
            onAddTrackToPlaylist={addTrackToPlaylist}
            closingWindows={closingWindows}
            activeWindow={activeWindow}
            setActiveWindow={setActiveWindow}
            closeWindow={closeWindow}
            playlists={playlists}
            onCreatePlaylist={createPlaylist}
            onOpenWindow={openWindow}
            selectedPlaylistId={selectedPlaylistId}
            onOpenPlaylistDetails={openPlaylistDetails}
            onRemoveTrackFromPlaylist={removeTrackFromPlaylist}
            onUpdatePlaylist={updatePlaylist}
            onDeletePlaylist={deletePlaylist}
            onPlayTrack={playTrack}
            favoriteTracks={favoriteTracks}
            onToggleFavoriteTrack={toggleFavoriteTrack}
            onRemoveFavoriteTrack={removeFavoriteTrack}
          />

          {isPlayerOpen && (
            <BottomPlayer 
              currentTrack={currentTrack}
              playQueue={playQueue}
              currentTrackIndex={currentTrackIndex}
              playlists={playlists}
              onAddTrackToPlaylist={addTrackToPlaylist}
              onSelectQueueTrack={selectQueueTrack}
              onNextTrack={playNextTrack}
              onPreviousTrack={playPreviousTrack}
              isCurrentTrackFavorite={isCurrentTrackFavorite}
              isClosing={isPlayerClosing}
              onToggleFavoriteTrack={toggleFavoriteTrack}
              onClose={() => closeWindow("player")} />
          )}
        </section>
      </div>

      <ProfileDashboard
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        favoriteCount={favoriteTracks.length}
      />
    </main>
  );
}