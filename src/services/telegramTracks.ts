import type { PlaylistTrack } from "../types/playlist";

const TELEGRAM_SERVER_URL = "http://localhost:3001";

type TelegramTracksResponse = {
  ok: boolean;
  tracks: PlaylistTrack[];
  message?: string;
};

export async function getTelegramTracks() {
  const response = await fetch(`${TELEGRAM_SERVER_URL}/api/telegram/tracks`);

  if (!response.ok) {
    throw new Error("Failed to load Telegram tracks");
  }

  const data = (await response.json()) as TelegramTracksResponse;

  if (!data.ok) {
    throw new Error(data.message || "Telegram tracks error");
  }

  return data.tracks;
}

export async function syncTelegramTracks() {
  const response = await fetch(`${TELEGRAM_SERVER_URL}/api/telegram/sync`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to sync Telegram tracks");
  }

  const data = (await response.json()) as TelegramTracksResponse;

  if (!data.ok) {
    throw new Error(data.message || "Telegram sync error");
  }

  return data.tracks;
}