import { Bot, Radio, Send } from "lucide-react";
import { NoctraWindow } from "./NoctraWindow";

export function TelegramLabWindow() {
  return (
    <NoctraWindow title="Telegram Lab" icon={<Bot size={17} />}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-3">
          <p className="text-sm font-medium text-yellow-100">
            Experimental integration
          </p>
          <p className="mt-1 text-xs leading-5 text-yellow-100/55">
            Telegram is planned for test chat, notifications and music feed.
            Bot tokens must stay on backend.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-purple-100/45">Bot status</p>
            <p className="mt-1 text-sm text-red-200">Not connected</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs text-purple-100/45">Mode</p>
            <p className="mt-1 text-sm text-purple-100">Mock only</p>
          </div>
        </div>

        <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-purple-200/20 bg-purple-500/15 px-4 py-3 text-sm text-purple-50 hover:bg-purple-500/25">
          <Send size={16} />
          Send test message
        </button>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-3 flex items-center gap-2 text-sm">
            <Radio size={16} />
            Telegram Music Feed
          </div>
          <input
            placeholder="Paste Telegram channel link..."
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-purple-100/35"
          />
        </div>
      </div>
    </NoctraWindow>
  );
}