import { useState } from "react";

/**
 * Иконка ранга: PNG из /public/ranks/{tier}.png.
 *
 * Без фонового квадрата и рамок — только сама эмблема с мягким неоновым
 * свечением. Если файл не загрузился, ничего не рендерим (без SVG-заглушки).
 */
export function RankIcon({
  icon,
  size = 96,
  className = "",
  glow = 16,
}: {
  /** Путь к PNG ранга, например /ranks/3.png */
  icon: string;
  /** Размер в px (квадрат). */
  size?: number;
  className?: string;
  /** Сила свечения (px). */
  glow?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <img
      src={icon}
      alt=""
      width={size}
      height={size}
      draggable={false}
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
      style={{
        width: size,
        height: size,
        filter: `drop-shadow(0 0 ${glow}px var(--accent-glow))`,
      }}
    />
  );
}
