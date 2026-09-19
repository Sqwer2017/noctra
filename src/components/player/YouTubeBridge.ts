/**
 * Мост к встроенному YouTube-плееру (IFrame API).
 *
 * ЗАЧЕМ ОН НУЖЕН
 * --------------
 * Прямые аудиопотоки YouTube недоступны: ссылки на них подписаны и привязаны
 * к клиенту, поэтому обычный `<audio src="...">` для YouTube не работает.
 * Единственный штатный способ воспроизведения — официальный IFrame-плеер.
 *
 * КАК УСТРОЕНО
 * ------------
 * В документе живёт скрытый контейнер (1×1 пиксель, прозрачный, без
 * возможности клика). Внутри — настоящий плеер YouTube. Приложение общается
 * с ним через глобальный объект `YT`: загружает видео, ставит на паузу,
 * перематывает, читает позицию.
 *
 * ГЛАВНАЯ СЛОЖНОСТЬ — ПОЛУЧЕНИЕ ПОЗИЦИИ
 * -------------------------------------
 * У `<audio>` есть событие `timeupdate`, которое само двигает ползунок.
 * У IFrame-плеера такого события нет: позицию приходится опрашивать.
 * Опрос идёт раз в 250 мс — этого достаточно, чтобы полоса двигалась плавно
 * и при этом не грузить главный поток лишней работой.
 *
 * Мост реализован как модуль, а не как React-компонент с хуками: плеером
 * управляют из разных мест (кнопки, горячие клавиши, дашборд профиля,
 * системные медиа-клавиши), и держать его состояние в React значило бы
 * протаскивать пропсы через пол-приложения.
 */

/** Состояния плеера YouTube (совпадают с YT.PlayerState). */
export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/** Минимальный интерфейс плеера — только то, что мы действительно вызываем. */
type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  loadVideoById: (videoId: string) => void;
  cueVideoById: (videoId: string) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement | string,
    options: {
      height?: string | number;
      width?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: typeof YT_STATE;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Идентификатор скрытого контейнера в DOM. */
const CONTAINER_ID = "noctra-youtube-player";

/**
 * Ставки, при которых браузер обязан показать плеер.
 *
 * Воспроизведение YouTube регулируется правилами: если плеер полностью
 * скрыт или имеет нулевой размер, воспроизведение блокируется, а аккаунт
 * может получить ограничения. Поэтому контейнер не `display: none`, а
 * вынесен за пределы экрана и имеет размер 1×1 — формально он виден,
 * но пользователю не мешает.
 */
const CONTAINER_STYLE = [
  "position:fixed",
  "left:-9999px",
  "top:0",
  "width:1px",
  "height:1px",
  "opacity:0.01",
  "pointer-events:none",
  "border:0",
].join(";");

type BridgeCallbacks = {
  /** Плеер готов к работе. */
  onReady: () => void;
  /** Воспроизведение началось. */
  onPlaying: () => void;
  /** Воспроизведение приостановлено. */
  onPaused: () => void;
  /** Трек доиграл до конца. */
  onEnded: () => void;
  /** Ошибка: видео недоступно, удалено или запрещено к встраиванию. */
  onError: (code: number) => void;
};

let player: YouTubePlayer | null = null;
let isReady = false;
let isLoading = false;
let loadPromise: Promise<boolean> | null = null;
let callbacks: BridgeCallbacks | null = null;
let pendingVideoId: string | null = null;
let apiScriptPromise: Promise<boolean> | null = null;

/**
 * Беззвучный буфер — страховка системной медиа-сессии.
 *
 * Некоторые браузеры глушат сессию, если в странице нет активного
 * HTML5-потока: IFrame-плеер YouTube для них «не настоящий» звук. Тогда ОС
 * перестаёт присылать команды от мыши и медиа-клавиш, хотя трек играет.
 *
 * Буфер — это зацикленный `<audio>` с секундой тишины на минимальной
 * громкости. Он даёт браузеру формальный повод считать страницу
 * «воспроизводящей звук», и сессия остаётся активной. Человек ничего не
 * слышит: громкость 0.001 ниже порога восприятия, а сам файл — тишина.
 *
 * Тишина генерируется программно через Web Audio API, а не лежит файлом:
 * так не нужен ни один байт в бандле, ни запрос в сеть. Создаётся лениво,
 * только когда впервые понадобился для YouTube-трека.
 */
let silenceBuffer: HTMLAudioElement | null = null;

/** Генерирует секунду тишины и возвращает её как data-URL. */
function makeSilenceDataUrl(): string {
  // Web Audio недоступен (очень старый браузер) — буфера не будет.
  // Это не ошибка: буфер лишь страховка, а не обязательное условие.
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) return "";

  const sampleRate = 8000;
  const seconds = 1;
  const context = new AudioContextClass({ sampleRate });
  const buffer = context.createBuffer(1, sampleRate * seconds, sampleRate);

  // Канал уже заполнен нулями (тишина) — ничего писать не нужно.
  const channel = buffer.getChannelData(0);
  channel.fill(0);

  // Собираем WAV вручную: заголовок 44 байта + сэмплы.
  const dataLength = channel.length;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  const bytes = new Uint8Array(44 + dataLength);
  bytes.set(new Uint8Array(header), 0);

  for (let i = 0; i < dataLength; i++) {
    // 8 бит: середина шкалы (128) — это тишина.
    bytes[44 + i] = 128;
  }

  void context.close();

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** Запускает беззвучный буфер (для YouTube-треков). */
function startSilenceBuffer(): void {
  if (typeof document === "undefined") return;

  if (!silenceBuffer) {
    const url = makeSilenceDataUrl();
    if (!url) return;

    const element = document.createElement("audio");
    element.src = url;
    element.loop = true;
    // 0.001, а не 0: полностью заглушенный элемент браузеры иногда
    // тоже игнорируют при определении «звучащей» вкладки.
    element.volume = 0.001;
    element.setAttribute("aria-hidden", "true");
    silenceBuffer = element;
  }

  // `play()` может отклониться до первого жеста пользователя — это нормально,
  // буфер лишь страховка, а не обязательное условие.
  void silenceBuffer.play().catch(() => {});
}

/** Останавливает беззвучный буфер (возврат к обычному треку). */
function stopSilenceBuffer(): void {
  silenceBuffer?.pause();
}

/** Зарегистрировать обработчики событий плеера. */
export function setYouTubeCallbacks(next: BridgeCallbacks | null): void {
  callbacks = next;
}

/**
 * Загружает скрипт IFrame API один раз за сессию.
 *
 * Скрипт нельзя подключать обычным тегом в index.html: он вызывает
 * `onYouTubeIframeAPIReady` асинхронно, и к этому моменту наше приложение
 * может быть ещё не готово. Поэтому загружаем его сами и дожидаемся
 * готовности через промис — так порядок гарантирован.
 */
function loadApiScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.YT?.Player) return Promise.resolve(true);
  if (apiScriptPromise) return apiScriptPromise;

  apiScriptPromise = new Promise<boolean>((resolve) => {
    /*
     * Страховка от зависания: если Google недоступен (блокировщик, сеть),
     * промис обязан разрешиться, иначе плеер будет ждать вечно и все
     * YouTube-треки молча не заработают.
     */
    const timer = window.setTimeout(() => resolve(false), 10_000);

    const finish = (ok: boolean) => {
      window.clearTimeout(timer);
      resolve(ok);
    };

    // API сообщает о готовности через этот глобальный колбэк.
    window.onYouTubeIframeAPIReady = () => finish(true);

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => finish(false);

    document.head.appendChild(script);
  });

  return apiScriptPromise;
}

/** Создаёт контейнер в DOM, если его ещё нет. */
function ensureContainer(): HTMLElement {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) return existing;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.setAttribute("style", CONTAINER_STYLE);
  // Пустой alt-текст: элемент декоративный, скринридеры его игнорируют.
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);

  return container;
}

/**
 * Инициализирует плеер (однократно).
 *
 * Возвращает `true`, если плеер готов. Повторные вызовы возвращают тот же
 * промис, поэтому параллельные обращения не создадут второй плеер.
 */
/**
 * Прогрев плеера в контексте жеста пользователя.
 *
 * Мобильные браузеры (особенно Safari) требуют, чтобы первое воспроизведение
 * произошло в обработчике жеста — тап, клик. Наша цепочка запуска трека
 * асинхронна (стор → эффект → ytLoadTrack), и к моменту вызова IFrame жест
 * уже «протух»: браузер блокирует звук.
 *
 * Решение: вызывать эту функцию напрямую из обработчика тапа по треку.
 * Она создаёт плеер заранее, пока жест ещё активен, — браузер запоминает
 * разрешение, и последующие `loadVideoById` уже не блокируются.
 *
 * Вызов идемпотентен и дешёвый: если плеер уже готов, ничего не делает.
 */
export function warmUpYouTubePlayer(): void {
  void initYouTubePlayer();
}

export function initYouTubePlayer(): Promise<boolean> {
  if (isReady && player) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const hasApi = await loadApiScript();
    if (!hasApi || !window.YT?.Player) {
      console.warn("[youtube] IFrame API недоступен");
      loadPromise = null;
      return false;
    }

    if (isReady && player) return true;

    isLoading = true;

    return new Promise<boolean>((resolve) => {
      const container = ensureContainer();

      const timer = window.setTimeout(() => {
        isLoading = false;
        console.warn("[youtube] плеер не инициализировался за 12 секунд");
        resolve(false);
      }, 12_000);

      /*
       * Ссылку на плеер сохраняем сразу из конструктора.
       *
       * Это важно: методы вроде `getCurrentTime` можно вызывать только после
       * `onReady`, но сама ссылка нужна раньше — иначе в обработчике `onReady`
       * пришлось бы искать плеер в DOM. А `onReady` вызывается, когда объект
       * уже полностью создан.
       */
      player = new window.YT!.Player(container, {
        height: "1",
        width: "1",
        /*
         * Параметры плеера.
         *
         * `playsinline: 1` — иначе на мобильных Safari видео раскрывается
         * на весь экран и перекрывает интерфейс.
         * `controls: 0` и `disablekb: 1` — управление только через наш плеер,
         * чтобы состояние не разъезжалось с кнопками Noctra.
         * `origin` нужен для корректной работы API на своём домене.
         */
        playerVars: {
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            window.clearTimeout(timer);
            isReady = true;
            isLoading = false;

            // Если трек запросили раньше, чем плеер был готов, — догружаем.
            if (pendingVideoId) {
              const id = pendingVideoId;
              pendingVideoId = null;
              player?.cueVideoById(id);
            }

            callbacks?.onReady();
            resolve(true);
          },
          onStateChange: (event) => {
            /*
             * Синхронизация системной медиа-сессии.
             *
             * Браузер отслеживает воспроизведение через navigator.mediaSession.
             * У обычных треков сессию держит `<audio>`-поток, а у YouTube
             * активного HTML-потока нет — только IFrame. Без явного обновления
             * `playbackState` браузер считает сессию уснувшей и перестаёт
             * присылать команды от мыши и медиа-клавиш (next/prev молчат).
             *
             * Поэтому при каждом событии плеера подтверждаем состояние вручную.
             * Это дублирует то, что делает useMediaSession по флагу isPlaying
             * в сторе, но срабатывает раньше и надёжнее: событие приходит от
             * самого плеера, а флаг стора обновляется уже как следствие.
             */
            if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
              if (event.data === YT_STATE.PLAYING) {
                navigator.mediaSession.playbackState = "playing";
              } else if (event.data === YT_STATE.PAUSED) {
                navigator.mediaSession.playbackState = "paused";
              }
            }

            switch (event.data) {
              case YT_STATE.PLAYING:
                callbacks?.onPlaying();
                break;
              case YT_STATE.PAUSED:
                callbacks?.onPaused();
                break;
              case YT_STATE.ENDED:
                callbacks?.onEnded();
                break;
              default:
                // BUFFERING и CUED не меняют состояние воспроизведения.
                break;
            }
          },
          onError: (event) => {
            /*
             * Коды ошибок YouTube:
             *   2 — неверный параметр видео;
             *   5 — не воспроизводится в HTML5-плеере;
             *  100 — видео удалено или закрыто;
             *  101/150 — владелец запретил встраивание.
             *
             * Все они означают одно: этот трек проиграть нельзя, нужно
             * переходить к следующему.
             */
            console.warn("[youtube] ошибка плеера, код:", event.data);
            callbacks?.onError(event.data);
          },
        },
      });
    });
  })();

  return loadPromise;
}

/**
 * Загружает видео.
 *
 * `autoplay` определяет, начнётся ли воспроизведение сразу: при смене трека
 * пользователем — да, при восстановлении позиции после перезагрузки — нет.
 */
export async function ytLoadTrack(
  videoId: string,
  autoplay = true,
): Promise<void> {
  const ready = await initYouTubePlayer();

  if (!ready) {
    pendingVideoId = videoId;
    return;
  }

  if (!player) {
    pendingVideoId = videoId;
    return;
  }

  if (autoplay) {
    player.loadVideoById(videoId);
    // Буфер запускаем вместе с воспроизведением: он держит медиа-сессию
    // активной, пока звучит IFrame. Без него браузер может решить, что
    // страница молчит, и перестать присылать команды от мыши и клавиш.
    startSilenceBuffer();
  } else {
    player.cueVideoById(videoId);
  }
}

export function ytPlay(): void {
  player?.playVideo();
  startSilenceBuffer();
}

export function ytPause(): void {
  player?.pauseVideo();
  stopSilenceBuffer();
}

export function ytSeek(seconds: number): void {
  // `allowSeekAhead: true` — иначе плеер не станет догружать поток
  // и после перемотки воспроизведение остановится.
  player?.seekTo(Math.max(0, seconds), true);
}

export function ytSetVolume(volume: number): void {
  const clamped = Math.min(1, Math.max(0, volume));
  player?.setVolume(Math.round(clamped * 100));

  // Отдельно управляем mute: setVolume(0) не всегда заглушает мгновенно.
  if (clamped === 0) player?.mute();
  else player?.unMute();
}

/** Текущая позиция в секундах (0, если плеер не готов). */
export function ytGetCurrentTime(): number {
  if (!player || !isReady) return 0;

  try {
    const time = player.getCurrentTime();
    return Number.isFinite(time) ? Math.max(0, time) : 0;
  } catch {
    // Плеер может быть в процессе пересоздания — это не ошибка.
    return 0;
  }
}

/** Длительность трека в секундах (0, если ещё не известна). */
export function ytGetDuration(): number {
  if (!player || !isReady) return 0;

  try {
    const duration = player.getDuration();
    return Number.isFinite(duration) ? Math.max(0, duration) : 0;
  } catch {
    return 0;
  }
}

/** Состояние плеера — используется сторожем загрузки. */
export function ytGetState(): number {
  if (!player || !isReady) return YT_STATE.UNSTARTED;

  try {
    return player.getPlayerState();
  } catch {
    return YT_STATE.UNSTARTED;
  }
}

/** Готов ли плеер к работе. */
export function isYouTubeReady(): boolean {
  return isReady && player !== null;
}

/** Идёт ли инициализация прямо сейчас. */
export function isYouTubeLoading(): boolean {
  return isLoading;
}

/** Сбрасывает состояние моста (при выходе из аккаунта или размонтировании). */
export function destroyYouTubePlayer(): void {
  try {
    player?.destroy();
  } catch {
    // Плеер мог быть уже уничтожен — это нормально.
  }

  player = null;
  isReady = false;
  isLoading = false;
  loadPromise = null;
  pendingVideoId = null;

  document.getElementById(CONTAINER_ID)?.remove();
}
