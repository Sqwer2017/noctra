/**
 * Форматирование времени прослушивания.
 *
 * Правила отображения:
 *  - меньше часа  → минуты:  «45 мин» / «45 min»
 *  - от 1 до 100ч → часы с одной десятой: «1.6 ч» / «1.6h»
 *  - 100ч и больше → целые часы: «128 ч» / «128h»
 *
 * Единицы берём из i18n (передаём функцию перевода), чтобы строка
 * локализовалась корректно.
 */

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function formatListeningTime(
  seconds: number,
  t: Translate,
): string {
  const safe = Math.max(0, seconds || 0);
  const hours = safe / 3600;

  if (hours < 1) {
    const minutes = Math.round(safe / 60);
    return t("time.minutes", { count: minutes });
  }

  if (hours < 100) {
    const value = (Math.round(hours * 10) / 10).toFixed(1);
    return t("time.hoursDecimal", { value });
  }

  return t("time.hours", { count: Math.round(hours) });
}

/**
 * Длительность трека: "3:42" → 222.
 *
 * В UI длительность хранится строкой для отображения, а в Supabase колонка
 * `duration` — целое число секунд. Эти две функции — единственное место
 * конвертации, чтобы формат не разъехался между слоями.
 */
export function durationToSeconds(duration: string | number | null | undefined): number {
  if (typeof duration === "number") {
    return Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0;
  }

  if (!duration) return 0;

  const parts = duration.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return 0;

  // Поддерживаем "mm:ss" и "h:mm:ss".
  const [hours, minutes, seconds] =
    parts.length === 3 ? parts : [0, parts[0] ?? 0, parts[1] ?? 0];

  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}

/** Секунды → "3:42" (обратная к durationToSeconds). */
export function secondsToDuration(totalSeconds: number | null | undefined): string {
  const safe = Math.max(0, Math.round(totalSeconds ?? 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
