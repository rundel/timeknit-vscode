export interface RulerOpacity {
  min: number;
  max: number;
}

const OPACITY_STEPS = 8;

export function rulerAlpha(intensity: number, ruler: RulerOpacity): number {
  const min = clamp01(ruler.min);
  const max = Math.max(min, clamp01(ruler.max));
  const step = Math.round(clamp01(intensity) * (OPACITY_STEPS - 1)) / (OPACITY_STEPS - 1);
  return Number((min + (max - min) * step).toFixed(3));
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}
