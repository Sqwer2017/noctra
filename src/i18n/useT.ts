import { translate } from "./index";
import { useAppStore } from "../store/useAppStore";

type Vars = Record<string, string | number>;

/**
 * Хук, возвращающий переводчик и текущий язык.
 * Подписан на zustand-стор, поэтому при смене языка в Настройках
 * весь интерфейс перерисуется автоматически.
 */
export function useT() {
  const locale = useAppStore((s) => s.resolvedLocale);

  const t = (key: string, vars?: Vars) => translate(locale, key, vars);

  return { t, locale };
}
