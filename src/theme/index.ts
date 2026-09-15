import type { AccentPalette, AccentPresetId } from "./accents";
import { resolvePalette } from "./accents";

/**
 * Применяет выбранную палитру к документу.
 *
 * Ставит на <html> атрибут data-accent (для пресетов и как маркер) и
 * проставляет акцентные CSS-переменные inline. Палитра Tailwind в
 * globals.css ссылается на эти переменные, поэтому весь UI перекрашивается.
 */
export function applyAccent(
  preset: AccentPresetId,
  customColor: string,
): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const palette = resolvePalette(preset, customColor);

  root.setAttribute("data-accent", preset);

  writePalette(root, palette);
}

function writePalette(root: HTMLElement, palette: AccentPalette): void {
  const vars: Record<string, string> = {
    "--accent": palette.base,
    "--accent-soft": palette.soft,
    "--accent-strong": palette.strong,
    "--accent-deep": palette.deep,
    "--accent-glow": palette.glow,
    "--accent-border": palette.border,
    "--accent-text": palette.text,
  };

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}
