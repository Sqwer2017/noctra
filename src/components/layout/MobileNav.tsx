import { useEffect, useRef } from "react";
import { motion } from "motion/react";

import { useT } from "../../i18n/useT";
import { useAppStore } from "../../store/useAppStore";
import type { WindowId } from "../../types/windows";
import { MOBILE_NAV_ITEMS } from "./mobileTabs";

type MobileNavProps = {
  /** Активное окно (подсвечивается в меню). */
  activeWindow: WindowId | null;
  /** Открыть окно. */
  onOpenWindow: (id: WindowId) => void;
  /** Открыть профиль (тап по аватарке). */
  onOpenProfile: () => void;
};

/**
 * Верхняя навигация мобильной версии.
 *
 * Горизонтальная лента круглых кнопок-иконок БЕЗ названий, как док iOS.
 * Слева первой стоит аватарка пользователя (тап открывает профиль), дальше —
 * все окна, доступные на ПК. Лента прокручивается влево-вправо.
 *
 * Форма — идеальный круг (`rounded-full` при квадратных кнопках 44px).
 * Это решает сразу две проблемы: углы становятся максимально мягкими, а
 * неоновая подсветка активного окна никуда не выходит — круг полностью
 * помещается в кнопку.
 */
export function MobileNav({
  activeWindow,
  onOpenWindow,
  onOpenProfile,
}: MobileNavProps) {
  const { t } = useT();
  const profile = useAppStore((s) => s.profile);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  /*
   * Подкрутка ленты к активной иконке.
   *
   * Без этого при открытии окна из другого места (например, изнутри
   * плейлиста) активная иконка могла остаться за краем экрана, и было
   * непонятно, что вообще открыто. `inline: "nearest"` крутит минимально —
   * только если иконка не видна.
   */
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "nearest",
      block: "nearest",
    });
  }, [activeWindow]);

  return (
    <nav
      aria-label={t("mobile.nav.label")}
      /*
       * Контейнер — «пилюля» (stadium): скругление больше половины высоты.
       *
       * Высота строки: py-2 (16px) + кнопки 44px = 60px. Половина — 30px,
       * поэтому `rounded-[30px]` даёт идеально полукруглые торцы слева
       * и справа. `rounded-full` здесь нельзя: он считается от ширины,
       * а ширина у ленты во весь экран — получился бы овал.
       */
      className="shrink-0 rounded-[30px] border border-white/10 bg-black/50 backdrop-blur-2xl"
    >
      {/*
        Горизонтальная лента.
        
        `overflow-x-auto` + скрытый скроллбар: листается пальцем, но без
        визуального мусора. Отступы по краям, чтобы первая и последняя иконки
        не липли к рамке.
      */}
      <div
        ref={scrollRef}
        className="noctra-scrollbar-none flex items-center gap-1.5 overflow-x-auto px-3 py-2"
      >
        {/* Аватарка — первая в ленте, открывает профиль */}
        <AvatarButton
          avatarUrl={profile?.avatarUrl ?? null}
          nick={profile?.nick ?? ""}
          onOpenProfile={onOpenProfile}
        />

        {/* Разделитель между аватаром и окнами */}
        <span aria-hidden="true" className="h-8 w-px shrink-0 bg-white/10" />

        {MOBILE_NAV_ITEMS.filter((item) => item.kind === "window").map(
          (item) => {
            if (item.kind !== "window") return null;

            const isActive = activeWindow === item.id;

            return (
              <button
                key={item.id}
                ref={isActive ? activeRef : undefined}
                type="button"
                onClick={() => onOpenWindow(item.id)}
                aria-current={isActive ? "page" : undefined}
                title={t(item.labelKey)}
                aria-label={t(item.labelKey)}
                /*
                 * Кнопка — идеальный круг: 44×44px + rounded-full.
                 *
                 * Квадрат со скруглением 16px давал углы, за которые цеплялся
                 * глаз, а неоновая подложка при анимации перемещения выходила
                 * за границы кнопки (см. скрин). Круг решает обе проблемы:
                 * углов нет в принципе, а подложка всегда внутри.
                 */
                className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                  isActive ? "text-white" : "text-purple-100/45"
                }`}
              >
                {/*
                  Неоновая подсветка активного окна.
                  
                  `layoutId` заставляет framer-motion плавно ПЕРЕМЕЩАТЬ подложку
                  между иконками вместо того, чтобы гасить одну и зажигать другую.
                  Форма — круг (`rounded-full`), строго внутри кнопки: `inset-0`
                  при круглой кнопке даёт круг, который никуда не выходит.
                */}
                {isActive && (
                  <motion.span
                    layoutId="mobile-nav-active"
                    transition={{ type: "spring", stiffness: 320, damping: 30 }}
                    className="absolute inset-0 rounded-full border border-[color:var(--accent-border)] bg-purple-500/20"
                    style={{ boxShadow: "0 0 14px var(--accent-glow)" }}
                  />
                )}

                <span className="relative [&>svg]:m-0 [&>svg]:block">
                  {item.icon}
                </span>
              </button>
            );
          },
        )}
      </div>
    </nav>
  );
}

function AvatarButton({
  avatarUrl,
  nick,
  onOpenProfile,
}: {
  avatarUrl: string | null;
  nick: string;
  onOpenProfile: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={onOpenProfile}
      aria-label="Профиль"
      title={nick || "Профиль"}
      // Аватарка уже была кругом — оставляем как есть.
      className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[color:var(--accent-border)] bg-black/60"
      style={{ boxShadow: "0 0 14px var(--accent-glow)" }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-sm font-bold text-purple-200">
          {nick[0]?.toUpperCase() ?? "♪"}
        </span>
      )}
    </motion.button>
  );
}
