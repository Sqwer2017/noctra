import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  Circle,
  LogOut,
  Sparkles,
} from "lucide-react";

import logo from "../../assets/noctra-logo.png";
import { groupedWindows } from "../../data/windowRegistry";
import type { WindowCategory, WindowId } from "../../types/windows";

type SidebarProps = {
  isCollapsed: boolean;
  openedWindows: WindowId[];
  onToggleCollapse: () => void;
  onOpenWindow: (windowId: WindowId) => void;
  onLogout: () => void;
};

const defaultOpenedCategories: WindowCategory[] = ["Music"];

export function Sidebar({
  isCollapsed,
  openedWindows,
  onToggleCollapse,
  onOpenWindow,
  onLogout,
}: SidebarProps) {
  const [openedCategories, setOpenedCategories] = useState<WindowCategory[]>(
    defaultOpenedCategories,
  );

  function toggleCategory(category: WindowCategory) {
    setOpenedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  return (
    <aside className="relative flex min-h-0 flex-col rounded-[28px] border border-purple-300/15 bg-black/50 p-4 shadow-2xl shadow-purple-950/40 backdrop-blur-2xl transition-all duration-500 ease-out">
      {!isCollapsed && (
        <button
          onClick={onToggleCollapse}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-purple-300/20 bg-black/70 text-purple-100 shadow-lg shadow-purple-950/40 transition hover:bg-purple-500/20"
          title="Collapse sidebar"
        >
          <ChevronLeft size={16} />
        </button>
      )}

      <div className="border-b border-white/10 pb-5">
        <button
          onClick={() => {
            if (isCollapsed) {
              onToggleCollapse();
            }
          }}
          className={`flex w-full justify-center rounded-2xl transition ${
            isCollapsed
              ? "cursor-pointer hover:bg-purple-500/10"
              : "cursor-default"
          }`}
          title={isCollapsed ? "Expand sidebar" : "Noctra"}
        >
          <img
            src={logo}
            alt="Noctra"
            className={`object-contain drop-shadow-[0_0_24px_rgba(168,85,247,0.35)] transition-all duration-500 ease-out ${
              isCollapsed ? "h-16 max-w-[70px]" : "h-28 max-w-[220px]"
            }`}
          />
        </button>

        {!isCollapsed && (
          <p className="mt-2 text-center text-xs tracking-[0.25em] text-purple-100/45">
            MUSIC IS IDENTITY
          </p>
        )}
      </div>

      <nav className="mt-5 min-h-0 flex-1 overflow-auto pr-1 noctra-scrollbar">

        <div className="space-y-2">
          {Object.entries(groupedWindows).map(([rawCategory, windows]) => {
            const category = rawCategory as WindowCategory;
            const isCategoryOpen =
              isCollapsed || openedCategories.includes(category);

            return (
              <div key={category}>
                {!isCollapsed && (
                  <button
                    onClick={() => toggleCategory(category)}
                    className="mb-1 flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-purple-100/38 transition hover:bg-white/[0.04] hover:text-purple-100/60"
                  >
                    <span>{category}</span>

                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-300 ${
                        isCategoryOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </button>
                )}

                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isCategoryOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="space-y-1.5">
                      {windows.map((window) => {
                        const isOpen = openedWindows.includes(window.id);

                        return (
                          <button
                            key={window.id}
                            onClick={() => onOpenWindow(window.id)}
                            title={window.title}
                            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                              isOpen
                                ? "border border-purple-300/30 bg-purple-500/20 text-white shadow-lg shadow-purple-950/30"
                                : "text-purple-100/55 hover:bg-white/8 hover:text-white"
                            } ${isCollapsed ? "justify-center px-0" : ""}`}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-purple-300/10 bg-purple-500/10">
                              {window.icon}
                            </span>

                            {!isCollapsed && (
                              <>
                                <span className="min-w-0 flex-1 truncate">
                                  {window.title}
                                </span>

                                {isOpen && (
                                  <Circle
                                    size={8}
                                    className="fill-purple-300 text-purple-300"
                                  />
                                )}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      {!isCollapsed && (
        <div className="mt-4 rounded-3xl border border-purple-300/10 bg-purple-950/20 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm text-purple-100">
            <Sparkles size={16} />
            Auto-tiling desktop
          </div>

          <p className="text-xs leading-5 text-purple-100/45">
            Maximum 4 regular windows. Player is a special bottom module.
          </p>
        </div>
      )}

      <button
        onClick={onLogout}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100/75 transition hover:bg-red-500/20 ${
          isCollapsed ? "px-0" : ""
        }`}
      >
        <LogOut size={16} />
        {!isCollapsed && "Logout"}
      </button>
    </aside>
  );
}