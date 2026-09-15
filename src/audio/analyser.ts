/**
 * Web Audio анализатор для визуализации «под бит».
 *
 * Плеер (BottomPlayer) один раз создаёт AudioContext + AnalyserNode для
 * своего <audio>-элемента и публикует анализатор здесь. Любой компонент
 * (например, waveform в дашборде) может читать частотные данные.
 *
 * Важно: createMediaElementSource можно вызвать для элемента только один раз,
 * поэтому создание защищено guard-ом и хранится по самому элементу.
 */

type AnalyserEntry = {
  context: AudioContext;
  analyser: AnalyserNode;
  data: Uint8Array;
};

let entry: AnalyserEntry | null = null;
const boundElements = new WeakSet<HTMLMediaElement>();

/**
 * Подключает анализатор к аудио-элементу (идемпотентно).
 * Возвращает анализатор или null, если Web Audio недоступен.
 */
export function attachAnalyser(
  element: HTMLMediaElement,
): AnalyserNode | null {
  if (entry) return entry.analyser;

  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor) return null;

  // Защита от повторного createMediaElementSource на том же элементе.
  if (boundElements.has(element)) {
    return null;
  }

  try {
    const context = new AudioContextCtor();
    const source = context.createMediaElementSource(element);
    const analyser = context.createAnalyser();

    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;
    analyser.minDecibels = -85;
    analyser.maxDecibels = -20;

    source.connect(analyser);
    analyser.connect(context.destination);

    boundElements.add(element);

    entry = {
      context,
      analyser,
      data: new Uint8Array(analyser.frequencyBinCount),
    };

    // Автозапуск контекста после первого пользовательского взаимодействия.
    void resumeAnalyser();

    return analyser;
  } catch {
    // Кросс-доменный источник без CORS и т.п. — тихо отваливаемся,
    // визуализация уйдёт в idle-режим.
    return null;
  }
}

/** Возобновляет AudioContext (браузеры блокируют автоплей до жеста). */
export async function resumeAnalyser(): Promise<void> {
  if (entry && entry.context.state === "suspended") {
    try {
      await entry.context.resume();
    } catch {
      /* игнор */
    }
  }
}

export function getAnalyser(): AnalyserNode | null {
  return entry?.analyser ?? null;
}

/**
 * Возвращает нормализованные (0..1) амплитуды по частотным корзинам.
 * Если анализатора нет — возвращает null (компонент покажет idle-анимацию).
 */
export function getFrequencyLevels(bars: number): number[] | null {
  if (!entry) return null;

  const { analyser, data } = entry;

  try {
    analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
  } catch {
    return null;
  }

  const levels: number[] = [];
  const step = Math.max(1, Math.floor(data.length / bars));

  for (let i = 0; i < bars; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) {
      sum += data[i * step + j] ?? 0;
    }
    // Небольшая гамма для выразительности тихих полос.
    levels.push(Math.min(1, Math.pow(sum / step / 255, 0.8)));
  }

  return levels;
}
