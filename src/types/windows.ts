import type { ReactNode } from "react";

export type WindowId =
  | "profile"
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
  | "Profile"
  | "Music"
  | "Social"
  | "Customize"
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