export type ThemeKind = "light" | "dark";
export type Rgb = [number, number, number];

export const COLOR_STEPS = 16;

const STOPS: Record<ThemeKind, Rgb[]> = {
  dark: [
    [137, 209, 133],
    [204, 167, 0],
    [209, 134, 22],
    [241, 76, 76],
  ],
  light: [
    [56, 138, 52],
    [191, 136, 3],
    [209, 134, 22],
    [229, 20, 0],
  ],
};

export function colorStep(intensity: number): number {
  const t = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  return Math.round(t * (COLOR_STEPS - 1));
}

export function rgbForStep(step: number, kind: ThemeKind): Rgb {
  const stops = STOPS[kind];
  const t = Math.min(COLOR_STEPS - 1, Math.max(0, step)) / (COLOR_STEPS - 1);
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  return stops[i].map((c, k) => Math.round(c + (stops[i + 1][k] - c) * f)) as Rgb;
}
