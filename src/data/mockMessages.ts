export type ChatMessage = {
  id: string;
  author: string;
  text: string;
  time: string;
};

export const mockMessages: ChatMessage[] = [
  {
    id: "1",
    author: "Nyxshade",
    text: "This profile theme looks insane.",
    time: "22:14",
  },
  {
    id: "2",
    author: "Mocevn",
    text: "Need to add music sync next.",
    time: "22:15",
  },
  {
    id: "3",
    author: "Lunaris",
    text: "Telegram lab could be useful for testing.",
    time: "22:17",
  },
];