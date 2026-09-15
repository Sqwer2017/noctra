export type TrackSource = "SoundCloud" | "Audius" | "Telegram Test";

export type Track = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  source: TrackSource;
  cover: string;
};

export const mockTracks: Track[] = [
  {
    id: "1",
    title: "Eclipse of the Fallen",
    artist: "Nyxshade",
    duration: "3:42",
    source: "SoundCloud",
    cover:
      "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "2",
    title: "Bloodmoon Overture",
    artist: "GravePulse",
    duration: "4:12",
    source: "Audius",
    cover:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "3",
    title: "Beyond the Veil",
    artist: "Lunaris",
    duration: "2:58",
    source: "Telegram Test",
    cover:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "4",
    title: "Requiem of Embers",
    artist: "Vexra",
    duration: "3:27",
    source: "SoundCloud",
    cover:
      "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=300&q=80",
  },
];