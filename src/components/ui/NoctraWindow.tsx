import type { ReactNode } from "react";

type NoctraWindowProps = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  className?: string;
  children: ReactNode;
};

export function NoctraWindow({
  title,
  subtitle,
  icon,
  className = "",
  children,
}: NoctraWindowProps) {
  return (
    <section
      className={`min-h-0 overflow-hidden rounded-[28px] border border-purple-200/15 bg-black/48 shadow-2xl shadow-purple-950/25 backdrop-blur-2xl ${className}`}
    >
      <div className="flex h-[58px] items-center justify-between border-b border-white/10 bg-white/[0.035] px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-purple-200/15 bg-purple-500/10 text-purple-100">
            {icon}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            <p className="text-[11px] text-purple-100/35">{subtitle}</p>
          </div>
        </div>

        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-purple-300/35" />
          <span className="h-2 w-2 rounded-full bg-purple-300/20" />
        </div>
      </div>

      <div className="h-[calc(100%-58px)] overflow-auto p-4 noctra-scrollbar">
        {children}
      </div>
    </section>
  );
}