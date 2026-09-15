import { normalizeCode } from "./code";

export interface ChunkRecord {
  label: string;
  start: number | null;
  end: number | null;
  elapsed: number;
  code: string;
}

export interface Sidecar {
  version: number;
  timeknit: string;
  file: string;
  root: string;
  relative: string;
  time: string;
  status: "complete" | "error";
  failed: string | null;
  total: number;
  chunks: ChunkRecord[];
}

export function parseSidecar(text: string): Sidecar | undefined {
  try {
    const json = JSON.parse(text);
    if (!json || typeof json !== "object" || !Array.isArray(json.chunks)) {
      return undefined;
    }
    const chunks: ChunkRecord[] = json.chunks
      .filter((c: unknown) => c && typeof c === "object")
      .map((c: Record<string, unknown>) => ({
        label: String(c.label ?? ""),
        start: typeof c.start === "number" ? c.start : null,
        end: typeof c.end === "number" ? c.end : null,
        elapsed: typeof c.elapsed === "number" ? c.elapsed : NaN,
        code: normalizeCode(typeof c.code === "string" ? c.code : ""),
      }))
      .filter((c: ChunkRecord) => Number.isFinite(c.elapsed));
    return {
      version: typeof json.version === "number" ? json.version : 1,
      timeknit: String(json.timeknit ?? ""),
      file: String(json.file ?? ""),
      root: String(json.root ?? ""),
      relative: String(json.relative ?? ""),
      time: String(json.time ?? ""),
      status: json.status === "error" ? "error" : "complete",
      failed: typeof json.failed === "string" ? json.failed : null,
      total: typeof json.total === "number" ? json.total : chunks.reduce((a, c) => a + c.elapsed, 0),
      chunks,
    };
  } catch {
    return undefined;
  }
}
