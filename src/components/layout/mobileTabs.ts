import type { ReactNode } from "react";

import type { WindowId } from "../../types/windows";
import { windowRegistry } from "../../data/windowRegistry";
import { WINDOW_TITLE_KEYS } from "../../i18n/windowKeys";

/**
 * Элементы верхней навигации мобильной версии.
 *
 * Принцип: меню показывает ВСЕ окна, доступные на ПК. Отдельного мобильного
 * набора нет — иначе при добавлении нового окна на десктопе пришлось бы
 * помнить про мобилку, и они неизбежно рассинхронизировались бы.
 *
 * Исключения: служебное окно плеера (`isSpecial`) — на мобильном плеер живёт
 * в отдельной шторке, а не в окне — и детали плейлиста (открываются изнутри
 * плейлистов, а не из меню).
 */

export type MobileNavItem =
  | { kind: "avatar" }
  | {
      kind: "window";
      id: WindowId;
      /** Готовая иконка из реестра — рисуем как есть, без обёрток. */
      icon: ReactNode;
      labelKey: string;
    };

/** Окна, которым не место в верхнем меню мобилки. */
const HIDDEN_WINDOW_IDS: ReadonlySet<WindowId> = new Set([
  "player", // плеер — отдельная шторка снизу
  "playlist-details", // детали открываются изнутри плейлистов
]);

/**
 * Ключ подписи для окна.
 *
 * Берём готовый маппинг заголовков — он уже переведён на оба языка.
 * Подпись нужна только для accessibility: визуально показываем одни иконки.
 */
function labelKeyFor(windowId: WindowId): string {
  return WINDOW_TITLE_KEYS[windowId];
}

/** Полный список элементов меню: аватарка + все окна ПК. */
export const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { kind: "avatar" },
  ...windowRegistry
    .filter((meta) => !HIDDEN_WINDOW_IDS.has(meta.id))
    .map((meta) => ({
      kind: "window" as const,
      id: meta.id,
      icon: meta.icon,
      labelKey: labelKeyFor(meta.id),
    })),
];

/** Окно → элемент меню (для подсветки активного). */
export function findNavItem(windowId: WindowId | null): MobileNavItem | null {
  if (!windowId) return null;
  return (
    MOBILE_NAV_ITEMS.find(
      (item) => item.kind === "window" && item.id === windowId,
    ) ?? null
  );
}
