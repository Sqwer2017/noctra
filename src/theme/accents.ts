/**
 * Акцентные темы приложения.
 *
 * Механика: мы НЕ переписываем сотни purple-* классов. Вместо этого в
 * globals.css переопределяется палитра Tailwind (--color-purple-*), значения
 * которой ссылаются на акцентные переменные (--accent*). Смена пресета
 * меняет эти переменные → весь интерфейс перекрашивается разом.
 *
 * Пресет задаёт набор оттенков, из которых собираются тона палитры:
 *  - base  — основной акцент (≈ purple-500)
 *  - soft  — светлый оттенок для текста/границ (≈ purple-200/300)
 *  - strong— насыщенный/тёмный (≈ purple-600/700)
 *  - deep  — очень тёмный для фонов/теней (≈ purple-950)
 *  - glow  — rgba для свечений
 *  - border— rgba для границ
 *  - text  — светлый текст поверх акцента (≈ purple-50/100)
 */

export type AccentPresetId =
  | "neon-purple"
  | "cyber-teal"
  | "blood-red"
  | "emerald"
  | "gold"
  | "ice"
  | "custom";

export type AccentPalette = {
  base: string;
  soft: string;
  strong: string;
  deep: string;
  glow: string;
  border: string;
  text: string;
};

export const ACCENT_PRESETS: Record<Exclude<AccentPresetId, "custom">, {
  labelKey: string;
  swatch: string;
  palette: AccentPalette;
}> = {
  "neon-purple": {
    labelKey: "accent.neon-purple",
    swatch: "#a855f7",
    palette: {
      base: "#a855f7",
      soft: "#d8b4fe",
      strong: "#7e22ce",
      deep: "#3b0764",
      glow: "rgba(168,85,247,0.55)",
      border: "rgba(216,180,254,0.35)",
      text: "#f5f3ff",
    },
  },
  "cyber-teal": {
    labelKey: "accent.cyber-teal",
    swatch: "#06b6d4",
    palette: {
      base: "#06b6d4",
      soft: "#67e8f9",
      strong: "#0e7490",
      deep: "#083344",
      glow: "rgba(6,182,212,0.55)",
      border: "rgba(103,232,249,0.35)",
      text: "#ecfeff",
    },
  },
  "blood-red": {
    labelKey: "accent.blood-red",
    swatch: "#ef4444",
    palette: {
      base: "#ef4444",
      soft: "#fca5a5",
      strong: "#b91c1c",
      deep: "#450a0a",
      glow: "rgba(239,68,68,0.55)",
      border: "rgba(252,165,165,0.35)",
      text: "#fef2f2",
    },
  },
  emerald: {
    labelKey: "accent.emerald",
    swatch: "#10b981",
    palette: {
      base: "#10b981",
      soft: "#6ee7b7",
      strong: "#047857",
      deep: "#022c22",
      glow: "rgba(16,185,129,0.55)",
      border: "rgba(110,231,183,0.35)",
      text: "#ecfdf5",
    },
  },
  gold: {
    labelKey: "accent.gold",
    swatch: "#f59e0b",
    palette: {
      base: "#f59e0b",
      soft: "#fcd34d",
      strong: "#b45309",
      deep: "#451a03",
      glow: "rgba(245,158,11,0.55)",
      border: "rgba(252,211,77,0.35)",
      text: "#fffbeb",
    },
  },
  ice: {
    labelKey: "accent.ice",
    swatch: "#3b82f6",
    palette: {
      base: "#3b82f6",
      soft: "#93c5fd",
      strong: "#1d4ed8",
      deep: "#172554",
      glow: "rgba(59,130,246,0.55)",
      border: "rgba(147,197,253,0.35)",
      text: "#eff6ff",
    },
  },
};

export const DEFAULT_ACCENT: AccentPresetId = "neon-purple";

/**
 * Собирает палитру из произвольного HEX-цвета (кастомный пресет).
 * Прозрачности/градации считаем через HSL-сдвиг яркости.
 */
export function paletteFromHex(hex: string): AccentPalette {
  const rgb = hexToRgb(hex) ?? { r: 168, g: 85, b: 247 };

  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const toHsl = (lightness: number, saturation = s) =>
    `hsl(${Math.round(h)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%)`;

  return {
    base: toHsl(l),
    soft: toHsl(Math.min(l + 0.25, 0.92), Math.min(s * 0.9, 1)),
    strong: toHsl(Math.max(l - 0.15, 0.15)),
    deep: toHsl(Math.max(l - 0.4, 0.05), Math.min(s * 0.8, 1)),
    glow: `hsla(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}% / 0.55)`,
    border: `hsla(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(Math.min(l + 0.3, 0.9) * 100)}% / 0.35)`,
    text: toHsl(Math.min(l + 0.45, 0.98), Math.min(s * 0.5, 0.6)),
  };
}

export function resolvePalette(
  preset: AccentPresetId,
  customColor: string,
): AccentPalette {
  if (preset === "custom") return paletteFromHex(customColor);
  return ACCENT_PRESETS[preset].palette;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace("#", "").trim();
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;

  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s, l };
}
