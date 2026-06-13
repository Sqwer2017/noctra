import {
  Bot,
  Headphones,
  ListMusic,
  MessageCircle,
  Music,
  Palette,
  PlusCircle,
  Settings,
  User,
  Users,
  Disc3,
  Heart,
  Radio,
} from "lucide-react";

import type { WindowMeta } from "../types/windows";

export const windowRegistry: WindowMeta[] = [
  {
    id: "profile",
    title: "Profile",
    subtitle: "identity module",
    category: "Profile",
    icon: <User size={17} />,
  },
  {
    id: "music-search",
    title: "Music Search",
    subtitle: "SoundCloud / Audius / Telegram",
    category: "Music",
    icon: <Music size={17} />,
  },
  {
  id: "favorites",
  title: "Favorites",
  subtitle: "liked tracks collection",
  category: "Music",
  icon: <Heart size={17} />,
  },
  {
    id: "playlists",
    title: "Playlists",
    subtitle: "personal collections",
    category: "Music",
    icon: <ListMusic size={17} />,
  },
  {
  id: "playlist-details",
  title: "Playlist Details",
  subtitle: "tracks and playlist info",
  category: "Music",
  icon: <Disc3 size={17} />,
  },
  {
  id: "create-playlist",
  title: "Create Playlist",
  subtitle: "name, cover and description",
  category: "Music",
  icon: <PlusCircle size={17} />,
  },
  {
    id: "player",
    title: "Player",
    subtitle: "bottom music dock",
    category: "Music",
    icon: <Headphones size={17} />,
    isSpecial: true,
  },
  {
    id: "friends",
    title: "Friends",
    subtitle: "social activity",
    category: "Social",
    icon: <Users size={17} />,
  },
  {
    id: "chat",
    title: "Chat",
    subtitle: "test messaging workspace",
    category: "Social",
    icon: <MessageCircle size={17} />,
  },
  {
    id: "customize",
    title: "Customize",
    subtitle: "themes, widgets and layout",
    category: "Customize",
    icon: <Palette size={17} />,
  },
  {
    id: "telegram",
    title: "Telegram Lab",
    subtitle: "experimental integration",
    category: "Integrations",
    icon: <Bot size={17} />,
  },
  {
  id: "telegram-tracks",
  title: "Telegram Tracks",
  subtitle: "music feed from bot/channel",
  category: "Integrations",
  icon: <Radio size={17} />,
  },
  {
    id: "settings",
    title: "Settings",
    subtitle: "account and API safety",
    category: "Settings",
    icon: <Settings size={17} />,
  },
];

export function getWindowMeta(id: WindowMeta["id"]) {
  return windowRegistry.find((window) => window.id === id);
}

export const groupedWindows = windowRegistry.reduce(
  (groups, window) => {
    if (!groups[window.category]) {
      groups[window.category] = [];
    }

    groups[window.category].push(window);
    return groups;
  },
  {} as Record<string, WindowMeta[]>,
);