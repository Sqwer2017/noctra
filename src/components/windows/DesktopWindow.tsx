import { X } from "lucide-react";
import type { ReactNode } from "react";

import { useT } from "../../i18n/useT";

type DesktopWindowProps = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  isActive?: boolean;
  isClosing?: boolean;
  onFocus: () => void;
  onClose: () => void;
  children: ReactNode;
  /**
   * Счётчик в заголовке (например, число треков).
   *
   * Показывается пилюлей рядом с заголовком. Нужен, чтобы не делать отдельный
   * блок со статистикой внутри окна — как раньше был «Избранные треки / N».
   */
  count?: number;
};

export function DesktopWindow({
  title,
  subtitle,
  icon,
  isActive = false,
  isClosing = false,
  onFocus,
  onClose,
  children,
  count,
}: DesktopWindowProps) {
  const { t } = useT();

  return (
    <section
      onMouseDown={onFocus}
      className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[28px] border bg-black/50 shadow-2xl backdrop-blur-2xl transition-all duration-300 ${
        isClosing ? "animate-[windowOut_320ms_cubic-bezier(0.7,0,0.84,0)_forwards]" : ""
      } ${
        isActive
          ? "border-purple-300/35 shadow-purple-950/40"
          : "border-purple-200/15 shadow-purple-950/20"
      }`}
    >
      <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-white/10 bg-white/[0.035] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-purple-100 transition ${
              isActive
                ? "border-purple-300/35 bg-purple-500/20"
                : "border-purple-200/15 bg-purple-500/10"
            }`}
          >
            {icon}
          </div>

          <div className="min-w-0">
            <h2 className="flex items-center gap-2 truncate text-sm font-semibold text-white">
              <span className="truncate">{title}</span>
              {typeof count === "number" && (
                <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-purple-100/60">
                  {count}
                </span>
              )}
            </h2>
            <p className="truncate text-[11px] text-purple-100/35">
              {subtitle}
            </p>
          </div>
        </div>

        <button
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="rounded-full p-1 text-purple-100/35 transition hover:bg-red-500/20 hover:text-red-100"
          title={t("common.closelabel")}
        >
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 noctra-scrollbar">
        {children}
      </div>
    </section>
  );
}
