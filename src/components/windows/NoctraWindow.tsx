import { Minus, Move, X } from "lucide-react";
import type { ReactNode } from "react";

type NoctraWindowProps = {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function NoctraWindow({
  title,
  icon,
  children,
  className = "",
}: NoctraWindowProps) {
  return (
    <section
      className={`min-h-0 overflow-hidden rounded-3xl border border-purple-200/15 bg-black/32 shadow-2xl shadow-purple-950/25 backdrop-blur-2xl ${className}`}
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.035] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-purple-200/15 bg-purple-500/10 text-purple-100">
            {icon}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            <p className="text-[11px] text-purple-100/40">
              fixed modular window
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-purple-100/45">
          <Move size={15} />
          <button className="rounded-full p-1 hover:bg-white/10">
            <Minus size={14} />
          </button>
          <button className="rounded-full p-1 hover:bg-white/10">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="h-[calc(100%-57px)] overflow-auto p-4 noctra-scrollbar">
        {children}
      </div>
    </section>
  );
}