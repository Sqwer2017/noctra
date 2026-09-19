import { useEffect } from "react";

import { usePlayerStore } from "../store/usePlayerStore";

/**
 * Горячие клавиши плеера (в стиле Spotify / YouTube).
 *
 *   Пробел          пауза / воспроизведение
 *   ←  →            перемотка на 5 секунд
 *   Shift + ←/→     предыдущий / следующий трек
 *   ↑  ↓            громкость ±5%
 *   M               выключить / вернуть звук
 *
 * Клавиши НЕ перехватываются, когда фокус в поле ввода или в элементе с
 * contenteditable: иначе пробел не напечатать в поиске треков, а стрелки
 * не подвинуть курсор в тексте.
 *
 * Действия идут через `request*`-методы стора: они открывают панель плеера
 * и работают с реальным <audio>, поэтому сочетания действуют, даже когда
 * плеер свёрнут.
 */

/** На сколько секунд перематывать стрелками. */
const SEEK_STEP_SECONDS = 5;

/** Шаг изменения громкости. */
const VOLUME_STEP = 0.05;

/** Фокус в текстовом поле? Тогда горячие клавиши молчат. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;

  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Фокус на кнопке или ссылке?
 *
 * Пробел на сфокусированной кнопке и так её нажимает (нативное поведение
 * браузера). Если при этом ещё и переключать плеер, получится двойное
 * действие: например, пробел на кнопке «Следующий трек» переключит трек
 * кнопкой, а затем глобальный обработчик поставит его на паузу.
 */
function isButtonTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;
  return tag === "BUTTON" || tag === "A";
}

export function usePlayerHotkeys(): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      // Не мешаем браузерным сочетаниям (Ctrl+R, Cmd+L и т.п.).
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const player = usePlayerStore.getState();

      switch (event.key) {
        case " ": {
          // Пробел по умолчанию прокручивает страницу — гасим.
          event.preventDefault();

          // На кнопке пробел и так сработает как клик: не дублируем действие
          // глобальным переключением плеера.
          if (isButtonTarget(event.target)) return;

          player.requestToggle();
          return;
        }

        case "ArrowRight": {
          event.preventDefault();

          if (event.shiftKey) {
            player.playNext();
            return;
          }

          // Перемотка вперёд от текущей позиции.
          player.requestSeek(
            Math.min(
              player.currentTime + SEEK_STEP_SECONDS,
              player.duration || Number.MAX_SAFE_INTEGER,
            ),
          );
          return;
        }

        case "ArrowLeft": {
          event.preventDefault();

          if (event.shiftKey) {
            player.playPrevious();
            return;
          }

          player.requestSeek(Math.max(0, player.currentTime - SEEK_STEP_SECONDS));
          return;
        }

        case "ArrowUp": {
          event.preventDefault();
          player.requestSetVolume(
            Math.min(1, Math.round((player.volume + VOLUME_STEP) * 100) / 100),
          );
          return;
        }

        case "ArrowDown": {
          event.preventDefault();
          player.requestSetVolume(
            Math.max(0, Math.round((player.volume - VOLUME_STEP) * 100) / 100),
          );
          return;
        }

        case "m":
        case "M":
        case "ь":
        case "Ь": {
          // Кириллическая раскладка: та же клавиша, что и M.
          event.preventDefault();
          player.toggleMute();
          return;
        }

        default:
          return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
