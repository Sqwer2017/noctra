import type { PlaylistTrack } from "../types/playlist";
import {
  API_BASE_URL,
  buildFileUrl,
  normalizeStreamUrl,
} from "../config/api";

/**
 * Клиент нашего backend-прокси Telegram.
 *
 * Адрес бэкенда берётся из `src/config/api.ts` — здесь больше нет хардкода
 * localhost, из-за которого прод-сборка не видела треки.
 */

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

/**
 * Чиним URL, пришедшие с сервера.
 *
 * Бэкенд исторически сохраняет `http://localhost:3001/...` прямо в треки
 * (server/data/telegram-tracks.json) и отдаёт их клиенту как есть. Пока
 * сервер не передеплоен с фиксом, эти адреса нерабочие — подменяем хост
 * на реальный адрес API. Если `streamUrl` вообще отсутствует, но есть
 * `fileId`, собираем ссылку сами.
 */
function repairTrack(track: TelegramTrack): TelegramTrack {
  const streamUrl =
    normalizeStreamUrl(track.streamUrl) ||
    (track.fileId ? buildFileUrl(track.fileId) : "");

  const coverUrl = track.coverUrl
    ? normalizeStreamUrl(track.coverUrl)
    : track.thumbnailFileId
      ? buildFileUrl(track.thumbnailFileId)
      : null;

  return { ...track, streamUrl, coverUrl };
}

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

  return (data.tracks ?? []).map(repairTrack);
}

/** Загружает уже сохранённые на сервере треки (без синка с Telegram). */
export async function getTelegramTracks(): Promise<TelegramTrack[]> {
  const response = await fetch(`${API_BASE_URL}/api/telegram/tracks`);
  return parseTracksResponse(response, "Failed to load Telegram tracks");
}

/** Запускает на сервере синк getUpdates и возвращает обновлённый список. */
export async function syncTelegramTracks(): Promise<TelegramTrack[]> {
  const response = await fetch(`${API_BASE_URL}/api/telegram/sync`, {
    method: "POST",
  });
  return parseTracksResponse(response, "Failed to sync Telegram tracks");
}

/** Проверка доступности backend-сервера (для статуса в UI). */
export async function checkTelegramHealth(): Promise<TelegramHealthResponse | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    if (!response.ok) return null;
    return (await response.json()) as TelegramHealthResponse;
  } catch {
    return null;
  }
}

export { API_BASE_URL as TELEGRAM_SERVER_URL };
