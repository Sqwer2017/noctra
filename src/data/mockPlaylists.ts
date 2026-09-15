export type Playlist = {
  id: string;
  name: string;
  description: string;
  trackCount: number;
  privacy: "Public" | "Friends" | "Private";
};

export const mockPlaylists: Playlist[] = [
  {
    id: "1",
    name: "Dark Sovereigns",
    description: "Cinematic tracks for boss fights and cold nights.",
    trackCount: 42,
    privacy: "Public",
  },
  {
    id: "2",
    name: "Night Drive",
    description: "Slow, atmospheric tracks for midnight sessions.",
    trackCount: 28,
    privacy: "Friends",
  },
  {
    id: "3",
    name: "Arcane Focus",
    description: "Mystical background music for coding and grinding.",
    trackCount: 19,
    privacy: "Private",
  },
];