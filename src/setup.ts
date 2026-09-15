import * as path from "path";
import * as vscode from "vscode";
import { candidateRscripts, runFirstAvailable, SITREP_CODE } from "./rscript";

let channel: vscode.OutputChannel | undefined;

export async function checkSetup(): Promise<void> {
  channel ??= vscode.window.createOutputChannel("timeknit");
  const editor = vscode.window.activeTextEditor;
  const cwd = editor && editor.document.uri.scheme === "file"
    ? path.dirname(editor.document.uri.fsPath)
    : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!cwd) {
    void vscode.window.showWarningMessage("timeknit: open a document or folder first, so the check can run R where Quarto would.");
    return;
  }

  const config = vscode.workspace.getConfiguration("timeknit");
  const rConfig = vscode.workspace.getConfiguration("r");
  const platformKey = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
  const candidates = candidateRscripts({
    configured: config.get<string>("rscriptPath", ""),
    positronR: await positronRPath(),
    rExtensionR: rConfig.get<string>(`rpath.${platformKey}`, "") || undefined,
    env: process.env,
    platform: process.platform,
  });

  channel.clear();
  channel.show(true);
  channel.appendLine("timeknit setup check");
  channel.appendLine(`Working directory: ${cwd}`);
  channel.appendLine("(R starts here, as it does when Quarto renders a document in this folder)");
  channel.appendLine("");

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: "timeknit: checking setup" },
    () => runFirstAvailable(candidates, SITREP_CODE, cwd)
  );

  if (!result) {
    channel.appendLine("No Rscript found. Tried:");
    for (const candidate of candidates) {
      channel.appendLine(`  ${candidate}`);
    }
    channel.appendLine("");
    channel.appendLine("Set timeknit.rscriptPath to the Rscript you render with.");
    return;
  }

  channel.appendLine(`Rscript: ${result.rscript}`);
  channel.appendLine("");
  if (result.stderr.trim()) {
    channel.appendLine(result.stderr.trimEnd());
    channel.appendLine("");
  }
  if (result.stdout.trim()) {
    channel.appendLine(result.stdout.trimEnd());
  }
  if (!result.ok && result.error) {
    channel.appendLine("");
    channel.appendLine(`Rscript exited with an error: ${result.error}`);
  }
}

async function positronRPath(): Promise<string | undefined> {
  try {
    // Positron exposes its API as a module named "positron"; in VS Code the require fails and we fall back.
    const positron = require("positron");
    const runtime = await positron?.runtime?.getPreferredRuntime?.("r");
    return typeof runtime?.runtimePath === "string" ? runtime.runtimePath : undefined;
  } catch {
    return undefined;
  }
}
