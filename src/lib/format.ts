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
