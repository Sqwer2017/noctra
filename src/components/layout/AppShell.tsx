import { useEffect, useState } from "react";

import { Background } from "./Background";
import { BottomPlayer } from "./BottomPlayer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Workspace } from "./Workspace";
import type { Playlist, PlaylistTrack } from "../../types/playlist";

import type { WindowId } from "../../types/windows";

type AppShellProps = {
  onLogout: () => void;
};

const MAX_REGULAR_WINDOWS = 4;

const defaultWindows: WindowId[] = ["profile", "music-search", "playlists"];

const initialPlaylists: Playlist[] = [];
const PLAYLISTS_STORAGE_KEY = "noctra.playlists";
const FAVORITES_STORAGE_KEY = "noctra.favoriteTracks";

export function AppShell({ onLogout }: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [openedWindows, setOpenedWindows] =
    useState<WindowId[]>(defaultWindows);
  const [closingWindows, setClosingWindows] = useState<WindowId[]>([]);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [isPlayerClosing, setIsPlayerClosing] = useState(false);
  const [activeWindow, setActiveWindow] = useState<WindowId | null>(
    defaultWindows[0],
  );

  const [favoriteTracks, setFavoriteTracks] = useState<PlaylistTrack[]>(() => {
    try {
      const savedFavorites = localStorage.getItem(FAVORITES_STORAGE_KEY);

      if (!savedFavorites) {
        return [];
      }

      return JSON.parse(savedFavorites) as PlaylistTrack[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteTracks));
  }, [favoriteTracks]);

  function addTrackToPlaylist(playlistId: string, track: PlaylistTrack) {
    setPlaylists((currentPlaylists) =>
      currentPlaylists.map((playlist) => {
        if (playlist.id !== playlistId) {
          return playlist;
        }

        const alreadyExists = playlist.tracks.some(
          (playlistTrack) => playlistTrack.id === track.id,
        );

        if (alreadyExists) {
          return playlist;
        }

        return {
          ...playlist,
          tracks: [...playlist.tracks, track],
        };
      }),
    );
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

  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const savedPlaylists = localStorage.getItem(PLAYLISTS_STORAGE_KEY);

      if (!savedPlaylists) {
        return initialPlaylists;
      }

      const parsedPlaylists = JSON.parse(savedPlaylists) as Playlist[];

      return parsedPlaylists.map((playlist) => ({
        ...playlist,
        description: playlist.description ?? "",
        cover: playlist.cover ?? null,
        privacy: playlist.privacy ?? "Public",
        tracks: Array.isArray(playlist.tracks) ? playlist.tracks : [],
      }));

    } catch {
      return initialPlaylists;
    }
  });

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );

  const [currentTrack, setCurrentTrack] = useState<PlaylistTrack | null>(null);
  const [playQueue, setPlayQueue] = useState<PlaylistTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  useEffect(() => {
  localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
 }, [playlists]);

function createPlaylist(newPlaylist: Omit<Playlist, "id" | "tracks">) {
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    tracks: [],
    ...newPlaylist,
  };

  setPlaylists((current) => [playlist, ...current]);

  openWindow("playlists");
}

function openPlaylistDetails(playlistId: string) {
  setSelectedPlaylistId(playlistId);
  openWindow("playlist-details");
}

function removeTrackFromPlaylist(playlistId: string, trackId: string) {
  setPlaylists((currentPlaylists) =>
    currentPlaylists.map((playlist) => {
      if (playlist.id !== playlistId) {
        return playlist;
      }

      return {
        ...playlist,
        tracks: playlist.tracks.filter((track) => track.id !== trackId),
      };
    }),
  );
}

function updatePlaylist(
  playlistId: string,
  updatedPlaylist: Omit<Playlist, "id" | "tracks">,
) {
  setPlaylists((currentPlaylists) =>
    currentPlaylists.map((playlist) => {
      if (playlist.id !== playlistId) {
        return playlist;
      }

      return {
        ...playlist,
        ...updatedPlaylist,
      };
    }),
  );
}

function deletePlaylist(playlistId: string) {
  setPlaylists((currentPlaylists) =>
    currentPlaylists.filter((playlist) => playlist.id !== playlistId),
  );

  if (selectedPlaylistId === playlistId) {
    setSelectedPlaylistId(null);
    closeWindow("playlist-details");
  }
}

function playTrack(track: PlaylistTrack, queue: PlaylistTrack[] = [track]) {
  const nextQueue = queue.length > 0 ? queue : [track];
  const nextIndex = nextQueue.findIndex((item) => item.id === track.id);

  setPlayQueue(nextQueue);
  setCurrentTrackIndex(nextIndex >= 0 ? nextIndex : 0);
  setCurrentTrack(track);
  setIsPlayerOpen(true);
}

function playNextTrack() {
  if (playQueue.length === 0) return;

  setCurrentTrackIndex((currentIndex) => {
    const nextIndex = (currentIndex + 1) % playQueue.length;
    setCurrentTrack(playQueue[nextIndex]);
    return nextIndex;
  });
}

function playPreviousTrack() {
  if (playQueue.length === 0) return;

  setCurrentTrackIndex((currentIndex) => {
    const nextIndex =
      currentIndex === 0 ? playQueue.length - 1 : currentIndex - 1;

    setCurrentTrack(playQueue[nextIndex]);
    return nextIndex;
  });
}

function selectQueueTrack(track: PlaylistTrack) {
  playTrack(track, playQueue);
}

function toggleFavoriteTrack(track: PlaylistTrack) {
  setFavoriteTracks((currentFavorites) => {
    const alreadyFavorite = currentFavorites.some(
      (favoriteTrack) => favoriteTrack.id === track.id,
    );

    if (alreadyFavorite) {
      return currentFavorites.filter(
        (favoriteTrack) => favoriteTrack.id !== track.id,
      );
    }

    return [track, ...currentFavorites];
  });
}

function removeFavoriteTrack(trackId: string) {
  setFavoriteTracks((currentFavorites) =>
    currentFavorites.filter((track) => track.id !== trackId),
  );
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
    </main>
  );
}