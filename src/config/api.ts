/**
 * Централизованная конфигурация внешних API.
 *
 * Раньше адрес бэкенда был захардкожен как `http://localhost:3001` в нескольких
 * местах, из-за чего прод-сборка на Vercel стучалась в localhost и не видела
 * треки. Теперь адрес берётся отсюда — единая точка правды.
 *
 * Приоритет источников:
 *   1. VITE_API_URL          — актуальное имя переменной;
 *   2. VITE_TELEGRAM_SERVER_URL — старое имя, оставлено для совместимости
 *      с уже настроенными окружениями;
 *   3. прод-URL бэкенда на Render — чтобы сборка работала «из коробки»
 *      даже если переменные не заданы.
 */

const FALLBACK_API_URL = "https://noctra-ffdm.onrender.com";

function resolveApiBaseUrl(): string {
  const fromEnv =
    (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
    (import.meta.env.VITE_TELEGRAM_SERVER_URL as string | undefined)?.trim();

  // Убираем хвостовые слэши, чтобы не получить двойной слэш при склейке путей.
  return (fromEnv || FALLBACK_API_URL).replace(/\/+$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl();

/** Базовый путь аудио-прокси Telegram (единственный стрим-роут бэкенда). */
export const TELEGRAM_FILE_PATH = "/api/telegram/file";

/** Собирает абсолютный URL стрима/обложки по fileId. */
export function buildFileUrl(fileId: string): string {
  return `${API_BASE_URL}${TELEGRAM_FILE_PATH}?fileId=${encodeURIComponent(fileId)}`;
}

/**
 * Приводит приходящий с бэкенда URL к актуальному хосту.
 *
 * Зачем: сервер исторически запёк `http://localhost:3001/...` прямо в
 * сохранённые треки (server/data/telegram-tracks.json), и эти строки отдаются
 * клиенту как есть. Если бэкенд ещё не передеплоен с фиксом, воспроизведение
 * ломалось бы. Здесь мы подменяем localhost на реальный адрес API, сохраняя
 * путь и query-параметры.
 *
 * Корректные абсолютные URL и внешние ссылки (например, обложки Audius)
 * возвращаются без изменений.
 */
export function normalizeStreamUrl(url: string | null | undefined): string {
  if (!url) return "";

  // Относительный путь — просто приклеиваем к базовому адресу API.
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;

  // localhost / 127.0.0.1 в любом порту — это заведомо недоступный из браузера
  // адрес прода, подменяем на реальный хост API.
  const localhostMatch = url.match(
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/.*)?$/i,
  );

  if (localhostMatch) {
    return `${API_BASE_URL}${localhostMatch[1] ?? ""}`;
  }

  return url;
}
