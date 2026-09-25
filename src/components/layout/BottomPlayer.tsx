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
  Maximize2,
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
import { isYouTubeTrack } from "../../types/playlist";
import { useT } from "../../i18n/useT";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useProgressionStore } from "../../store/useProgressionStore";
import { TrackFocusModal } from "../player/TrackFocusModal";
import { motion } from "motion/react";
import { attachAnalyser, resumeAnalyser } from "../../audio/analyser";
import { Capacitor } from "@capacitor/core";
import {
  canResolveNatively,
  resolveYouTubeAudio,
} from "../../services/youtubeExtractor";
import {
  YT_STATE,
  initYouTubePlayer,
  isYouTubeReady,
  setYouTubeCallbacks,
  ytGetCurrentTime,
  ytGetDuration,
  ytGetState,
  ytLoadTrack,
  ytPause,
  ytPlay,
  ytSeek,
  ytSetVolume,
} from "../player/YouTubeBridge";

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

/**
 * Сколько ждать при ответе «слишком часто» (HTTP 429).
 *
 * Telegram ограничивает `getFile` частотой 1 запрос в секунду, и на Android
 * `<audio>` дёргает эндпоинт всплеском — метаданные, буферизация, переподключение.
 * При лимите НЕЛЬЗЯ переключать трек: следующий запрос снова упрётся в тот же
 * лимит, и очередь проматывается каскадом, молча пропуская все треки.
 */
const RATE_LIMIT_RETRY_MS = 1_500;

/** Сколько раз пережидать лимит, прежде чем сдаться на текущем треке. */
const MAX_RATE_LIMIT_WAITS = 4;

/**
 * Проверяет поток обычным GET-запросом, прежде чем отдавать его `<audio>`.
 *
 * ЗАЧЕМ ЭТО НУЖНО
 * ---------------
 * Событие `error` у `<audio>` не сообщает HTTP-код ответа: элемент различает
 * лишь четыре обобщённые причины (MEDIA_ERR_NETWORK, MEDIA_ERR_SRC_NOT_SUPPORTED
 * и т.д.). Различить «файла нет» и «Telegram просит подождать» через него
 * невозможно, а поведение нужно противоположное.
 *
 * Заголовок `Range: bytes=0-0` заставляет сервер ответить `206` и одним байтом
 * — полноценная загрузка для проверки не нужна.
 *
 * Возвращает `"ok"` — поток живой; `"rate-limited"` — нужно подождать;
 * `"failed"` — источник недоступен.
 */
async function probeMediaStream(
  url: string,
  signal: AbortSignal,
): Promise<"ok" | "rate-limited" | "failed"> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal,
    });

    if (response.ok || response.status === 206) return "ok";
    if (response.status === 429) return "rate-limited";
    return "failed";
  } catch (error) {
    // Отмена из-за смены трека — не сбой, но проверка не состоялась.
    if (error instanceof Error && error.name === "AbortError") return "failed";
    return "failed";
  }
}

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

  /** Курсор над обложкой: затемнение и подсказка «раскрыть». */
  const [isCoverHovered, setIsCoverHovered] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  /*
   * Ссылки на выпадающие окна — для закрытия по клику вне них.
   *
   * Без этого окно оставалось открытым, пока пользователь не нажмёт крестик
   * или ту же кнопку. Клик в любом другом месте не закрывал его, хотя это
   * привычное поведение для поп-апов.
   */
  const playlistMenuRef = useRef<HTMLDivElement | null>(null);
  const queueMenuRef = useRef<HTMLDivElement | null>(null);
  const playlistButtonRef = useRef<HTMLButtonElement | null>(null);
  const queueButtonRef = useRef<HTMLButtonElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const shouldAutoPlayRef = useRef(false);

  /** Сколько раз пытались восстановить текущий поток. */
  const recoveryAttemptsRef = useRef(0);

  /**
   * Сколько раз подряд текущий трек упирался в лимит запросов Telegram.
   *
   * Считается ОТДЕЛЬНО от `recoveryAttemptsRef`: ожидание лимита — не сбой
   * потока, и тратить на него запас попыток восстановления нельзя. Иначе
   * после четырёх ожиданий трек считался бы битым и очередь поехала бы дальше.
   *
   * Сбрасывается в ноль, когда трек наконец заиграл.
   */
  const rateLimitWaitsRef = useRef(0);

  /**
   * Трек, на котором исчерпаны ожидания лимита.
   *
   * Нужен, чтобы не зациклиться: если Telegram держит лимит дольше, чем мы
   * готовы ждать, трек пропускается ОДИН раз, а не бесконечно.
   */
  const rateLimitGaveUpRef = useRef<string | null>(null);

  /** Трек не удалось загрузить — показываем это в интерфейсе. */
  const [playbackError, setPlaybackError] = useState(false);

  /**
   * Играет ли текущий YouTube-трек через обычный `<audio>`.
   *
   * НА УСТРОЙСТВЕ прямой поток обычно получить удаётся, и тогда трек играет
   * как все остальные — с фоновым воспроизведением. Если поток недоступен
   * (ролик закрыт для анонимного доступа), плеер откатывается на встроенный
   * проигрыватель, и флаг становится `false`.
   *
   * От флага зависит только информационная подпись в интерфейсе: сам плеер
   * разбирается со способом воспроизведения сам.
   */
  const [supportsBackgroundPlayback, setSupportsBackgroundPlayback] =
    useState(false);

  /**
   * Играет ли YouTube-трек.
   *
   * Определяется по источнику: такие треки не проходят через `<audio>`,
   * потому что прямые потоки YouTube недоступны. Управление идёт через
   * встроенный IFrame-плеер.
   */
  const isYouTube = isYouTubeTrack(currentTrack);

  /**
   * Может ли текущий трек вообще воспроизводиться.
   *
   * У источников разные условия: обычным трекам нужен `streamUrl`, а
   * YouTube-трекам — `videoId` (прямых потоков у YouTube нет, играет
   * встроенный плеер). От этого флага зависят доступность кнопок,
   * ползунка времени и запуск воспроизведения.
   */
  const canPlay = isYouTube
    ? Boolean(currentTrack?.videoId)
    : Boolean(currentTrack?.streamUrl);

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

  /*
   * Мост управления плеером для стора.
   *
   * Команды приходят снаружи: из «Сейчас играет» в дашборде, с горячих
   * клавиш, от системных медиа-кнопок. Внутри они разводятся по источнику:
   * YouTube управляется через встроенный плеер, остальные — через `<audio>`.
   *
   * `isYouTubeRef` нужен потому, что эффект регистрируется один раз, а
   * источник трека меняется со временем. Брать его из замыкания нельзя —
   * мост запомнил бы значение на момент регистрации.
   */
  useEffect(() => {
    registerAudioControls({
      play: () => {
        shouldAutoPlayRef.current = true;
        void startPlayback();
      },
      pause: () => {
        shouldAutoPlayRef.current = false;

        /*
         * Останавливаем ТОТ плеер, который звучит.
         *
         * Раньше здесь стояла проверка «трек из YouTube» — и этого было
         * достаточно, пока все YouTube-треки играли через встроенный плеер.
         * Теперь часть из них идёт через `<audio>`, и такая проверка
         * останавливала бы не тот источник: музыка продолжала бы играть.
         */
        if (isEmbeddedPlayerRef.current) ytPause();
        else audioRef.current?.pause();

        setIsPlayingInStore(false);
      },
      /*
       * Реальное состояние воспроизведения.
       *
       * У источников оно лежит в разных местах: у `<audio>` — свойство
       * `paused`, у встроенного YouTube-плеера — код состояния. Спрашиваем
       * тот плеер, который сейчас звучит, иначе ответ был бы всегда «пауза».
       */
      getIsPlaying: () => {
        if (isEmbeddedPlayerRef.current) {
          return ytGetState() === YT_STATE.PLAYING;
        }
        return Boolean(audioRef.current && !audioRef.current.paused);
      },
      seek: (seconds) => {
        if (isEmbeddedPlayerRef.current) {
          ytSeek(seconds);
        } else if (audioRef.current) {
          audioRef.current.currentTime = seconds;
        }

        setCurrentTime(seconds);
        setStoreCurrentTime(seconds);
      },
      setVolume: (value) => {
        // Громкость держим в синхроне у обоих плееров: иначе при переключении
        // источника она скакнёт на прежнее значение.
        if (audioRef.current) audioRef.current.volume = value;
        ytSetVolume(value);
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
   * ПОЧЕМУ ЭТО ОТЛОЖЕНО ДО ПЕРВОГО ОБЫЧНОГО ТРЕКА
   * --------------------------------------------
   * `createMediaElementSource` можно вызвать для элемента РОВНО ОДИН РАЗ,
   * и он требует строгий CORS. У прямых ссылок `googlevideo` (их отдаёт
   * нативный резолвер YouTube) заголовка CORS нет — подключение анализатора
   * к такому элементу ломает воспроизведение целиком.
   *
   * Раньше анализатор подключался сразу при монтировании — то есть ДО того,
   * как становился известен источник. К моменту YouTube-трека он был уже
   * подключён, и отменить это нельзя. Теперь подключаем только тогда, когда
   * точно играет источник со своего домена.
   */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    // YouTube играет с googlevideo — там CORS нет, анализатор не подключаем.
    if (isYouTube) return;

    /*
     * Подключаем к обычному источнику.
     *
     * Если анализатор уже был подключён раньше (обычный трек играл до этого),
     * `attachAnalyser` вернёт существующий — повторный вызов безопасен.
     *
     * Если же YouTube играл ПЕРВЫМ, элемент не был привязан к Web Audio,
     * и сейчас самое время это сделать: `createMediaElementSource` работает
     * с любым текущим состоянием элемента.
     */
    attachAnalyser(el);
  }, [isYouTube]);

  /*
   * «Треков прослушано» — счётчик полных прослушиваний.
   *
   * Раньше он увеличивался при СТАРТЕ трека, из-за чего в статистику
   * попадали все переключения: пролистал десять треков по пять секунд —
   * получил десять «прослушанных». Теперь считаем только те, что доиграли
   * до конца (`onEnded` в handleTrackEnded). Текущий трек на паузе или
   * переключённый вручную в статистику не попадает.
   */

  /*
   * Актуальный признак «играет YouTube».
   *
   * Мост управления регистрируется один раз, поэтому значение источника
   * берётся через ref: иначе замыкание запомнило бы первый трек и все
   * последующие команды уходили бы не тому плееру.
   */
  const isYouTubeRef = useRef(isYouTube);

  useEffect(() => {
    isYouTubeRef.current = isYouTube;
  }, [isYouTube]);

  /**
   * Играет ли YouTube-трек через встроенный плеер прямо сейчас.
   *
   * ЗАЧЕМ ОТДЕЛЬНЫЙ ФЛАГ
   * --------------------
   * Мало знать, что трек из YouTube: важно, КАК он играет. На устройстве
   * прямой поток обычно получить удаётся, и тогда трек звучит через обычный
   * `<audio>` — как Telegram. Но если ролик закрыт для анонимного доступа,
   * плеер откатывается на встроенный проигрыватель.
   *
   * От этого зависит ВСЁ управление: пауза, перемотка, громкость и позиция
   * берутся из разных мест. Если спросить не тот плеер, команды уйдут
   * в никуда — например, пауза нажмётся, а звук продолжится.
   *
   * Ref, а не состояние: мост управления регистрируется один раз
   * и должен читать актуальное значение, а не запомненное при регистрации.
   */
  const isEmbeddedPlayerRef = useRef(true);

  useEffect(() => {
    // У не-YouTube треков всегда играет `<audio>`, встроенный плеер не нужен.
    isEmbeddedPlayerRef.current = isYouTube
      ? !supportsBackgroundPlayback
      : false;
  }, [isYouTube, supportsBackgroundPlayback]);

  /*
   * События встроенного YouTube-плеера.
   *
   * Плеер живёт вне React, поэтому его состояние нужно переводить в стор
   * вручную. Обработчики читают актуальные значения через ref-ы — сам эффект
   * регистрируется однократно и не должен пересоздаваться.
   */
  useEffect(() => {
    setYouTubeCallbacks({
      onReady: () => {
        /*
         * Плеер поднялся; если YouTube-трек уже выбран — готовим его.
         *
         * Загружаем ВСЕГДА в режиме cue (без автозапуска).
         *
         * Раньше здесь передавался `shouldAutoPlayRef.current` — флаг,
         * оставшийся с прошлого запуска. Из-за этого плеер мог сам включить
         * музыку после паузы: достаточно было, чтобы IFrame пересоздался
         * или вкладка «проснулась» — onReady срабатывал и запускал трек,
         * хотя пользователь его останавливал.
         *
         * Запуск — только по явному действию: тап по треку или кнопка play.
         * Подготовка (cue) безопасна: трек загружен и готов, но молчит.
         */
        const track = currentTrackRef.current;
        if (isYouTubeTrack(track) && track?.videoId) {
          void ytLoadTrack(track.videoId, false);
        }
      },
      onPlaying: () => {
        setIsPlayingRef.current(true);
        setPlaybackError(false);
        recoveryAttemptsRef.current = 0;
      },
      onPaused: () => {
        setIsPlayingRef.current(false);
        /*
         * Сбрасываем флаг автозапуска.
         *
         * Пауза означает, что пользователь остановил воспроизведение
         * осознанно. Если флаг остался true, любой последующий `canplay`
         * или `onReady` снова запустил бы трек — именно это давало
         * «самовключение через пару секунд после паузы».
         */
        shouldAutoPlayRef.current = false;
      },
      onEnded: () => {
        // Обработка окончания общая для обоих источников.
        handleTrackEndedRef.current();
      },
      onError: () => {
        /*
         * Видео недоступно: удалено, закрыто или запрещено к встраиванию.
         * Восстановить это нельзя — сразу переходим к следующему треку,
         * иначе плеер встанет навсегда.
         */
        setPlaybackError(true);
        setIsPlayingRef.current(false);
        nextTrackRef.current();
      },
    });

    return () => setYouTubeCallbacks(null);
  }, []);

  /*
   * Опрос позиции встроенного YouTube-плеера.
   *
   * У `<audio>` есть событие `timeupdate`, которое само двигает ползунок.
   * У встроенного плеера такого события нет — позицию приходится спрашивать.
   * 250 мс достаточно для плавного движения и при этом незаметно по нагрузке.
   *
   * Опрос идёт только когда трек действительно играет ЧЕРЕЗ ВСТРОЕННЫЙ плеер:
   * если тот же трек звучит через `<audio>`, позицию двигает `timeupdate`,
   * и опрос только дублировал бы обновления.
   */
  useEffect(() => {
    if (!isYouTube || !isPlaying || supportsBackgroundPlayback) return;

    const id = window.setInterval(() => {
      const time = ytGetCurrentTime();
      const duration = ytGetDuration();

      setCurrentTime(time);
      setStoreCurrentTime(time);

      if (duration > 0) {
        setAudioDuration(duration);
        setStoreDuration(duration);
      }
    }, 250);

    return () => window.clearInterval(id);
  }, [
    isYouTube,
    isPlaying,
    supportsBackgroundPlayback,
    setStoreCurrentTime,
    setStoreDuration,
  ]);

  // Прогрессия: считаем прослушанное время раз в секунду, пока играет.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      useProgressionStore.getState().tickListening(1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  /**
   * Смена трека: перезагрузка потока и запуск воспроизведения.
   *
   * ЭФФЕКТ ЗАВИСИТ ТОЛЬКО ОТ САМОГО ТРЕКА — это принципиально.
   *
   * Раньше в зависимостях были `setIsPlayingInStore` и `onNextTrack`, а также
   * `onClose`/`onToggleFavoriteTrack` в соседних эффектах. Эти колбэки приходят
   * из AppShell обычными функциями: у них новая ссылка на КАЖДОМ рендере
   * AppShell. А AppShell перерисовывается на любое изменение стора — лайк,
   * пауза, открытие профиля, тик прогрессии.
   *
   * Итог: эффект перезапускался от любого клика, и каждый запуск делал
   * `pause()` + `load()`, то есть откатывал трек на 0:00. Пауза не работала
   * в принципе — нажатие меняло состояние, это вызывало рендер, рендер
   * перезапускал эффект, эффект начинал трек заново.
   *
   * Значения, которые нужны внутри, читаем через ref-ы: так эффект остаётся
   * привязанным к смене трека и не реагирует на пересоздание колбэков.
   */
  const nextTrackRef = useRef(onNextTrack);
  const setIsPlayingRef = useRef(setIsPlayingInStore);

  /*
   * Режим воспроизведения читаем через ref, а не напрямую.
   *
   * Эффект смены трека зависит только от самого трека: если добавить в
   * зависимости `playMode`, переключение режима перезапускало бы эффект,
   * а вместе с ним `load()` — трек откатывался бы на начало. При этом режим
   * нужен внутри, чтобы понять, растёт ли серия перемешивания.
   */
  const playModeRef = useRef(playMode);

  /*
   * Текущий трек и обработчик окончания — тоже через ref.
   *
   * Обработчики событий YouTube-плеера регистрируются один раз при
   * монтировании, но должны видеть актуальный трек и актуальную логику
   * перехода. Без ref-ов они бы «застряли» на значениях первого рендера.
   */
  const currentTrackRef = useRef(currentTrack);
  const handleTrackEndedRef = useRef<() => void>(() => {});

  useEffect(() => {
    nextTrackRef.current = onNextTrack;
    setIsPlayingRef.current = setIsPlayingInStore;
    playModeRef.current = playMode;
    currentTrackRef.current = currentTrack;
  });

  useEffect(() => {
    setCurrentTime(0);
    setAudioDuration(0);

    const track = currentTrackRef.current;

    /*
     * ДИАГНОСТИКА ПЛАТФОРМЫ.
     *
     * Логи нужны, чтобы понять, почему на устройстве не срабатывает нативный
     * резолвер: без них не видно ни платформы, ни того, доходит ли управление
     * до нужной ветки. В APK нет панели разработчика, и это единственный
     * способ увидеть состояние в Logcat.
     */
    console.log(
      "[Player] Platform native:",
      Capacitor.isNativePlatform(),
      "| platform:",
      Capacitor.getPlatform(),
    );
    console.log(
      "[Player] Playing track source:",
      track?.source,
      "| videoId:",
      track?.videoId ?? "—",
    );

    /*
     * ВЕТКА YOUTUBE.
     *
     * ДВА СПОСОБА, И ВЫБОР ЗАВИСИТ ОТ ПЛАТФОРМЫ.
     *
     * НА УСТРОЙСТВЕ (Capacitor) сначала пробуем получить прямой аудиопоток
     * и играть через обычный `<audio>` — тот же, что играет Telegram-треки.
     * Только так работает фоновое воспроизведение: встроенный плеер YouTube
     * на Android глушится системой при блокировке экрана.
     *
     * В БРАУЗЕРЕ прямой поток получить нельзя (CORS и блокировка с серверных
     * IP), поэтому там остаётся встроенный проигрыватель. На ПК он работает
     * надёжно и полностью закрывает потребность.
     *
     * Если нативный резолвер не справился — откатываемся на встроенный
     * проигрыватель. Трек в этом случае зазвучит при открытом экране; лучше
     * так, чем молчащая карточка.
     */
    if (isYouTubeTrack(track) && track) {
      shouldAutoPlayRef.current = true;
      setPlaybackError(false);
      recoveryAttemptsRef.current = 0;

      const progression = useProgressionStore.getState();
      progression.registerTrackSource(track.source);
      progression.registerTrackAdvance(
        track.id,
        playModeRef.current === "shuffle",
      );

      const element = audioRef.current;

      /*
       * Глушим оба возможных источника.
       *
       * Без этого при переключении между треками звучали бы оба: `<audio>`
       * продолжает воспроизведение, пока его не остановят, а встроенный
       * плеер — пока его не поставишь на паузу.
       */
      if (element) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }

      ytPause();

      /** Запуск через встроенный проигрыватель — общий запасной путь. */
      const startEmbedded = () => {
        if (isYouTubeReady()) {
          void ytLoadTrack(track.videoId!, true);
        } else {
          void initYouTubePlayer();
        }
      };

      /*
       * На устройстве — пробуем нативный резолвер.
       *
       * `cancelled` защищает от гонки: человек может переключить трек, пока
       * запрос в полёте, и поздний ответ не должен перезаписать состояние
       * уже следующего трека.
       */
      if (canResolveNatively()) {
        console.log("[Player] нативная платформа → запускаю резолвер");

        let cancelled = false;

        void (async () => {
          const stream = await resolveYouTubeAudio(track.videoId!);
          if (cancelled) return;

          if (!stream) {
            /*
             * Резолвер не справился: либо ролик закрыт для анонимного
             * доступа, либо ссылка отдаёт только начало файла.
             * Переключаемся на встроенный проигрыватель.
             */
            console.info(
              "[player] прямой поток недоступен — играем через встроенный плеер",
            );

            setSupportsBackgroundPlayback(false);
            startEmbedded();
            return;
          }

          /*
           * Поток получен и проверен: играем как обычный трек.
           *
           * Ссылка ставится напрямую, а не через состояние: эффект выполняется
           * до того, как React применит атрибут, и `play()` ушёл бы в элемент
           * без источника.
           */
          setSupportsBackgroundPlayback(true);

          const node = audioRef.current;
          if (!node) return;

          node.src = stream.url;
          node.load();

          if (!shouldAutoPlayRef.current) return;

          try {
            await node.play();
            setIsPlayingInStore(true);
          } catch (error) {
            const name = error instanceof Error ? error.name : "";

            // Отмена из-за смены трека — не сбой.
            if (name === "AbortError") return;

            console.warn("[player] не удалось запустить поток YouTube:", error);
            setPlaybackError(true);
            setIsPlayingInStore(false);
          }
        })();

        return () => {
          cancelled = true;
        };
      }

      // Браузер: сразу встроенный проигрыватель.
      console.log(
        "[Player] платформа не нативная → сразу встроенный плеер YouTube",
      );

      setSupportsBackgroundPlayback(false);
      startEmbedded();

      /*
       * Сторож для встроенного плеера.
       *
       * Обычный `<audio>` сообщает о загрузке событием `canplay`, а плеер
       * YouTube — состоянием. Поэтому проверяем его состояние: если через
       * отведённое время воспроизведение так и не началось, считаем трек
       * сбойным и идём дальше.
       */
      const watchdog = window.setTimeout(() => {
        const state = ytGetState();

        if (state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING) return;

        recoveryAttemptsRef.current += 1;

        if (recoveryAttemptsRef.current <= MAX_RECOVERY_ATTEMPTS) {
          console.warn(
            `[player] YouTube-трек не начал играть, попытка ${recoveryAttemptsRef.current}`,
          );
          void ytLoadTrack(track.videoId!, true);
          return;
        }

        console.error("[player] YouTube-трек недоступен, переключаем дальше");
        setPlaybackError(true);
        setIsPlayingRef.current(false);
        nextTrackRef.current();
      }, LOAD_TIMEOUT_MS);

      return () => window.clearTimeout(watchdog);
    }

    /*
     * ВЕТКА ОБЫЧНЫХ ИСТОЧНИКОВ (Telegram, Audius и прочие).
     *
     * Здесь играет `<audio>`. Перед этим глушим YouTube-плеер — по той же
     * причине, что и в ветке выше: два источника не должны звучать разом.
     */
    ytPause();

    if (!audioRef.current || !track?.streamUrl) {
      setIsPlayingRef.current(false);
      shouldAutoPlayRef.current = false;
      return;
    }

    shouldAutoPlayRef.current = true;
    setPlaybackError(false);

    /*
     * Метрики достижений, привязанные к смене трека.
     *
     * Вызываем из того же эффекта, что и загрузку: он срабатывает ровно
     * один раз на трек (зависит только от id), поэтому счётчики не задвоятся
     * от лишних рендеров.
     */
    const progression = useProgressionStore.getState();
    progression.registerTrackSource(track.source);
    progression.registerTrackAdvance(
      track.id,
      playModeRef.current === "shuffle",
    );

    const element = audioRef.current;

    /*
     * Счётчики восстановления и ожиданий лимита сбрасываются на КАЖДОМ новом
     * треке — это правильно для попыток загрузки, но у лимита есть нюанс.
     *
     * Раньше сброс `recoveryAttemptsRef` в ноль на каждой смене трека означал,
     * что при каскадном проматывании каждый трек получал полный запас попыток,
     * то есть 3 новых запроса к `getFile`. На быстрой прокрутке это не давало
     * лимиту остыть, а усугубляло его. Теперь ожидания лимита считаются
     * отдельно, и на трек, где лимит исчерпан, попытки не тратятся вовсе.
     */
    recoveryAttemptsRef.current = 0;
    rateLimitWaitsRef.current = 0;

    /*
     * Проверяем поток ДО загрузки — и, если Telegram просит подождать,
     * пережидаем лимит, не трогая текущий трек.
     *
     * ПОЧЕМУ ИМЕННО ТАК
     * -----------------
     * `getFile` в Telegram ограничен частотой 1 запрос в секунду. На Android
     * `<audio>` обращается к эндпоинту всплеском (метаданные, буферизация,
     * переподключение после сворачивания), упирается в лимит и получает 429.
     * Событие `error` у `<audio>` кода ответа не несёт, поэтому плеер считал
     * трек битым и переходил к следующему — а тот снова попадал в лимит.
     * Так очередь проматывалась целиком, и «второй трек не играет».
     *
     * Отмена через AbortController обязательна: пока идёт проверка, человек
     * может переключить трек, и поздний ответ не должен ничего запускать.
     */
    const probeController = new AbortController();
    const streamUrl = track.streamUrl;

    const loadAndWatch = async () => {
      const result = await probeMediaStream(streamUrl, probeController.signal);

      if (probeController.signal.aborted) return;

      /*
       * Лимит запросов: ждём и пробуем снова ТОТ ЖЕ трек.
       *
       * Переключение здесь было бы ошибкой: следующий трек обратится к тому же
       * эндпоинту и получит тот же отказ. Именно это проматывало очередь.
       */
      if (result === "rate-limited") {
        rateLimitWaitsRef.current += 1;

        if (rateLimitWaitsRef.current <= MAX_RATE_LIMIT_WAITS) {
          console.info(
            `[player] Telegram просит подождать, ожидание ${rateLimitWaitsRef.current}/${MAX_RATE_LIMIT_WAITS}`,
          );

          window.setTimeout(() => {
            if (probeController.signal.aborted) return;
            void loadAndWatch();
          }, RATE_LIMIT_RETRY_MS);
          return;
        }

        /*
         * Лимит держится дольше, чем разумно ждать. Пропускаем трек ОДИН раз:
         * запоминаем id, чтобы сторож не отправил нас по кругу.
         */
        console.warn("[player] лимит Telegram не отпустил, пропускаем трек");
        rateLimitGaveUpRef.current = track.id;
      }

      // Проверка пройдена (либо лимит исчерпан) — грузим поток как обычно.
      element.pause();
      element.load();
    };

    void loadAndWatch();

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

      /*
       * Пользователь поставил паузу — сторож не вмешивается.
       *
       * ЭТО ГЛАВНАЯ ПРИЧИНА САМОВКЛЮЧЕНИЯ ПОСЛЕ ПАУЗЫ.
       *
       * Сторож не различал «трек не загрузился» и «трек осознанно
       * остановлен»: в обоих случаях он видел `paused === true` и через
       * 12 секунд сам вызывал `startPlayback()`. Человек ставил паузу,
       * отходил — и музыка внезапно играла снова.
       *
       * Проверяем намерение, а не состояние: если автозапуск не запрашивали
       * (флаг сброшен паузой), значит остановка сознательная.
       */
      if (!shouldAutoPlayRef.current) return;

      // Воспроизведение уже пошло — сторож не нужен.
      if (!el.paused && el.currentTime > 0) return;

      /*
       * На этом треке лимит Telegram так и не отпустил.
       *
       * Пропускаем его БЕЗ попыток восстановления: каждая попытка — это новый
       * запрос к `getFile`, то есть ещё один виток лимита. Здесь очередь
       * действительно должна поехать дальше.
       */
      if (rateLimitGaveUpRef.current === currentTrackRef.current?.id) {
        console.warn("[player] трек пропущен из-за лимита Telegram");
        setPlaybackError(true);
        setIsPlayingRef.current(false);
        nextTrackRef.current();
        return;
      }

      // Поток не стартовал. Пробуем восстановиться.
      recoveryAttemptsRef.current += 1;

      if (recoveryAttemptsRef.current <= MAX_RECOVERY_ATTEMPTS) {
        console.warn(
          `[player] трек не начал играть, попытка ${recoveryAttemptsRef.current}`,
        );

        el.load();

        // Даём ещё один шанс на повторной загрузке.
        void startPlayback();
        return;
      }

      // Восстановиться не удалось — честно сообщаем и идём дальше.
      console.error("[player] трек недоступен, переключаем на следующий");
      setPlaybackError(true);
      setIsPlayingRef.current(false);

      // Переходим дальше, иначе плеер останется мёртвым на этом треке.
      nextTrackRef.current();
    }, LOAD_TIMEOUT_MS);

    return () => {
      /*
       * Отменяем проверку потока и сторож.
       *
       * Без отмены поздний ответ на проверку уже неактуального трека вызвал бы
       * `load()` поверх нового источника — и вместо выбранного трека зазвучал
       * бы предыдущий.
       */
      probeController.abort();
      window.clearTimeout(watchdog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id, currentTrack?.streamUrl, currentTrack?.videoId]);

  function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    if (!canPlay) return;

    const nextTime = Number(event.target.value);

    if (Number.isNaN(nextTime)) return;

    // Перемотка идёт в тот плеер, который сейчас звучит.
    if (isEmbeddedPlayerRef.current) {
      ytSeek(nextTime);
    } else if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
    }

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
    if (!canPlay) return;

    /*
     * Состояние воспроизведения спрашиваем у того плеера, который звучит.
     *
     * У `<audio>` это свойство `paused`, у встроенного YouTube-плеера —
     * состояние `PLAYING`. Спрашивать не тот плеер нельзя: кнопка сделала бы
     * противоположное задуманному.
     */
    const isCurrentlyPlaying = isYouTube
      ? ytGetState() === YT_STATE.PLAYING
      : !audioRef.current?.paused;

    if (!isCurrentlyPlaying) {
      shouldAutoPlayRef.current = true;
      void startPlayback();
      return;
    }

    shouldAutoPlayRef.current = false;

    if (isEmbeddedPlayerRef.current) ytPause();
    else audioRef.current?.pause();

    setIsPlayingInStore(false);
  }

  async function startPlayback() {
    if (!canPlay) return;

    /*
     * Запуск через встроенный плеер YouTube.
     *
     * Только когда прямой поток получить не удалось: тогда воспроизведением
     * управляет IFrame, и состояние в стор придёт по событию `onPlaying` —
     * здесь его выставлять нельзя, иначе интерфейс покажет «играет» раньше,
     * чем звук действительно пойдёт.
     */
    if (isEmbeddedPlayerRef.current) {
      const track = currentTrackRef.current;
      if (!track?.videoId) return;

      if (isYouTubeReady()) {
        ytPlay();
      } else {
        // Плеер ещё поднимается: загрузка произойдёт по событию `onReady`.
        await ytLoadTrack(track.videoId, true);
      }
      return;
    }

    if (!audioRef.current) return;

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
      /*
       * Считаем повторы ПОДРЯД для достижения «Одержимость».
       *
       * Именно здесь, а не в сторе плеера: событие окончания трека приходит
       * только отсюда, и только тут известно, что повтор действительно
       * состоялся. `playNext` для repeat-one не вызывается — зацикливание
       * делает сам плеер.
       */
      const repeatTrack = currentTrackRef.current;
      if (repeatTrack) {
        useProgressionStore
          .getState()
          .registerRepeatLoop(repeatTrack.id);
      }

      /*
       * Зацикливание.
       *
       * Для YouTube-трека повтор запускает встроенный плеер: он умеет играть
       * видео заново с начала. Для обычных треков позицию сбрасывает
       * `<audio>`, а `.catch` обязателен — без него отклонённый `play()`
       * становится необработанным отказом и воспроизведение молча умирает.
       */
      if (isYouTubeRef.current) {
        ytSeek(0);
        ytPlay();
      } else {
        const element = audioRef.current;
        if (element) {
          element.currentTime = 0;
          void element.play().catch((error: unknown) => {
            console.warn("[player] повтор трека не удался:", error);
            setIsPlayingInStore(false);
          });
        }
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
    if (!element || !canPlay) return;

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

  /**
   * Актуальная ссылка на обработчик окончания трека.
   *
   * Нужна для событий YouTube-плеера: они регистрируются один раз, и должны
   * вызывать свежую версию функции. Без этого обработчик «застрял» бы на
   * значениях первого рендера — например, на старом режиме воспроизведения,
   * и повтор трека работал бы неправильно.
   */
  handleTrackEndedRef.current = handleTrackEnded;

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

  /*
   * Закрытие выпадающих окон по клику вне них.
   *
   * Слушаем на фазе ПЕРЕХВАТА (`capture`), а не на всплытии: клик по кнопке
   * открытия должен сначала обработаться здесь и не мешать собственному
   * обработчику кнопки. Кнопки исключаем из проверки — иначе окно закрывалось
   * бы сразу после открытия, потому что клик по кнопке формально «вне окна».
   *
   * Слушатель навешивается только когда окно открыто: держать его постоянно
   * значило бы проверять каждый клик по интерфейсу без необходимости.
   */
  useEffect(() => {
    if (!isPlaylistMenuVisible && !isQueueVisible) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      // Клик по кнопке-переключателю обрабатывает сама кнопка.
      if (
        playlistButtonRef.current?.contains(target) ||
        queueButtonRef.current?.contains(target)
      ) {
        return;
      }

      if (playlistMenuRef.current && !playlistMenuRef.current.contains(target)) {
        closePlaylistMenu();
      }

      if (queueMenuRef.current && !queueMenuRef.current.contains(target)) {
        closeQueueMenu();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaylistMenuVisible, isQueueVisible]);

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
          /*
           * `key` прибит к id трека и НЕ меняется при перерисовках родителя.
           *
           * Без явного ключа React иногда пересоздавал элемент, когда менялся
           * состав соседних узлов (например, открывался/закрывался слой профиля
           * или список достижений). Новый <audio> начинал загрузку с нуля —
           * трек «перезапускался» от любого клика. Теперь узел один и тот же,
           * пока играет один и тот же трек; смена источника идёт только через
           * атрибут src.
           */
          key="noctra-audio"
          ref={audioRef}
          /*
           * Источник подставляем только для обычных треков.
           *
           * YouTube-треки получают адрес позже — когда нативный резолвер
           * его добудет (см. ветку YouTube в эффекте смены трека).
           */
          src={isYouTube ? undefined : currentTrack?.streamUrl}
          preload="metadata"
          /*
           * CORS — ТОЛЬКО ДЛЯ СВОИХ ИСТОЧНИКОВ.
           *
           * ЗАЧЕМ ЭТО ВАЖНО
           * ---------------
           * Атрибут `crossOrigin="anonymous"` заставляет браузер требовать
           * заголовок `Access-Control-Allow-Origin` от сервера потока.
           * У Telegram и прочих наших источников он есть, у `googlevideo`
           * его НЕТ — поэтому жёстко выставленный атрибут ломал YouTube:
           *
           *   Access to audio at 'https://rr4...googlevideo.com' from origin
           *   'https://localhost' has been blocked by CORS policy
           *
           * Без атрибута `<audio>` играет кросс-доменные потоки свободно:
           * это обычное воспроизведение, а не чтение данных через JS.
           *
           * Плата — анализатор спектра: `createMediaElementSource` требует
           * CORS. Для YouTube визуализация уйдёт в режим имитации, что уже
           * предусмотрено в компоненте волны.
           */
          crossOrigin={isYouTube ? undefined : "anonymous"}
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

            /*
             * Воспроизведение реально идёт — сбрасываем попытки восстановления,
             * чтобы следующий сбой снова получил полный запас попыток.
             *
             * Здесь же обнуляем ожидания лимита: раз поток пошёл, Telegram
             * отпустил частоту, и следующий трек не должен ждать из-за
             * накопленного счётчика.
             */
            recoveryAttemptsRef.current = 0;
            rateLimitWaitsRef.current = 0;
            rateLimitGaveUpRef.current = null;
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
          ref={playlistMenuRef}
          /*
           * Позиция: левый край окна совпадает с левым краем плеера.
           *
           * Контейнер плеера — `<footer>` с относительным позиционированием
           * и внутренним отступом `px-5`, поэтому `left-0` ставит окно ровно
           * по краю панели, без центрирования. Раньше стояло `left-1/2`
           * с `-translate-x-1/2`: окно уезжало в середину экрана и выглядело
           * оторванным от кнопки, которая его открыла.
           *
           * `bottom-[calc(100%+16px)]` поднимает окно над панелью, чтобы оно
           * не перекрывало элементы управления плеером.
           */
          className={`absolute bottom-[calc(100%+16px)] left-0 z-50 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-white/10 bg-[#121118]/95 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl ${
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
          ref={queueMenuRef}
          /*
           * Тот же плотный стиль, что и у окна «Добавить в плейлист»:
           * полупрозрачные панели сливались со списком треков под ними.
           * `right-4` оставляем — окно очереди привязано к своей кнопке
           * справа, а не по центру.
           */
          className={`absolute bottom-[calc(100%+16px)] right-4 z-50 flex max-h-[60vh] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121118]/95 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl ${
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

      {/*
        Обложка — обычная кнопка, без общего layoutId с модалкой фокуса.

        Раньше здесь стоял `layoutId={`cover-${currentTrack.id}`}`, и такой же
        layoutId объявлялся в TrackFocusModal. AnimatePresence держит узел
        модалки в дереве и после её закрытия, поэтому два элемента с одинаковым
        layoutId существовали одновременно, и Framer Motion начинал «делить»
        между ними один DOM-узел. Из-за этого КАЖДОЕ изменение стора (клик по
        лайку, закрытие профиля, переключение избранного) пересобирало
        <audio>: плеер видел новый узел, вызывал load() и трек начинал играть
        с начала.

        Плавное «вылетание» карточки сохранено за счёт пружинной анимации
        появления самой модалки — она того же размера и на том же месте.
      */}
      <motion.button
        type="button"
        onClick={() => {
          if (currentTrack) setIsFocusOpen(true);
        }}
        onPointerEnter={() => setIsCoverHovered(true)}
        onPointerLeave={() => setIsCoverHovered(false)}
        disabled={!currentTrack}
        title={currentTrack ? t("player.focusMode") : undefined}
        whileHover={{ scale: 1.06, y: -2 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
        className="group relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/40 to-black shadow-lg shadow-purple-950/30 transition-shadow hover:shadow-[0_0_24px_-4px_var(--accent-glow)] hover:ring-2 hover:ring-purple-300/40 disabled:cursor-default"
      >
        {currentTrack?.coverUrl ? (
          <img
            src={currentTrack.coverUrl}
            alt=""
            className={`h-full w-full object-cover transition duration-300 ${
              isCoverHovered ? "scale-110 brightness-[0.45]" : ""
            }`}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-purple-100/50">
            <ListMusic size={18} />
          </span>
        )}

        {/*
          Оверлей с иконкой «раскрыть».

          Обложка по клику открывает полноэкранный режим, но раньше об этом
          ничего не подсказывало: при наведении менялся только размер. Теперь
          картинка затемняется и по центру проявляется иконка — как в списках
          треков, где клик по обложке тоже что-то запускает.

          Управляется состоянием, а не CSS-hover: у кнопки уже есть анимация
          масштаба от Framer Motion, и вложенный `group-hover` конфликтовал бы
          с ней по времени срабатывания.
        */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-200 ${
            isCoverHovered ? "scale-100 opacity-100" : "scale-75 opacity-0"
          }`}
        >
          <span className="inline-flex aspect-square items-center justify-center rounded-full bg-black/60 p-1.5 leading-none ring-1 ring-white/20">
            <Maximize2 size={13} className="m-0 block text-white" />
          </span>
        </span>
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
            {/*
              Пометка о фоновом воспроизведении.
              
              Показывается только для YouTube-треков, которые играют через
              `<audio>`: это значит, что музыка не прервётся при выключенном
              экране. Если пометки нет — трек идёт через встроенный плеер
              YouTube и в фоне замолчит.
            */}
            {isYouTube && supportsBackgroundPlayback && (
              <span
                className="ml-1.5 text-[10px] text-emerald-300/70"
                title={t("player.backgroundPlayback")}
              >
                ● фоновый режим
              </span>
            )}
          </p>
        )}
      </div>
    <div className="flex items-center gap-2">
      <button
        ref={playlistButtonRef}
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
            disabled={!canPlay}
            className="rounded-full bg-purple-500/30 p-3 text-white shadow-lg shadow-purple-900/30 transition hover:bg-purple-500/45 disabled:cursor-not-allowed disabled:opacity-40"
            title={
              canPlay ? t("player.playpause") : t("player.noSource")
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
          <span>{canPlay ? formatTime(currentTime) : "—"}</span>

        <input
          type="range"
          min="0"
          max={safeAudioDuration || 0}
          step="0.1"
          value={canPlay ? Math.min(currentTime, safeAudioDuration || 0) : 0}
          onChange={handleSeek}
          disabled={!canPlay}
          style={getRangeStyle(progress)}
          className="noctra-range flex-1 cursor-pointer disabled:cursor-not-allowed"
        />

        <span>{canPlay ? formatTime(safeAudioDuration) : duration}</span>

        </div>
      </div>

        <button
          ref={queueButtonRef}
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