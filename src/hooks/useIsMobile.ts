import { useEffect, useState } from "react";

/**
 * Определяет, что ширина экрана мобильная.
 *
 * Порог 768px — стандартный брейкпоинт `md:` в Tailwind. Хук слушает
 * изменение ширины через `matchMedia`, поэтому поворот телефона или
 * ресайз окна браузера сразу переключают раскладку, без перезагрузки.
 *
 * Важно: начальное значение читается лениво (в инициализаторе `useState`),
 * чтобы не было мигания десктопной вёрстки на первом кадре мобильного экрана.
 * SSR не используется, поэтому `window` здесь всегда доступен.
 */
export function useIsMobile(breakpointPx = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);

    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    // `addEventListener` вместо устаревшего `addListener`: современный
    // стандарт, старые браузеры давно обновились.
    query.addEventListener("change", handleChange);

    return () => query.removeEventListener("change", handleChange);
  }, [breakpointPx]);

  return isMobile;
}

/**
 * Определяет, что экран маленький.
 *
 * Порог 1280px — планшеты и мониторы меньше ~22 дюймов. На такой ширине
 * сетка окон 2×2 уже тесная: карточки сжимаются, текст треков обрезается,
 * управлять мышью неудобно. Поэтому показываем одно окно на весь контейнер,
 * а остальные держим в стеке со свайпом между ними.
 *
 * Отличие от `useIsMobile`: там меняется ВЕСЬ каркас (меню, плеер, шторка),
 * а здесь — только режим отображения окон. Планшет в альбомной ориентации
 * получает десктопное меню, но одиночные окна.
 */
export function useIsCompactWindows(breakpointPx = 1280): boolean {
  const [isCompact, setIsCompact] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);

    const handleChange = (event: MediaQueryListEvent) => {
      setIsCompact(event.matches);
    };

    query.addEventListener("change", handleChange);

    return () => query.removeEventListener("change", handleChange);
  }, [breakpointPx]);

  return isCompact;
}
