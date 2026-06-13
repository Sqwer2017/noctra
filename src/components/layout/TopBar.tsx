import { Search } from "lucide-react";

import { getWindowMeta } from "../../data/windowRegistry";
import type { WindowId } from "../../types/windows";

type TopBarProps = {
  openedWindowsCount: number;
  activeWindow: WindowId | null;
  maxWindows: number;
};

export function TopBar({
  openedWindowsCount,
  activeWindow,
  maxWindows,
}: TopBarProps) {
  const activeMeta = activeWindow ? getWindowMeta(activeWindow) : null;

  return (
    <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/38 px-4 shadow-xl shadow-black/20 backdrop-blur-2xl">
      <div className="min-w-0">
        <p className="truncate text-[11px] uppercase tracking-[0.32em] text-purple-200/35">
          Noctra / {activeMeta?.title ?? "Workspace"}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <p className="hidden text-xs text-purple-100/35 md:block">
          {openedWindowsCount}/{maxWindows} modules
        </p>

        <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-purple-100/45 lg:flex">
          <Search size={14} />
          Search...
        </div>
      </div>
    </header>
  );
}