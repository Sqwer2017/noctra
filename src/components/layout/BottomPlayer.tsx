import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";

import {
  AlertCircle,
  Check,
  Heart,
  ListMusic,
  ListPlus,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import type { Playlist, PlaylistTrack } from "../../types/playlist";
import { useT } from "../../i18n/useT";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useProgressionStore } from "../../store/useProgressionStore";
import { TrackFocusModal } from "../player/TrackFocusModal";
import { motion } from "motion/react";
import { attachAnalyser, resumeAnalyser } from "../../audio/analyser";

type PlayerMenuState = "closed" | "open" | "closing";

/**
 * Сколько ждать начала воспроизведения, прежде чем считать загрузку сбойной.
 *
 * 12 секунд — с запасом: медленный поток с телефона может стартовать долго,
 * но вечно ждать нельзя, иначе плеер застревает без всякой реакции.
 */
const LOAD_TIMEOUT_MS = 12_000;

/** Сколько раз пробовать перезагрузить поток перед переходом к следующему. */
const MAX_RECOVERY_ATTEMPTS = 2;

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
  const { t } = useT();
  const [queueMenuState, setQueueMenuState] =
    useState<PlayerMenuState>("closed");
  const [playlistMenuState, setPlaylistMenuState] =
    useState<PlayerMenuState>("closed");

  // ── Плеер-стор: режим, статус, очередь ─────────────────────────────
  const playMode = usePlayerStore((s) => s.playMode);
  const cyclePlayMode = usePlayerStore((s) => s.cyclePlayMode);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setIsPlayingInStore = usePlayerStore((s) => s.setIsPlaying);
  const trackQueue = usePlayerStore((s) => s.trackQueue);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const clearQueue = usePlayerStore((s) => s.clearQueue);
  const restartCurrent = usePlayerStore((s) => s.restartCurrent);
  const registerAudioControls = usePlayerStore((s) => s.registerAudioControls);
  const setStoreCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const setStoreDuration = usePlayerStore((s) => s.setDuration);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const setStoreVolume = usePlayerStore((s) => s.setVolume);
  const toggleStoreMute = usePlayerStore((s) => s.toggleMute);

  /*
   * Размер пула воспроизведения = базовый список + пользовательская очередь.
   *
   * Кнопки переключения раньше смотрели только на `playQueue`. Из-за этого
   * в двух случаях они оказывались выключены, хотя переключать было что:
   *  - трек добавлен свайпом/кнопкой «+» (он лежит в trackQueue);
   *  - playQueue сузился до одного трека, а очередь непустая.
   * Теперь учитываем оба источника — ровно то, по чему ходит playNext.
   */
  const poolSize = playQueue.length + trackQueue.length;

  const [isFocusOpen, setIsFocusOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const shouldAutoPlayRef = useRef(false);

  /** Сколько раз пытались восстановить текущий поток. */
  const recoveryAttemptsRef = useRef(0);

  /** Трек не удалось загрузить — показываем это в интерфейсе. */
  const [playbackError, setPlaybackError] = useState(false);

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

  // Регистрируем мост управления реальным <audio> в сторе — чтобы плеер
  // можно было контролировать из «Сейчас играет» в дашборде профиля.
  useEffect(() => {
    registerAudioControls({
      play: () => {
        shouldAutoPlayRef.current = true;
        void startPlayback();
      },
      pause: () => {
        shouldAutoPlayRef.current = false;
        audioRef.current?.pause();
        setIsPlayingInStore(false);
      },
      seek: (seconds) => {
        if (!audioRef.current) return;
        audioRef.current.currentTime = seconds;
        setCurrentTime(seconds);
      },
      setVolume: (value) => {
        if (audioRef.current) audioRef.current.volume = value;
      },
    });

    return () => registerAudioControls(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerAudioControls]);

  // Синхронизируем громкость стора с реальным аудио-элементом.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = effectiveVolume;
  }, [effectiveVolume]);

  /*
   * Подключаем Web Audio анализатор к аудио-элементу (для waveform в профиле).
   *
   * `crossOrigin` выставляется атрибутом на самом элементе (см. JSX), а не
   * здесь: этот эффект выполняется ПОСЛЕ первого рендера, когда `src` уже
   * начал грузиться. Установка CORS задним числом приводила к тому, что
   * первый трек сессии не проходил проверку и не играл.
   */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    attachAnalyser(el);
  }, []);

  /*
   * «Треков прослушано» — счётчик полных прослушиваний.
   *
   * Раньше он увеличивался при СТАРТЕ трека, из-за чего в статистику
   * попадали все переключения: пролистал десять треков по пять секунд —
   * получил десять «прослушанных». Теперь считаем только те, что доиграли
   * до конца (`onEnded` в handleTrackEnded). Текущий трек на паузе или
   * переключённый вручную в статистику не попадает.
   */

  // Прогрессия: считаем прослушанное время раз в секунду, пока играет.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      useProgressionStore.getState().tickListening(1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  useEffect(() => {
    setCurrentTime(0);
    setAudioDuration(0);

    if (!audioRef.current || !currentTrack?.streamUrl) {
      setIsPlayingInStore(false);
      shouldAutoPlayRef.current = false;
      return;
    }

    shouldAutoPlayRef.current = true;
    setPlaybackError(false);

    const element = audioRef.current;

    // Смена источника сразу сбрасывает счётчики восстановления.
    recoveryAttemptsRef.current = 0;

    /*
     * Запускаем загрузку вручную.
     *
     * `<audio src>` обновляется React'ом, но полагаться только на это нельзя:
     * при переходе между треками элемент может сохранить прежнее состояние
     * загрузки, и `canplay` не придёт. Явный `load()` гарантирует, что поток
     * начнут тянуть заново.
     */
    element.pause();
    element.load();

    /*
     * СТОРОЖ ЗАГРУЗКИ.
     *
     * Раньше плеер ждал `canplay` бесконечно: если поток не отдавался
     * (сеть, 404, CORS), событие не приходило никогда, и трек «висел» на
     * 0:00 без единого сообщения — выйти можно было только перезагрузкой.
     *
     * Теперь через LOAD_TIMEOUT_MS проверяем, началось ли воспроизведение.
     * Если нет — пробуем перезагрузить поток, а после нескольких неудач
     * переходим к следующему треку, чтобы плеер не застревал.
     */
    const watchdog = window.setTimeout(() => {
      const el = audioRef.current;
      if (!el) return;

      // Воспроизведение уже пошло — сторож не нужен.
      if (!el.paused && el.currentTime > 0) return;

      // Поток не стартовал. Пробуем восстановиться.
      recoveryAttemptsRef.current += 1;

      if (recoveryAttemptsRef.current <= MAX_RECOVERY_ATTEMPTS) {
        console.warn(
          `[player] трек не начал играть, попытка ${recoveryAttemptsRef.current}`,
        );

        shouldAutoPlayRef.current = true;
        el.load();

        // Даём ещё один шанс на повторной загрузке.
        void startPlayback();
        return;
      }

      // Восстановиться не удалось — честно сообщаем и идём дальше.
      console.error("[player] трек недоступен, переключаем на следующий");
      setPlaybackError(true);
      setIsPlayingInStore(false);

      // Переходим дальше, иначе плеер останется мёртвым на этом треке.
      onNextTrack();
    }, LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(watchdog);
  }, [currentTrack?.id, currentTrack?.streamUrl, setIsPlayingInStore, onNextTrack]);

  function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    if (!audioRef.current || !hasAudioSource) return;

    const nextTime = Number(event.target.value);

    if (Number.isNaN(nextTime)) return;

    audioRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
    setStoreCurrentTime(nextTime);
  }

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const nextVolume = Number(event.target.value) / 100;

    if (Number.isNaN(nextVolume)) return;

    setStoreVolume(nextVolume);
  }

  function toggleMute() {
    toggleStoreMute();
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
      shouldAutoPlayRef.current = true;
      void startPlayback();
    } else {
      shouldAutoPlayRef.current = false;
      audioRef.current.pause();
      setIsPlayingInStore(false);
    }
  }

  async function startPlayback() {
    if (!audioRef.current || !hasAudioSource) return;

    try {
      // Разблокируем AudioContext после пользовательского жеста.
      void resumeAnalyser();
      await audioRef.current.play();
      setIsPlayingInStore(true);
      setPlaybackError(false);
    } catch (error) {
      /*
       * Раньше здесь стоял пустой `catch {}` — ошибка `play()` проглатывалась
       * без следа, и трек молча застревал на 0:00. Теперь различаем причины:
       *  - NotAllowedError — браузер ждёт жеста пользователя (это не сбой);
       *  - остальные (NotSupportedError, AbortError) — проблема с потоком.
       */
      const name = error instanceof Error ? error.name : "";

      if (name === "NotAllowedError") {
        // Автовоспроизведение запрещено политикой браузера: пользователь
        // должен нажать play сам. Это не ошибка загрузки.
        console.info("[player] автовоспроизведение заблокировано браузером");
        setIsPlayingInStore(false);
        return;
      }

      console.warn("[player] не удалось запустить воспроизведение:", error);
      setIsPlayingInStore(false);
      setPlaybackError(true);
    }
  }

  /** onEnded: учитывает режим воспроизведения. */
  function handleTrackEnded() {
    // Трек дослушан полностью — прогресс квеста «Ночной марафон».
    useProgressionStore.getState().registerTrackCompleted();

    if (playMode === "repeat-one") {
      // Зацикливаем текущий трек. `.catch` обязателен: без него отклонённый
      // `play()` становится необработанным отказом и воспроизведение молча
      // умирает на 0:00.
      const element = audioRef.current;
      if (element) {
        element.currentTime = 0;
        void element.play().catch((error: unknown) => {
          console.warn("[player] повтор трека не удался:", error);
          setIsPlayingInStore(false);
        });
      }
      restartCurrent();
      return;
    }

    shouldAutoPlayRef.current = true;
    onNextTrack();
  }

  /**
   * Ошибка загрузки потока.
   *
   * Без этого обработчика сбойный трек оставлял плеер в вечном ожидании:
   * `canplay` не приходил, счётчик времени стоял на нуле, и никакой реакции
   * в интерфейсе не было. Теперь пытаемся перезагрузить поток, а если
   * не выходит — сообщаем и идём дальше.
   */
  function handleAudioError() {
    const element = audioRef.current;
    if (!element || !hasAudioSource) return;

    const mediaError = element.error;

    // Прерывание из-за смены источника — штатная ситуация, не ошибка.
    if (mediaError?.code === MediaError.MEDIA_ERR_ABORTED) return;

    console.warn(
      "[player] ошибка загрузки трека:",
      mediaError?.message || `код ${mediaError?.code ?? "неизвестен"}`,
    );

    recoveryAttemptsRef.current += 1;

    if (recoveryAttemptsRef.current <= MAX_RECOVERY_ATTEMPTS) {
      // Пробуем перезапустить загрузку того же потока.
      shouldAutoPlayRef.current = true;
      element.load();
      return;
    }

    setPlaybackError(true);
    setIsPlayingInStore(false);
    onNextTrack();
  }

  const title = currentTrack?.title ?? t("player.notitle");
  const artist = currentTrack?.artist ?? t("player.noartist");
  const source = currentTrack?.source ?? t("player.source.noctra");
  const duration = currentTrack?.duration ?? t("player.time0");

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
          preload="metadata"
          crossOrigin="anonymous"
          onError={handleAudioError}
          onCanPlay={() => {
            if (!shouldAutoPlayRef.current) return;

            shouldAutoPlayRef.current = false;
            void startPlayback();
          }}
          onTimeUpdate={(event) => {
            const t = event.currentTarget.currentTime;
            setCurrentTime(t);
            setStoreCurrentTime(t);

            // Воспроизведение реально идёт — сбрасываем попытки восстановления,
            // чтобы следующий сбой снова получил полный запас попыток.
            recoveryAttemptsRef.current = 0;
          }}
          onLoadedMetadata={(event) => {
            setAudioDuration(event.currentTarget.duration);
            setStoreDuration(event.currentTarget.duration);
          }}
          onPlay={() => setIsPlayingInStore(true)}
          onPause={() => setIsPlayingInStore(false)}
          onEnded={handleTrackEnded}
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
                {t("player.addToPlaylist.title")}
              </p>
              <p className="text-xs text-purple-100/40">
                {currentTrack ? currentTrack.title : t("player.notitle")}
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
              {t("player.playOrSelectFirst")}
            </div>
          ) : playlists.length === 0 ? (
            <div className="p-5 text-center">
              <p className="text-sm text-purple-100/55">
                {t("player.youHaveNoPlaylists")}
              </p>
              <p className="mt-2 text-xs leading-5 text-purple-100/35">
                {t("player.createFirstHint")}
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
                        {t("player.countTracks", {
                          count: playlist.tracks.length,
                        })}{" "}
                        · {t(`workspace.create.privacy.${playlist.privacy}`)}
                      </p>
                    </div>

                    <button
                      onClick={() => handleAddToPlaylist(playlist.id)}
                      disabled={alreadyAdded}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-purple-300/20 bg-purple-500/15 text-purple-50 transition hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                      title={
                        alreadyAdded
                          ? t("player.alreadyAdded")
                          : t("player.addTrack")
                      }
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
          className={`absolute bottom-[calc(100%+16px)] right-4 z-30 flex max-h-[60vh] w-[380px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0d0f12]/95 shadow-2xl shadow-black/60 backdrop-blur-xl ${
            queueMenuState === "closing"
              ? "animate-[playerMenuOut_240ms_cubic-bezier(0.7,0,0.84,0)_forwards]"
              : "animate-[playerMenuIn_340ms_cubic-bezier(0.16,1,0.3,1)]"
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">
                {t("player.queue")}
              </p>
              <p className="text-xs text-purple-100/40">
                {t("player.countTracks", {
                  count: playQueue.length + trackQueue.length,
                })}
              </p>
            </div>

            <button
              onClick={closeQueueMenu}
              className="rounded-full p-1 text-purple-100/40 transition hover:bg-white/10 hover:text-white"
            >
              <X size={15} />
            </button>
          </div>

          {/* Пользовательская очередь (кнопка +/свайп) */}
          {trackQueue.length > 0 && (
            <div className="border-b border-white/10">
              <div className="flex items-center justify-between px-4 pt-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-purple-100/45">
                  <ListPlus size={13} />
                  {t("player.userQueue")}
                </p>
                <button
                  onClick={clearQueue}
                  className="text-[11px] text-purple-100/40 transition hover:text-red-200"
                >
                  {t("player.clearQueue")}
                </button>
              </div>

              <div className="max-h-48 space-y-1 overflow-auto p-2 noctra-scrollbar">
                {trackQueue.map((track, index) => (
                  <div
                    key={`${track.id}-uq-${index}`}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left text-purple-100/65 transition hover:bg-white/[0.06]"
                  >
                    <button
                      onClick={() => onSelectQueueTrack(track)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-purple-300/10 bg-purple-500/10">
                        {track.coverUrl ? (
                          <img src={track.coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ListPlus size={15} />
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

                    <button
                      onClick={() => removeFromQueue(index)}
                      className="rounded-full p-1 text-purple-100/35 transition hover:bg-red-500/20 hover:text-red-100"
                      title={t("player.removeFromQueue")}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {playQueue.length === 0 && trackQueue.length === 0 ? (
            <div className="p-5 text-center text-sm text-purple-100/45">
              {t("player.noQueue")}
            </div>
          ) : playQueue.length > 0 ? (
            <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2 noctra-scrollbar">
              {playQueue.map((track, index) => {
                const isCurrent = index === currentTrackIndex;

                return (
                  <button
                    key={`${track.id}-${index}`}
                    onClick={() => onSelectQueueTrack(track)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                      isCurrent
                        ? "border-purple-300/25 bg-purple-500/20 text-white"
                        : "border-white/5 bg-white/[0.03] text-purple-100/60 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-purple-300/10 bg-purple-500/10">
                      {track.coverUrl ? (
                        <img src={track.coverUrl} alt="" className="h-full w-full object-cover" />
                      ) : isCurrent && isPlaying ? (
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
          ) : null}
        </div>
      )}

      <motion.button
        type="button"
        layoutId={currentTrack ? `cover-${currentTrack.id}` : "cover-empty"}
        onClick={() => {
          if (currentTrack) setIsFocusOpen(true);
        }}
        disabled={!currentTrack}
        title={currentTrack ? t("player.focusMode") : undefined}
        className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/40 to-black shadow-lg shadow-purple-950/30 transition hover:ring-2 hover:ring-purple-300/40 disabled:cursor-default"
      >
        {currentTrack?.coverUrl ? (
          <img
            src={currentTrack.coverUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-purple-100/50">
            <ListMusic size={18} />
          </span>
        )}
      </motion.button>

      <div className="w-40 min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>

        {/* Ошибка загрузки: раньше плеер молча висел на 0:00 без объяснений. */}
        {playbackError ? (
          <p className="flex items-center gap-1 truncate text-xs text-red-300/80">
            <AlertCircle size={11} className="m-0 block shrink-0" />
            {t("player.loadError")}
          </p>
        ) : (
          <p className="truncate text-xs text-purple-100/45">
            {artist} · {source}
          </p>
        )}
      </div>
    <div className="flex items-center gap-2">
      <button
        onClick={togglePlaylistMenu}
        disabled={!currentTrack}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-purple-100/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${
          playlistMenuState === "open" ? "bg-purple-500/20 text-white" : ""
        }`}
        title={t("player.addToPlaylist")}
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
          isCurrentTrackFavorite
            ? t("player.fav.remove")
            : t("player.fav.add")
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
          {/* Режим воспроизведения (слева от «Предыдущий») */}
          <button
            onClick={cyclePlayMode}
            className={`rounded-full p-1.5 transition hover:bg-white/10 hover:text-white ${
              playMode !== "sequence"
                ? "bg-purple-500/20 text-purple-200"
                : "text-purple-100/50"
            }`}
            title={t(`player.mode.${playMode}`)}
          >
            {playMode === "sequence" && <ListMusic size={16} />}
            {playMode === "repeat-all" && <Repeat size={16} />}
            {playMode === "repeat-one" && <Repeat1 size={16} />}
            {playMode === "shuffle" && <Shuffle size={16} />}
          </button>

          <button
            onClick={onPreviousTrack}
            disabled={poolSize <= 1}
            title={t("player.previous")}
            className="text-purple-100/50 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            <SkipBack size={17} />
          </button>

          <button
            onClick={togglePlayback}
            disabled={!hasAudioSource}
            className="rounded-full bg-purple-500/30 p-3 text-white shadow-lg shadow-purple-900/30 transition hover:bg-purple-500/45 disabled:cursor-not-allowed disabled:opacity-40"
            title={
              hasAudioSource ? t("player.playpause") : t("player.noSource")
            }
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <button
            onClick={onNextTrack}
            disabled={poolSize <= 1}
            title={t("player.next")}
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
          className={`relative rounded-full p-2 transition hover:bg-white/10 hover:text-white ${
            queueMenuState === "open" ? "bg-purple-500/20 text-white" : ""
          }`}
          title={t("player.openQueue")}
        >
          <ListMusic size={18} />
          {trackQueue.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-500 px-1 text-[9px] font-bold text-white">
              {trackQueue.length}
            </span>
          )}
        </button>

        <button
          onClick={toggleMute}
          className="rounded-full p-1 transition hover:bg-white/10 hover:text-white"
          title={isMuted ? t("player.unmute") : t("player.mute")}
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
        title={t("player.close")}
      >
        <X size={16} />
      </button>

      <TrackFocusModal
        track={currentTrack}
        isOpen={isFocusOpen}
        isPlaying={isPlaying}
        onTogglePlay={togglePlayback}
        onNext={onNextTrack}
        onPrevious={onPreviousTrack}
        onClose={() => setIsFocusOpen(false)}
      />
    </footer>
  );
}