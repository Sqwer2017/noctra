import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  Circle,
  LogIn,
  LogOut,
  Sparkles,
  User,
} from "lucide-react";

import logo from "../../assets/noctra-logo.png";
import { groupedWindows } from "../../data/windowRegistry";
import type { WindowCategory, WindowId } from "../../types/windows";
import { useT } from "../../i18n/useT";
import {
  WINDOW_CATEGORY_KEYS,
  WINDOW_TITLE_KEYS,
} from "../../i18n/windowKeys";
import { useAppStore } from "../../store/useAppStore";
import { useProgressionStore } from "../../store/useProgressionStore";
import { getRankByXp } from "../../lib/ranks";
import { RankIcon } from "../profile/RankIcon";

type SidebarProps = {
  isCollapsed: boolean;
  openedWindows: WindowId[];
  onToggleCollapse: () => void;
  onOpenWindow: (windowId: WindowId) => void;
  onLogout: () => void;
  onOpenDashboard: () => void;
  isDashboardOpen: boolean;
  /** Открыть окно входа (для гостя). */
  onRequestSignIn: () => void;
};

const defaultOpenedCategories: WindowCategory[] = ["Music"];

export function Sidebar({
  isCollapsed,
  openedWindows,
  onToggleCollapse,
  onOpenWindow,
  onLogout,
  onOpenDashboard,
  isDashboardOpen,
  onRequestSignIn,
}: SidebarProps) {
  const [openedCategories, setOpenedCategories] = useState<WindowCategory[]>(
    defaultOpenedCategories,
  );
  const { t } = useT();
  const profile = useAppStore((s) => s.profile);
  const isGuest = useAppStore((s) => s.isGuest);
  const totalXP = useProgressionStore((s) => s.totalXP);
  const rank = getRankByXp(totalXP);

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
          title={t("sidebar.collapse")}
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
          title={isCollapsed ? t("sidebar.expand") : t("sidebar.tooltip")}
        >
          <img
            src={logo}
            alt="Noctra"
            className={`object-contain drop-shadow-[0_0_24px_rgba(168,85,247,0.35)] transition-all duration-500 ease-out ${
              isCollapsed ? "h-[4.8rem] max-w-[84px]" : "h-[8.4rem] max-w-[264px]"
            }`}
          />
        </button>

        {!isCollapsed && (
          <p className="mt-2 text-center text-xs tracking-[0.25em] text-purple-100/45">
            {t("brand.tagline")}
          </p>
        )}

        {/* В свёрнутом виде — крупный мини-аватар для быстрого доступа к профилю */}
        {isCollapsed && profile && (
          <button
            onClick={onOpenDashboard}
            title={t("dash.open")}
            className={`mx-auto mt-4 flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-2 transition-all hover:scale-105 hover:ring-[var(--accent)] ${
              isDashboardOpen ? "ring-[var(--accent)]" : "ring-white/10"
            }`}
          >
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-base font-semibold text-purple-100/80">
                {profile.nick?.[0]?.toUpperCase() ?? <User size={16} />}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Мини-карточка текущего юзера — открывает полноэкранный дашборд */}
      {!isCollapsed && profile && (
        <button
          onClick={onOpenDashboard}
          title={t("dash.open")}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-purple-300/15 bg-white/[0.04] p-2.5 text-left transition hover:border-purple-300/30 hover:bg-white/[0.07]"
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-purple-300/20 bg-purple-500/20 font-semibold text-sm">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              profile.nick?.[0]?.toUpperCase() ?? <User size={15} />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold">
                {profile.nick}
              </span>

              {/* Бейдж ранга: реальный ранг из накопленного XP */}
              <RankIcon icon={rank.icon} size={14} glow={6} className="shrink-0" />
            </span>
            <span className="block truncate text-xs text-purple-100/45">
              {profile.handle} · {t(rank.labelKey)}
            </span>
          </span>
        </button>
      )}

      {/* Гость: сессии нет — предлагаем войти через Google */}
      {!isCollapsed && isGuest && (
        <button
          onClick={onRequestSignIn}
          title={t("auth.modal.title")}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-purple-300/25 bg-purple-500/10 p-2.5 text-left transition hover:border-purple-300/40 hover:bg-purple-500/20"
        >
          <span className="inline-flex aspect-square h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-500/20 p-0 leading-none">
            <LogIn size={15} className="m-0 block" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {t("sidebar.signIn")}
            </span>
            <span className="block truncate text-xs text-purple-100/45">
              {t("sidebar.guest")}
            </span>
          </span>
        </button>
      )}

      {/* Свёрнутый вид: компактная кнопка входа для гостя */}
      {isCollapsed && isGuest && (
        <button
          onClick={onRequestSignIn}
          title={t("sidebar.signIn")}
          className="mx-auto mt-4 inline-flex aspect-square h-12 w-12 items-center justify-center rounded-full border border-purple-300/25 bg-purple-500/15 p-0 leading-none transition hover:scale-105 hover:border-purple-300/50"
        >
          <LogIn size={17} className="m-0 block" />
        </button>
      )}

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
                    <span>{t(WINDOW_CATEGORY_KEYS[category])}</span>

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
                        const localizedTitle = t(WINDOW_TITLE_KEYS[window.id]);

                        return (
                          <button
                            key={window.id}
                            onClick={() => onOpenWindow(window.id)}
                            title={localizedTitle}
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
                                  {localizedTitle}
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
            {t("sidebar.auto.tiling")}
          </div>

          <p className="text-xs leading-5 text-purple-100/45">
            {t("sidebar.auto.body")}
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
        {!isCollapsed && t("sidebar.logout")}
      </button>
    </aside>
  );
}
