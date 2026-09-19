import { useCallback, useEffect, useRef, useState } from "react";

import { AmbientBackground } from "../common/AmbientBackground";
import { BottomPlayer } from "./BottomPlayer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Workspace } from "./Workspace";
import { ProfileDashboard } from "../profile/ProfileDashboard";
import { MobileNav } from "./MobileNav";
import { MobileMiniPlayer } from "./MobileMiniPlayer";
import { MobilePlayerSheet } from "./MobilePlayerSheet";
import type { Playlist, PlaylistTrack } from "../../types/playlist";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useLibraryStore } from "../../store/useLibraryStore";
import { useProgressionStore } from "../../store/useProgressionStore";
import { usePlayerHotkeys } from "../../hooks/usePlayerHotkeys";
import { useMediaSession } from "../../hooks/useMediaSession";
import { useIsMobile, useIsCompactWindows } from "../../hooks/useIsMobile";

import type { WindowId } from "../../types/windows";

type AppShellProps = {
  onLogout: () => void;
  /** Открыть окно входа — для гостя без аккаунта. */
  onRequestSignIn: () => void;
};

const MAX_REGULAR_WINDOWS = 4;

const defaultWindows: WindowId[] = ["music-search", "playlists"];

export function AppShell({ onLogout, onRequestSignIn }: AppShellProps) {
  // Пробел, стрелки, M — управление плеером с клавиатуры.
  usePlayerHotkeys();

  // Системные медиа-клавиши (Fn+F8, кнопки на наушниках) и карточка трека
  // в системном оверлее.
  useMediaSession();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [openedWindows, setOpenedWindows] =
    useState<WindowId[]>(defaultWindows);
  const [closingWindows, setClosingWindows] = useState<WindowId[]>([]);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [isPlayerClosing, setIsPlayerClosing] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [activeWindow, setActiveWindow] = useState<WindowId | null>(
    defaultWindows[0],
  );

  /*
   * Мобильный режим.
   *
   * Десктопный каркас (сайдбар + сетка окон + нижняя панель плеера) на узком
   * экране не работает: сайдбар съедает треть ширины, а окна рассчитаны на
   * мышь. Поэтому ниже две независимые ветки рендера — десктопная и мобильная,
   * а состояние (окна, плеер, дашборд) общее: переключение ширины не теряет
   * ни трек, ни очередь, ни открытое окно.
   */
  const isMobile = useIsMobile();

  /*
   * Компактный режим окон.
   *
   * На экранах до 1280px (телефоны, планшеты, небольшие мониторы) показываем
   * одно окно на весь контейнер вместо сетки. Остальные ждут в стеке, между
   * ними можно листать свайпом. На мобилке включается всегда, на десктопе —
   * только на узких экранах.
   */
  const isNarrowScreen = useIsCompactWindows();
  const singleWindowMode = isMobile || isNarrowScreen;

  // Активное окно подсвечивается в мобильном меню. Отдельного состояния
  // таба больше нет: меню показывает то же, что открыто в каркасе.

  // Полноэкранный плеер мобильной версии (BottomSheet).
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

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
  const addTrackToPlaylist = useCallback(
    (playlistId: string, track: PlaylistTrack) => {
      addTrackToPlaylistInStore(playlistId, track);
    },
    [addTrackToPlaylistInStore],
  );

  const openWindow = useCallback((windowId: WindowId) => {
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
  }, []);

  /*
   * Стабильная ссылка нужна из-за чтения состояния внутри setTimeout:
   * берём актуальные значения из замыкания через функциональные обновления,
   * а `isPlayerOpen`/`closingWindows`/`activeWindow` читаем по ссылкам-рефам,
   * чтобы не пересоздавать колбэк на каждый рендер.
   */
  const isPlayerOpenRef = useRef(isPlayerOpen);
  const isPlayerClosingRef = useRef(isPlayerClosing);
  const closingWindowsRef = useRef(closingWindows);
  const activeWindowRef = useRef(activeWindow);

  useEffect(() => {
    isPlayerOpenRef.current = isPlayerOpen;
    isPlayerClosingRef.current = isPlayerClosing;
    closingWindowsRef.current = closingWindows;
    activeWindowRef.current = activeWindow;
  });

  const closeWindow = useCallback((windowId: WindowId) => {
    if (windowId === "player") {
      if (!isPlayerOpenRef.current || isPlayerClosingRef.current) {
        return;
      }

      setIsPlayerClosing(true);

      window.setTimeout(() => {
        setIsPlayerOpen(false);
        setIsPlayerClosing(false);
      }, 320);

      return;
    }

    if (closingWindowsRef.current.includes(windowId)) {
      return;
    }

    setClosingWindows((current) => [...current, windowId]);

    window.setTimeout(() => {
      setOpenedWindows((currentWindows) => {
        const nextWindows = currentWindows.filter((id) => id !== windowId);

        if (activeWindowRef.current === windowId) {
          setActiveWindow(nextWindows[nextWindows.length - 1] ?? null);
        }

        return nextWindows;
      });

      setClosingWindows((current) => current.filter((id) => id !== windowId));
    }, 320);
  }, []);

  const openedWithSpecials: WindowId[] = isPlayerOpen
    ? [...openedWindows, "player"]
    : openedWindows;

  /*
   * Страховка активного окна.
   *
   * `activeWindow` может отстать от `openedWindows`: окно выкинуто лимитом
   * при открытии пятого, закрыто, или состояние рассинхронизировалось после
   * свайпа. Тогда карусель показывает пустой экран — окна открыты, но ни одно
   * не совпадает с активным.
   *
   * Чиним во время рендера, а не в эффекте: это производное состояние
   * (активное = последнее открытое, если текущее пропало), и правило React
   * «не вызывай setState в эффекте» здесь соблюдается буквально. Флаг
   * гарантирует однократность — бесконечного цикла рендеров нет.
   */
  if (activeWindow && !openedWindows.includes(activeWindow)) {
    setActiveWindow(openedWindows[openedWindows.length - 1] ?? null);
  }

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
    /*
     * Сохранение прогресса при уходе со страницы.
     *
     * `beforeunload` для этого не подходит: браузер не даёт дождаться
     * асинхронной записи и закрывает страницу раньше, чем уходит запрос.
     * `visibilitychange` со состоянием `hidden` срабатывает надёжно —
     * при закрытии вкладки, сворачивании окна и уходе в фон на телефоне.
     */
    const handleVisibilityChange = () => {
      useProgressionStore.getState().flushOnHide();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Дополнительная страховка для случаев, когда вкладку именно закрывают.
    const flush = () => {
      void useProgressionStore.getState().flushToCloud();
    };

    window.addEventListener("pagehide", flush);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  /*
   * Heartbeat: раз в 30 секунд дописываем прогресс в базу, пока играет музыка.
   *
   * Троттлинг внутри стора и так отправляет изменения, но при долгом
   * непрерывном прослушивании полезно иметь гарантированную точку сохранения —
   * на случай, если отдельная запись потерялась в сети.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      const { isPlaying } = usePlayerStore.getState();
      if (!isPlaying) return;
      void useProgressionStore.getState().flushToCloud();
    }, 30_000);

    return () => window.clearInterval(id);
  }, []);

  /**
   * Выбор окна из мобильного меню — это просто открытие окна.
   *
   * Отдельного состояния таба нет: меню подсвечивает активное окно каркаса
   * (`activeWindow`), поэтому рассинхрона «таб говорит одно, открыто другое»
   * не бывает в принципе.
   *
   * Объявлено здесь, а не рядом с состоянием выше: нужен `openWindow`,
   * который определён через useCallback ниже по файлу.
   */
  const selectMobileWindow = useCallback(
    (windowId: WindowId) => {
      openWindow(windowId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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

/*
 * Колбэки, которые уходят в плеер, обязаны иметь СТАБИЛЬНУЮ ссылку.
 *
 * AppShell перерисовывается на любое изменение стора (лайк, пауза, открытие
 * профиля). Если передавать обычные функции, у них каждый раз новая ссылка,
 * и эффекты в плеере перезапускаются — а перезапуск эффекта смены трека
 * делает pause() + load(), то есть откатывает трек на начало. Именно из-за
 * этого пауза не работала: нажатие меняло состояние, рендер перезапускал
 * эффект, и трек начинался заново.
 */
const playNextTrack = useCallback(() => {
  storePlayNext();
}, [storePlayNext]);

const playPreviousTrack = useCallback(() => {
  storePlayPrevious();
}, [storePlayPrevious]);

const closePlayer = useCallback(() => {
  closeWindow("player");
}, [closeWindow]);

/** Играть трек: стабильная ссылка — уходит в список треков и в плеер. */
const playTrack = useCallback(
  (track: PlaylistTrack, queue: PlaylistTrack[] = [track]) => {
    storePlayTrack(track, queue);
    setIsPlayerOpen(true);
  },
  [storePlayTrack],
);

const selectQueueTrack = useCallback(
  (track: PlaylistTrack) => {
    storeSelectQueueTrack(track);
  },
  [storeSelectQueueTrack],
);

const createPlaylist = useCallback(
  (newPlaylist: Omit<Playlist, "id" | "tracks">) => {
    createPlaylistInStore(newPlaylist);
    openWindow("playlists");
  },
  [createPlaylistInStore, openWindow],
);

const openPlaylistDetails = useCallback(
  (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    openWindow("playlist-details");
  },
  [openWindow],
);

/** Обёртка: UI вызывает по id, стор — по id (удаление из избранного). */
const removeFavoriteTrack = useCallback(
  (trackId: string) => {
    removeFavoriteTrackFromStore(trackId);
  },
  [removeFavoriteTrackFromStore],
);

const isCurrentTrackFavorite = currentTrack
  ? favoriteTracks.some((track) => track.id === currentTrack.id)
  : false;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#08080a] text-white">
      <AmbientBackground />

      {/*
        Мобильная ветка.
        
        Одна колонка: меню сверху, окно в середине, мини-плеер внизу — всё
        в потоке, друг под другом. Плеер НЕ поверх окна: наложение давало
        слишком много проблем (контент под плеером, клики мимо, рассинхрон
        при скролле), поэтому возвращаем классическую компоновку.
      */}
      {isMobile ? (
        <div className="relative z-10 mx-auto flex h-full max-h-screen w-full flex-col gap-2.5 overflow-hidden px-2 pb-2 pt-2">
          <MobileNav
            activeWindow={activeWindow}
            onOpenWindow={selectMobileWindow}
            onOpenProfile={() => setIsDashboardOpen(true)}
          />

          <div className="min-h-0 flex-1 overflow-hidden">
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
              singleWindow={singleWindowMode}
            />
          </div>

          <div className="shrink-0">
            <MobileMiniPlayer onExpand={() => setIsMobileSheetOpen(true)} />
          </div>

          {/*
            Скрытый движок плеера для мобильной версии.
            
            BottomPlayer — это не только панель управления, но и сам плеер:
            внутри живут <audio>, сторож загрузки, Media Session и мост
            команд для стора. Без него нечего воспроизводить.
            
            Раньше он рендерился ТОЛЬКО в десктопной ветке, поэтому на
            телефоне треки не играли: аудио-элемента просто не существовало.
            Теперь он есть всегда — на мобилке визуально скрыт, работает
            как звуковой движок, а управление идёт через мини-плеер и шторку.
          */}
          <div className="hidden">
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
              onClose={closePlayer}
            />
          </div>
        </div>
      ) : (
        <div
          className={`relative z-10 grid h-screen max-h-screen gap-3 overflow-hidden p-3 transition-[grid-template-columns] duration-500 ease-out ${
            /*
             * Ширина колонки под меню.
             *
             * Свёрнутая: кнопки 40px + внутренние отступы панели (p-3 = 24px)
             * + рамка. 70px хватает с запасом, чтобы круги не липли к краям.
             * Развёрнутая: те же отступы плюс место под подписи.
             */
            isSidebarCollapsed ? "grid-cols-[70px_1fr]" : "grid-cols-[264px_1fr]"
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
              singleWindow={singleWindowMode}
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
                onClose={closePlayer} />
            )}
          </section>
        </div>
      )}

      <MobilePlayerSheet
        isOpen={isMobileSheetOpen && isMobile}
        onClose={() => setIsMobileSheetOpen(false)}
        isFavorite={isCurrentTrackFavorite}
        onToggleFavorite={() => {
          if (currentTrack) toggleFavoriteTrack(currentTrack);
        }}
      />

      <ProfileDashboard
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        favoriteCount={favoriteTracks.length}
      />
    </main>
  );
}