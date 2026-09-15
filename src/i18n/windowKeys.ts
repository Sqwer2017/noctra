import type { WindowId, WindowCategory } from "../types/windows";

/**
 * Мапинг меж WindowId / WindowCategory и ключами словаря локализации.
 * Регистр (windowRegistry.title/subtitle/category) остаётся «машинным»
 * и никак не зависит от языка — отображение строк строится отсюда.
 */
export const WINDOW_TITLE_KEYS: Record<WindowId, string> = {
  "music-search": "win.musicsearch.title",
  playlists: "win.playlists.title",
  "create-playlist": "win.createplaylist.title",
  friends: "win.friends.title",
  chat: "win.chat.title",
  customize: "win.customize.title",
  telegram: "win.telegram.title",
  "telegram-tracks": "win.telegramtracks.title",
  settings: "win.settings.title",
  "playlist-details": "win.playlistdetails.title",
  favorites: "win.favorites.title",
  player: "win.player.title",
};

export const WINDOW_SUBTITLE_KEYS: Record<WindowId, string> = {
  "music-search": "win.musicsearch.subtitle",
  playlists: "win.playlists.subtitle",
  "create-playlist": "win.createplaylist.subtitle",
  friends: "win.friends.subtitle",
  chat: "win.chat.subtitle",
  customize: "win.customize.subtitle",
  telegram: "win.telegram.subtitle",
  "telegram-tracks": "win.telegramtracks.subtitle",
  settings: "win.settings.subtitle",
  "playlist-details": "win.playlistdetails.subtitle",
  favorites: "win.favorites.subtitle",
  player: "win.player.subtitle",
};

export const WINDOW_CATEGORY_KEYS: Record<WindowCategory, string> = {
  Music: "win.category.Music",
  Social: "win.category.Social",
  Integrations: "win.category.Integrations",
  Settings: "win.category.Settings",
};
