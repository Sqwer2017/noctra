import { ChevronUp, Pause, Play } from "lucide-react";
import { motion } from "motion/react";

import { useT } from "../../i18n/useT";
import { usePlayerStore } from "../../store/usePlayerStore";
import { TrackCover } from "../tracks/TrackCover";

type MobileMiniPlayerProps = {
  /** Открыть полноэкранный плеер (BottomSheet). */
  onExpand: () => void;
};

/**
 * Плавающий мини-плеер мобильной версии.
 *
 * По референсу: карточка над нижней границей экрана, внутри — мини-обложка,
 * название и автор, кнопка Play/Pause и кнопка разворота. Тап по карточке
 * (кроме кнопок) открывает полноэкранный плеер.
 *
 * Визуал — «глубокое матовое стекло» (Liquid Glass в духе Telegram iOS):
 * полупрозрачный тёмный фон, сильное размытие того, что под карточкой,
 * тонкая светлая рамка и глубокая тень. Карточка парит над контентом,
 * а не лежит в потоке страницы.
 */
export function MobileMiniPlayer({ onExpand }: MobileMiniPlayerProps) {
  const { t } = useT();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const requestToggle = usePlayerStore((s) => s.requestToggle);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);

  // Трека нет — показывать нечего.
  if (!currentTrack) return null;

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={t("mobile.miniPlayer.expand")}
      /*
       * Тап НЕ открывает шторку — только свайп вверх.
       *
       * Раньше `onClick={onExpand}` конфликтовал с горизонтальным свайпом:
       * после переключения трека жест завершался кликом, и плеер разворачивался
       * на весь экран вместо того, чтобы просто скипнуть трек. Плюс случайные
       * касания при прокрутке списка открывали шторку.
       *
       * Теперь разворот — только осознанный свайп вверх. Клавиатура сохранена
       * для доступности: Enter и пробел по-прежнему открывают.
       */
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onExpand();
        }
      }}
      // Появление снизу с пружиной — как всплытие шторки.
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      /*
       * Два жеста на одном элементе: влево/вправо — переключение трека,
       * вверх — разворот шторки.
       *
       * `dragDirectionLock` — ключ к тому, чтобы они не мешали друг другу:
       * framer-motion определяет доминирующее направление в начале жеста
       * и дальше ведёт только по нему. Без блокировки диагональное движение
       * дёргало бы оба.
       */
      drag
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.4}
      onDragEnd={(_, info) => {
        const { x, y } = info.offset;
        const vx = info.velocity.x;
        const vy = info.velocity.y;

        // Вертикальное движение доминирует — проверяем разворот.
        if (Math.abs(y) > Math.abs(x)) {
          if (y < -60 || vy < -400) {
            onExpand();
          }
          return;
        }

        // Горизонтальное — переключение трека.
        if (x < -50 || vx < -300) {
          playNext();
        } else if (x > 50 || vx > 300) {
          playPrevious();
        }
      }}
      /*
       * Liquid Glass в потоке.
       *
       * Плеер — «пилюля» (stadium): высота строки около 68px
       * (py-3 + контент 44px), поэтому скругление 34px даёт идеально
       * полукруглые торцы слева и справа. `rounded-full` здесь нельзя:
       * ширина во весь экран, получился бы овал, а не пилюля.
       *
       * `touch-action: none` обязателен: без него браузер отбирает жест
       * на скролл страницы, и свайп не доходит до framer-motion.
       */
      style={{ touchAction: "none" }}
      className="flex items-center gap-3 rounded-[34px] border border-white/15 bg-[#120d1d]/70 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.7)] backdrop-blur-3xl"
    >
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl">
        <TrackCover track={currentTrack} size="h-11 w-11" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {currentTrack.title}
        </p>
        <p className="truncate text-xs text-purple-100/55">
          {currentTrack.artist}
        </p>
      </div>

      {/*
        Кнопки останавливают всплытие: тап по ним не должен открывать
        полноэкранный плеер, они делают своё действие на месте.
      */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={(event) => {
          event.stopPropagation();
          requestToggle();
        }}
        aria-label={t("player.playpause")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-500/30 text-white"
        style={{ boxShadow: "0 0 18px var(--accent-glow)" }}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </motion.button>

      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={(event) => {
          event.stopPropagation();
          onExpand();
        }}
        aria-label={t("mobile.miniPlayer.expand")}
        className="shrink-0 rounded-full p-1.5 text-purple-100/60 transition hover:text-white"
      >
        <ChevronUp size={18} className="m-0 block" />
      </motion.button>
    </motion.div>
  );
}
