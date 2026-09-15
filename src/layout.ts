export type Position = "column" | "inline";

export type LabelMode = "off" | "inline" | "stacked";

export interface Layout {
  position: Position;
  column: number;
  fontSize: string;
  editorFontSize: number;
  showLabel: LabelMode;
}

export function fontScale(fontSize: string, editorFontSize: number): number | undefined {
  const m = /^(\d+(?:\.\d+)?)(px|pt|em|rem|%)$/.exec(fontSize.trim());
  if (!m || !(editorFontSize > 0)) {
    return undefined;
  }
  const value = Number(m[1]);
  const scale =
    m[2] === "px" ? value / editorFontSize
    : m[2] === "pt" ? (value * 4) / 3 / editorFontSize
    : m[2] === "rem" ? (value * 16) / editorFontSize
    : m[2] === "%" ? value / 100
    : value;
  if (!Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 0.01) {
    return undefined;
  }
  return Number(scale.toFixed(3));
}

export function labelMode(value: unknown): LabelMode {
  if (value === true || value === "inline") {
    return "inline";
  }
  return value === "stacked" ? "stacked" : "off";
}

export function resolveColumn(fenceLengths: number[], configured: number): number {
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  return fenceLengths.length > 0 ? Math.max(...fenceLengths) + 2 : 0;
}

export function paddingFor(lineLength: number, column: number, textWidth = 0): number {
  return Math.max(1, column - lineLength - textWidth);
}

export function annotationText(label: string | undefined, duration: string, failed: boolean): string {
  const prefix = label === undefined ? "" : `[${label}] `;
  return `${prefix}⏱ ${duration}${failed ? " ✖" : ""}`;
}

export function alignedWidth(text: string): number {
  return text.replace(/ ✖$/, "").replace(/⏱/g, "xx").length;
}
