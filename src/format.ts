export function formatDuration(secs: number): string {
  if (!Number.isFinite(secs)) {
    return "?";
  }
  const s = signif(secs, 3);
  if (s < 1e-3) {
    return `${trim(s * 1e6)} µs`;
  }
  if (s < 1) {
    return `${trim(s * 1e3)} ms`;
  }
  if (s < 60) {
    return `${trim(s)} s`;
  }
  const mins = Math.floor(s / 60);
  const rem = Math.round(s - mins * 60);
  if (s < 3600) {
    return `${mins}m ${rem}s`;
  }
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins - hours * 60}m ${rem}s`;
}

export function formatShare(share: number): string {
  if (!Number.isFinite(share)) {
    return "?";
  }
  const pct = share * 100;
  if (pct >= 10) {
    return `${Math.round(pct)}%`;
  }
  if (pct >= 1) {
    return `${pct.toFixed(1)}%`;
  }
  return `${pct.toFixed(2)}%`;
}

function signif(x: number, digits: number): number {
  if (x === 0) {
    return 0;
  }
  const power = Math.pow(10, digits - Math.ceil(Math.log10(Math.abs(x))));
  return Math.round(x * power) / power;
}

function trim(x: number): string {
  return Number(x.toPrecision(3)).toString();
}
