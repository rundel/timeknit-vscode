export type ColorBy = "share" | "rank" | "duration";

export interface IntensityContext {
  total: number;
  sortedDesc: number[];
}

export function makeContext(elapsed: number[]): IntensityContext {
  const sortedDesc = [...elapsed].sort((a, b) => b - a);
  return { total: elapsed.reduce((a, b) => a + b, 0), sortedDesc };
}

export function intensityFor(elapsed: number, ctx: IntensityContext, mode: ColorBy): number {
  switch (mode) {
    case "duration":
      return logScale(elapsed, 0.01, 10);
    case "rank": {
      const n = ctx.sortedDesc.length;
      if (n <= 1) {
        return 1;
      }
      return 1 - ctx.sortedDesc.indexOf(elapsed) / (n - 1);
    }
    case "share":
    default:
      return ctx.total > 0 ? logScale(elapsed / ctx.total, 0.005, 0.5) : 0;
  }
}

function logScale(value: number, low: number, high: number): number {
  if (!(value > 0)) {
    return 0;
  }
  const t = (Math.log10(value) - Math.log10(low)) / (Math.log10(high) - Math.log10(low));
  return Math.min(1, Math.max(0, t));
}
