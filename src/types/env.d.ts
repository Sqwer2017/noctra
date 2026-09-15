/// <reference types="vite/client" />

/**
 * Переменные окружения Vite.
 *
 * `VITE_SUPABASE_URL` — фактически флаг: если он пуст, приложение работает
 * в локальном режиме (localStorage), без обращения к сети.
 */
interface ImportMetaEnv {
  /** URL проекта Supabase. Пусто → локальный режим. */
  readonly VITE_SUPABASE_URL?: string;
  /** Публичный anon-ключ. Безопасен для фронтенда, доступ ограничен RLS. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Базовый адрес бэкенда (Render). См. src/config/api.ts. */
  readonly VITE_API_URL?: string;
  /** Устаревшее имя для адреса бэкенда, поддержано для совместимости. */
  readonly VITE_TELEGRAM_SERVER_URL?: string;
  /** OAuth Client ID из Google Cloud Console (для One Tap). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
