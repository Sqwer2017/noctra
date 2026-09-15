import ru from "./messages/ru";
import en from "./messages/en";

export type Locale = "ru" | "en";
export type LanguagePreference = "auto" | Locale;

export type Messages = Record<Locale, Record<string, string>>;
export type Translate = {
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
};

const dictionaries: Messages = {
  ru,
  en,
};

/** Интерполирует плейсхолдеры вида "{key}". */
function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[locale];
  const template = (dict as Record<string, string>)[key] ?? dictionaries.en[key] ?? key;
  return interpolate(template, vars);
}

export function makeT(locale: Locale): Translate["t"] {
  return (key, vars) => translate(locale, key, vars);
}

/**
 * Автоопределение языка по браузеру. Вернём "ru" для ru/uk/be,
 * иначе — english.
 */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language?.toLowerCase() ?? "en";
  return lang.startsWith("ru") || lang.startsWith("uk") || lang.startsWith("be")
    ? "ru"
    : "en";
}

/** Переданное явно значние языка, если не "auto". */
export function resolvePreference(pref: LanguagePreference): Locale {
  return pref === "auto" ? detectBrowserLocale() : pref;
}

export function formatCount(
  _locale: Locale,
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;

  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}
