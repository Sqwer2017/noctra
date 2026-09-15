import type { ReactNode } from "react";

export type WindowId =
  | "music-search"
  | "playlists"
  | "create-playlist"
  | "friends"
  | "chat"
  | "customize"
  | "telegram"
  | "telegram-tracks"
  | "settings"
  | "playlist-details"
  | "favorites"
  | "player";

export type WindowCategory =
  | "Music"
  | "Social"
  | "Integrations"
  | "Settings";

export type WindowMeta = {
  id: WindowId;
  title: string;
  subtitle: string;
  category: WindowCategory;
  icon: ReactNode;
  isSpecial?: boolean;
};