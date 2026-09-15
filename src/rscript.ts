import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";

export const SITREP_CODE = [
  'if (requireNamespace("timeknit", quietly = TRUE)) invisible(timeknit::sitrep()) else cat("timeknit is not installed for this R.\\n")',
  'cat("\\nR home: ", R.home(), "\\nLibraries: ", paste(.libPaths(), collapse = "\\n           "), "\\nWorking directory: ", getwd(), "\\n", sep = "")',
].join("; ");

export interface RscriptSources {
  configured?: string;
  positronR?: string;
  rExtensionR?: string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
}

export function candidateRscripts(sources: RscriptSources): string[] {
  const exe = sources.platform === "win32" ? "Rscript.exe" : "Rscript";
  const fromR = (r?: string) => {
    if (!r) {
      return undefined;
    }
    const base = path.basename(r).toLowerCase();
    if (base === "rscript" || base === "rscript.exe") {
      return r;
    }
    return path.join(path.dirname(r), exe);
  };
  const candidates = [
    sources.configured?.trim() || undefined,
    fromR(sources.positronR),
    fromR(sources.rExtensionR),
    sources.env.R_HOME ? path.join(sources.env.R_HOME, "bin", exe) : undefined,
    "Rscript",
    ...(sources.platform === "darwin"
      ? ["/opt/homebrew/bin/Rscript", "/usr/local/bin/Rscript", "/Library/Frameworks/R.framework/Resources/bin/Rscript"]
      : sources.platform === "linux"
        ? ["/usr/bin/Rscript", "/usr/local/bin/Rscript"]
        : []),
  ];
  return [...new Set(candidates.filter((c): c is string => !!c))].filter((c) => c === "Rscript" || !path.isAbsolute(c) || fs.existsSync(c));
}

export interface RscriptResult {
  rscript: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

export function runRscript(rscript: string, code: string, cwd: string): Promise<RscriptResult> {
  return new Promise((resolve) => {
    execFile(
      rscript,
      ["--no-echo", "-e", code],
      { cwd, timeout: 60000, env: { ...process.env, NO_COLOR: "1", R_CLI_NUM_COLORS: "1" }, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          rscript,
          ok: !error,
          stdout: String(stdout),
          stderr: String(stderr),
          error: error ? ((error as NodeJS.ErrnoException).code === "ENOENT" ? "ENOENT" : error.message) : undefined,
        });
      }
    );
  });
}

export async function runFirstAvailable(candidates: string[], code: string, cwd: string): Promise<RscriptResult | undefined> {
  for (const candidate of candidates) {
    const result = await runRscript(candidate, code, cwd);
    if (result.error !== "ENOENT") {
      return result;
    }
  }
  return undefined;
}
