import { MessageCircle, Send } from "lucide-react";
import { mockMessages } from "../../data/mockMessages";
import { NoctraWindow } from "./NoctraWindow";

export function ChatWindow() {
  return (
    <NoctraWindow title="Chat Test" icon={<MessageCircle size={17} />}>
      <div className="flex h-full flex-col gap-3">
        <div className="rounded-2xl border border-purple-200/15 bg-purple-500/10 p-3 text-xs text-purple-100/60">
          Telegram sync placeholder. Real bot integration will be connected
          through backend/serverless functions.
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto noctra-scrollbar">
          {mockMessages.map((message) => (
            <div
              key={message.id}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold text-purple-100">
                  {message.author}
                </p>
                <p className="text-[10px] text-purple-100/35">
                  {message.time}
                </p>
              </div>
              <p className="text-sm text-purple-100/65">{message.text}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2">
          <input
            placeholder="Send a test message..."
            className="min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-purple-100/35"
          />
          <button className="rounded-xl bg-purple-500/25 p-2 hover:bg-purple-500/40">
            <Send size={16} />
          </button>
        </div>
      </div>
    </NoctraWindow>
  );
}