export type PlaylistPrivacy = "Public" | "Friends" | "Private";

export type PlaylistTrack = {
  id: string;
  title: string;
  artist: string;
  source: "SoundCloud" | "Audius" | "Telegram Test" | "Telegram";
  duration: string;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  cover: string | null;
  privacy: PlaylistPrivacy;
  tracks: PlaylistTrack[];
};