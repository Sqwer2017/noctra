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
}
