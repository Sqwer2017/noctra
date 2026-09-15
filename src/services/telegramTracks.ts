import type { PlaylistTrack } from "../types/playlist";

// Адрес Telegram-сервера: берём из env (деплой) или из default localhost.
const TELEGRAM_SERVER_URL =
  (import.meta.env.VITE_TELEGRAM_SERVER_URL as string | undefined) ??
  "http://localhost:3001";

/** Трек, приходящий с нашего backend-прокси Telegram. */
export type TelegramTrack = PlaylistTrack & {
  fileId: string;
  thumbnailFileId?: string | null;
  kind?: "audio" | "voice" | "document";
  chatId?: number | null;
  chatTitle?: string | null;
};

type TelegramTracksResponse = {
  ok: boolean;
  tracks: TelegramTrack[];
  message?: string;
};

type TelegramHealthResponse = {
  ok: boolean;
  service: string;
  webhookActive: boolean;
  tracks: number;
};

async function parseTracksResponse(
  response: Response,
  fallbackMessage: string,
): Promise<TelegramTrack[]> {
  if (!response.ok) {
    throw new Error(fallbackMessage);
  }

  const data = (await response.json()) as TelegramTracksResponse;

  if (!data.ok) {
    throw new Error(data.message || fallbackMessage);
  }

  return data.tracks ?? [];
}

/** Загружает уже сохранённые на сервере треки (без синка с Telegram). */
export async function getTelegramTracks(): Promise<TelegramTrack[]> {
  const response = await fetch(`${TELEGRAM_SERVER_URL}/api/telegram/tracks`);
  return parseTracksResponse(response, "Failed to load Telegram tracks");
}

/** Запускает на сервере синк getUpdates и возвращает обновлённый список. */
export async function syncTelegramTracks(): Promise<TelegramTrack[]> {
  const response = await fetch(`${TELEGRAM_SERVER_URL}/api/telegram/sync`, {
    method: "POST",
  });
  return parseTracksResponse(response, "Failed to sync Telegram tracks");
}

/** Проверка доступности backend-сервера (для статуса в UI). */
export async function checkTelegramHealth(): Promise<TelegramHealthResponse | null> {
  try {
    const response = await fetch(`${TELEGRAM_SERVER_URL}/api/health`);
    if (!response.ok) return null;
    return (await response.json()) as TelegramHealthResponse;
  } catch {
    return null;
  }
}

export { TELEGRAM_SERVER_URL };
