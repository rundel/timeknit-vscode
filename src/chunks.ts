import { normalizeCode } from "./code";
import type { ChunkRecord } from "./sidecar";

export interface Chunk {
  start: number;
  end: number;
  engine: string;
  label?: string;
  knitrLabel: string;
  code: string;
}

export interface Match {
  chunk: Chunk;
  record: ChunkRecord;
}

const FENCE = /^[\t >]*(`{3,})\s*\{([a-zA-Z0-9_]+)( *[ ,].*)?\}\s*$/;
const FENCE_END = /^[\t >]*`{3,}\s*$/;
// knitr (via xfun::divide_chunk) only treats a line as a chunk option when it
// starts at column 0 with "#| " including the space; anything else is code.
const OPTION_LINE = /^#\| /;
const YAML_LABEL = /^#\| \s*label\s*:\s*["']?([^"'\s]+)/;

export function labelFromHeader(rest: string | undefined): string | undefined {
  if (!rest) {
    return undefined;
  }
  const parts = rest
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    return undefined;
  }
  if (!parts[0].includes("=")) {
    return parts[0];
  }
  for (const part of parts) {
    const m = /^label\s*=\s*["']?([^"']+?)["']?$/.exec(part);
    if (m) {
      return m[1].trim();
    }
  }
  return undefined;
}

export function findChunks(lines: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  let unnamed = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("```") < 0) {
      continue;
    }
    const m = FENCE.exec(lines[i]);
    if (!m) {
      continue;
    }
    let label = labelFromHeader(m[3]);
    const code: string[] = [];
    let inOptions = true;
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (FENCE_END.test(lines[j])) {
        end = j;
        break;
      }
      if (inOptions && OPTION_LINE.test(lines[j])) {
        const y = YAML_LABEL.exec(lines[j]);
        if (y) {
          label = y[1];
        }
        continue;
      }
      inOptions = false;
      code.push(lines[j]);
    }
    if (end < 0) {
      break;
    }
    const knitrLabel = label ?? `unnamed-chunk-${++unnamed}`;
    chunks.push({ start: i, end, engine: m[2], label, knitrLabel, code: normalizeCode(code.join("\n")) });
    i = end;
  }
  return chunks;
}

export function matchRecords(chunks: Chunk[], records: ChunkRecord[]): Match[] {
  const byCode = new Map<string, Chunk[]>();
  for (const chunk of chunks) {
    const list = byCode.get(chunk.code);
    if (list) {
      list.push(chunk);
    } else {
      byCode.set(chunk.code, [chunk]);
    }
  }
  const matches: Match[] = [];
  for (const record of records) {
    const list = byCode.get(record.code);
    if (!list || list.length === 0) {
      continue;
    }
    let index = list.findIndex((c) => c.knitrLabel === record.label);
    if (index < 0) {
      index = 0;
    }
    matches.push({ chunk: list[index], record });
    list.splice(index, 1);
  }
  return matches.sort((a, b) => a.chunk.start - b.chunk.start);
}
