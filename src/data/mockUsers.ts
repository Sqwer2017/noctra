export type Friend = {
  id: string;
  name: string;
  status: "online" | "offline" | "idle";
  listeningTo?: string;
};

export const profileUser = {
  username: "Mocevn",
  handle: "@mocevn",
  status: "wandering through the midnight guild",
  bio: "Dark fantasy enjoyer, playlist collector, and late-night gamer.",
  rank: "Nightborn",
  followers: 1284,
  following: 318,
};

export const mockFriends: Friend[] = [
  {
    id: "1",
    name: "Nyxshade",
    status: "online",
    listeningTo: "Eclipse of the Fallen",
  },
  {
    id: "2",
    name: "Lunaris",
    status: "idle",
    listeningTo: "Beyond the Veil",
  },
  {
    id: "3",
    name: "Svaria",
    status: "offline",
  },
];