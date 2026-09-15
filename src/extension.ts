import * as path from "path";
import * as vscode from "vscode";
import { findChunks, matchRecords } from "./chunks";
import { Decorator } from "./decorations";
import { labelMode, Position } from "./layout";
import { formatDuration, formatShare } from "./format";
import { parseSidecar, Sidecar } from "./sidecar";
import { ColorBy } from "./buckets";
import { ThemeKind } from "./palette";

const SIDECAR_GLOB = "**/.quarto/timeknit/**/*.json";
const SIDECAR_SEGMENT = `${path.sep}.quarto${path.sep}timeknit${path.sep}`;

let decorator: Decorator;
let statusBar: vscode.StatusBarItem;
const store = new Map<string, Sidecar>();
const refreshTimers = new Map<string, NodeJS.Timeout>();
const applied = new WeakMap<vscode.TextEditor, string>();
let loadCounter = 0;
const loadIds = new WeakMap<Sidecar, number>();

export function activate(context: vscode.ExtensionContext): void {
  decorator = new Decorator();
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  statusBar.command = "timeknit.showTimings";
  context.subscriptions.push(decorator, statusBar);

  const watcher = vscode.workspace.createFileSystemWatcher(SIDECAR_GLOB);
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate((uri) => void loadSidecar(uri)),
    watcher.onDidChange((uri) => void loadSidecar(uri)),
    watcher.onDidDelete((uri) => forgetSidecar(uri)),
    vscode.window.onDidChangeVisibleTextEditors(() => refreshAll()),
    vscode.window.onDidChangeActiveTextEditor(() => updateStatusBar()),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleRefresh(e.document)),
    vscode.window.onDidChangeActiveColorTheme(() => refreshAll()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("timeknit")) {
        refreshAll();
      }
    }),
    vscode.commands.registerCommand("timeknit.showTimings", showTimings),
    vscode.commands.registerCommand("timeknit.toggle", async () => {
      const config = vscode.workspace.getConfiguration("timeknit");
      await config.update("enabled", !config.get<boolean>("enabled", true), vscode.ConfigurationTarget.Global);
    })
  );

  void vscode.workspace.findFiles(SIDECAR_GLOB, null).then(async (uris) => {
    await Promise.all(uris.map((uri) => loadSidecar(uri, false)));
    refreshAll();
  });
}

export function deactivate(): void {
  store.clear();
}

function keysForSidecar(uri: vscode.Uri, sidecar: Sidecar): string[] {
  const keys = new Set<string>();
  const fsPath = uri.fsPath;
  const idx = fsPath.lastIndexOf(SIDECAR_SEGMENT);
  if (idx >= 0) {
    const root = fsPath.slice(0, idx);
    const relative = fsPath.slice(idx + SIDECAR_SEGMENT.length).replace(/\.json$/, "");
    keys.add(normalizeKey(path.join(root, relative)));
  }
  if (sidecar.file) {
    keys.add(normalizeKey(sidecar.file));
  }
  return [...keys];
}

function normalizeKey(fsPath: string): string {
  const resolved = path.resolve(fsPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function loadSidecar(uri: vscode.Uri, refresh = true): Promise<void> {
  let sidecar: Sidecar | undefined;
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    sidecar = parseSidecar(Buffer.from(bytes).toString("utf8"));
  } catch {
    sidecar = undefined;
  }
  if (!sidecar) {
    return;
  }
  loadIds.set(sidecar, ++loadCounter);
  for (const key of keysForSidecar(uri, sidecar)) {
    store.set(key, sidecar);
  }
  if (refresh) {
    refreshAll();
  }
}

function forgetSidecar(uri: vscode.Uri): void {
  const fsPath = uri.fsPath;
  const idx = fsPath.lastIndexOf(SIDECAR_SEGMENT);
  if (idx < 0) {
    return;
  }
  const relative = fsPath.slice(idx + SIDECAR_SEGMENT.length).replace(/\.json$/, "");
  const key = normalizeKey(path.join(fsPath.slice(0, idx), relative));
  const sidecar = store.get(key);
  store.delete(key);
  if (sidecar?.file) {
    store.delete(normalizeKey(sidecar.file));
  }
  refreshAll();
}

function sidecarFor(document: vscode.TextDocument): Sidecar | undefined {
  if (document.uri.scheme !== "file") {
    return undefined;
  }
  return store.get(normalizeKey(document.uri.fsPath));
}

function refreshAll(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    refreshEditor(editor);
  }
  updateStatusBar();
}

function scheduleRefresh(document: vscode.TextDocument): void {
  if (!sidecarFor(document)) {
    return;
  }
  const key = document.uri.toString();
  const pending = refreshTimers.get(key);
  if (pending) {
    clearTimeout(pending);
  }
  refreshTimers.set(
    key,
    setTimeout(() => {
      refreshTimers.delete(key);
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === document) {
          refreshEditor(editor);
        }
      }
    }, 300)
  );
}

function refreshEditor(editor: vscode.TextEditor): void {
  const config = vscode.workspace.getConfiguration("timeknit");
  const sidecar = sidecarFor(editor.document);
  const enabled = config.get<boolean>("enabled", true);
  const layout = {
    position: config.get<Position>("position", "column"),
    column: config.get<number>("column", 0) || defaultColumn(editor.document),
    fontSize: config.get<string>("fontSize", ""),
    editorFontSize: vscode.workspace.getConfiguration("editor", editor.document).get<number>("fontSize", 12),
    showLabel: labelMode(config.get<unknown>("showLabel", "off")),
  };
  const mode = config.get<ColorBy>("colorBy", "share");
  const ruler = {
    min: config.get<number>("rulerMinOpacity", 0.3),
    max: config.get<number>("rulerMaxOpacity", 1),
  };
  const theme = themeKind();
  const state = sidecar && enabled
    ? `${editor.document.version}|${loadIds.get(sidecar)}|${mode}|${layout.position}|${layout.column}|${layout.fontSize}|${layout.editorFontSize}|${layout.showLabel}|${ruler.min}|${ruler.max}|${theme}`
    : "off";
  if (applied.get(editor) === state) {
    return;
  }
  applied.set(editor, state);
  if (!sidecar || !enabled) {
    decorator.clear(editor);
    return;
  }
  const lines = editor.document.getText().split(/\r?\n/);
  const matches = matchRecords(findChunks(lines), sidecar.chunks);
  decorator.apply(editor, matches, sidecar, mode, layout, ruler, theme);
}

function themeKind(): ThemeKind {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight ? "light" : "dark";
}

function defaultColumn(document: vscode.TextDocument): number {
  const rulers = vscode.workspace.getConfiguration("editor", document).get<Array<number | { column: number }>>("rulers", []);
  for (const ruler of rulers) {
    const column = typeof ruler === "number" ? ruler : ruler?.column;
    if (typeof column === "number" && column > 0) {
      return column;
    }
  }
  return 80;
}

function updateStatusBar(): void {
  const editor = vscode.window.activeTextEditor;
  const sidecar = editor ? sidecarFor(editor.document) : undefined;
  if (!editor || !sidecar) {
    statusBar.hide();
    return;
  }
  statusBar.text = `$(watch) ${formatDuration(sidecar.total)}`;
  statusBar.tooltip = `timeknit: ${sidecar.chunks.length} chunks, ${formatDuration(sidecar.total)} total, recorded ${sidecar.time}${sidecar.status === "error" ? " (render failed)" : ""}`;
  statusBar.show();
}

async function showTimings(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const sidecar = editor ? sidecarFor(editor.document) : undefined;
  if (!editor || !sidecar) {
    void vscode.window.showInformationMessage("timeknit: no timing record for this document yet. Render it with the timeknit R package active.");
    return;
  }
  const lines = editor.document.getText().split(/\r?\n/);
  const matches = matchRecords(findChunks(lines), sidecar.chunks);
  const byRecord = new Map(matches.map((m) => [m.record, m]));
  const items = [...sidecar.chunks]
    .sort((a, b) => b.elapsed - a.elapsed)
    .map((record) => {
      const match = byRecord.get(record);
      const share = sidecar.total > 0 ? record.elapsed / sidecar.total : 0;
      return {
        label: `${formatDuration(record.elapsed)}  [${record.label}]`,
        description: `${formatShare(share)}${match ? `  line ${match.chunk.start + 1}` : "  (chunk edited or removed since the render)"}`,
        match,
      };
    });
  const picked = await vscode.window.showQuickPick(items, {
    title: `timeknit: ${formatDuration(sidecar.total)} across ${sidecar.chunks.length} chunks`,
    placeHolder: "Slowest chunks first",
    matchOnDescription: true,
  });
  if (picked?.match) {
    const line = picked.match.chunk.start;
    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }
}
