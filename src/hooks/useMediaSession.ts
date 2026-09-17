import { useEffect } from "react";

import { usePlayerStore } from "../store/usePlayerStore";

/**
 * Интеграция с системными медиа-клавишами (Media Session API).
 *
 * Зачем: клавиши вроде Fn+F8 или кнопки на наушниках обрабатываются
 * операционной системой и до страницы как обычные `keydown` не доходят —
 * их невозможно поймать через `addEventListener("keydown")`. Media Session
 * регистрирует плеер в системе, и ОС сама присылает нам команды
 * play/pause/next/prev.
 *
 * Дополнительно браузер показывает карточку трека с обложкой в системном
 * оверлее (например, на экране блокировки Windows или в центре уведомлений),
 * что делает плеер похожим на нативное приложение.
 */
export function useMediaSession(): void {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);

  /*
   * Позиция и длительность берём из стора.
   *
   * Для YouTube их обновляет опрос встроенного плеера (см. BottomPlayer),
   * для остальных источников — событие `timeupdate` у `<audio>`. В обоих
   * случаях значения приходят в одно место, поэтому здесь не нужно знать,
   * какой источник играет.
   */
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);

  /*
   * Метаданные трека: название, исполнитель, обложка.
   * Система показывает их в своём интерфейсе, поэтому обложку передаём
   * разных размеров — ОС сама выберет подходящий.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }

    const artwork = currentTrack.coverUrl
      ? [
          { src: currentTrack.coverUrl, sizes: "96x96", type: "image/png" },
          { src: currentTrack.coverUrl, sizes: "256x256", type: "image/png" },
          { src: currentTrack.coverUrl, sizes: "512x512", type: "image/png" },
        ]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      /*
       * Альбом показываем как источник.
       *
       * В системном оверлее это единственное место, где видно, откуда трек:
       * у YouTube и Telegram обложки выглядят одинаково, и без подписи
       * непонятно, что именно играет.
       */
      album: currentTrack.source,
      artwork,
    });
  }, [currentTrack]);

  /*
   * Обработчики команд от системы.
   *
   * Обратите внимание: `play`/`pause` идут через реальный аудио-элемент
   * (`requestToggle`), а не через флаг в сторе — иначе состояние системы
   * и состояние плеера разъедутся.
   *
   * Для YouTube это работает так же: `audioControls` регистрирует тот же
   * плеер, и его методы уже разводят команду по источнику (см. BottomPlayer).
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    const session = navigator.mediaSession;
    const player = () => usePlayerStore.getState();

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      [
        "play",
        () => {
          const store = player();
          if (store.isPlaying) return;
          store.requestToggle();
        },
      ],
      [
        "pause",
        () => {
          const store = player();
          if (!store.isPlaying) return;
          store.requestToggle();
        },
      ],
      ["nexttrack", () => player().playNext()],
      ["previoustrack", () => player().playPrevious()],
      [
        "seekbackward",
        (details) => {
          const store = player();
          store.requestSeek(
            Math.max(0, store.currentTime - (details.seekOffset ?? 10)),
          );
        },
      ],
      [
        "seekforward",
        (details) => {
          const store = player();
          const target = store.currentTime + (details.seekOffset ?? 10);
          store.requestSeek(
            store.duration > 0 ? Math.min(target, store.duration) : target,
          );
        },
      ],
      [
        "seekto",
        (details) => {
          if (typeof details.seekTime === "number") {
            player().requestSeek(details.seekTime);
          }
        },
      ],
      ["stop", () => player().setIsPlaying(false)],
    ];

    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Некоторые действия не поддерживаются браузером — это нормально.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Игнорируем неподдерживаемые действия.
        }
      }
    };
  }, []);

  /* Состояние воспроизведения — от него зависит иконка в системном оверлее. */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  /*
   * Повторное подтверждение метаданных при смене трека.
   *
   * У YouTube-треков нет `<audio>`-потока, и браузер может «забыть» сессию:
   * без активного медиаэлемента он считает её недействительной и перестаёт
   * присылать команды от кнопок и клавиш. Повторная установка метаданных
   * вместе с явным `playbackState` возвращает сессию в активное состояние.
   *
   * Делаем это с небольшой задержкой: к моменту выполнения встроенный плеер
   * уже получил команду воспроизведения, и состояние не будет перезаписано
   * на «paused».
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    if (!currentTrack) return;

    const id = window.setTimeout(() => {
      const store = usePlayerStore.getState();

      navigator.mediaSession.playbackState = store.isPlaying
        ? "playing"
        : "paused";
    }, 300);

    return () => window.clearTimeout(id);
  }, [currentTrack]);

  /*
   * Позиция трека в системной карточке.
   *
   * БЕЗ ЭТОГО НЕ РАБОТАЮТ МЕДИА-КЛАВИШИ.
   *
   * Браузер считает медиа-сессию «живой» только когда знает, где находится
   * воспроизведение. Если позиция не сообщается, система помечает сессию
   * неактивной и перестаёт присылать команды в страницу — именно поэтому
   * кнопки next/prev на мыши и клавиатуре не реагировали, когда играл
   * YouTube: у `<audio>` позиция есть из события `timeupdate`, а у
   * встроенного плеера её никто не передавал.
   *
   * Обновляем раз в секунду: этого достаточно, чтобы полоса в оверлее шла
   * плавно, и при этом не дёргать API на каждом кадре.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    // Позицию можно сообщать только при известной длительности: иначе
    // браузер выбрасывает исключение и сбрасывает сессию целиком.
    if (!Number.isFinite(duration) || duration <= 0) return;

    const session = navigator.mediaSession;

    const updatePosition = () => {
      try {
        session.setPositionState?.({
          duration,
          position: Math.min(Math.max(0, currentTime), duration),
          playbackRate: 1,
        });
      } catch {
        // Некоторые браузеры не поддерживают эту возможность — не критично.
      }
    };

    updatePosition();

    const id = window.setInterval(updatePosition, 1000);
    return () => window.clearInterval(id);
  }, [currentTime, duration, currentTrack]);
}
