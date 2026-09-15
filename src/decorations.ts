import * as vscode from "vscode";
import { Match } from "./chunks";
import { Sidecar } from "./sidecar";
import { ColorBy, intensityFor, makeContext } from "./buckets";
import { colorStep, rgbForStep, ThemeKind } from "./palette";
import { formatDuration, formatShare } from "./format";
import { alignedWidth, annotationText, fontScale, Layout, paddingFor, resolveColumn } from "./layout";
import { rulerAlpha, RulerOpacity } from "./opacity";


export class Decorator {
  private readonly types = new Map<string, vscode.TextEditorDecorationType>();

  apply(editor: vscode.TextEditor, matches: Match[], sidecar: Sidecar, mode: ColorBy, layout: Layout, ruler: RulerOpacity, theme: ThemeKind): void {
    const ctx = makeContext(sidecar.chunks.map((c) => c.elapsed));
    const ranked = [...sidecar.chunks].sort((a, b) => b.elapsed - a.elapsed);
    const column = resolveColumn(
      matches.map((m) => editor.document.lineAt(m.chunk.start).text.length),
      layout.column
    );
    const groups = new Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>();

    for (const match of matches) {
      const elapsed = match.record.elapsed;
      const share = ctx.total > 0 ? elapsed / ctx.total : 0;
      const rank = ranked.indexOf(match.record) + 1;
      const failed = sidecar.status === "error" && sidecar.failed === match.record.label;

      const hover = new vscode.MarkdownString();
      hover.appendMarkdown(`**\`${match.record.label}\`** ${formatDuration(elapsed)}`);
      hover.appendMarkdown(` · ${formatShare(share)} of ${formatDuration(ctx.total)}`);
      hover.appendMarkdown(` · rank ${rank} of ${ranked.length}`);
      if (failed) {
        hover.appendMarkdown("\n\n$(error) This chunk errored during the render.");
      }
      hover.appendMarkdown(`\n\nRecorded ${formatTime(sidecar.time)} by timeknit ${sidecar.timeknit}`);
      hover.supportThemeIcons = true;

      const intensity = intensityFor(elapsed, ctx, mode);
      const type = this.typeFor(colorStep(intensity), rulerAlpha(intensity, ruler), theme);
      const push = (lineNumber: number, text: string) => {
        const target = editor.document.lineAt(lineNumber);
        const end = target.range.end;
        const options: vscode.DecorationOptions = {
          range: new vscode.Range(end, end),
          renderOptions: { after: attachment(text, target.text.length, column, layout) },
          hoverMessage: hover,
        };
        const group = groups.get(type);
        if (group) {
          group.push(options);
        } else {
          groups.set(type, [options]);
        }
      };
      if (layout.showLabel === "stacked") {
        push(match.chunk.start, `[${match.record.label}]`);
        push(Math.min(match.chunk.start + 1, editor.document.lineCount - 1), annotationText(undefined, formatDuration(elapsed), failed));
      } else {
        push(match.chunk.start, annotationText(layout.showLabel === "inline" ? match.record.label : undefined, formatDuration(elapsed), failed));
      }
    }

    for (const type of this.types.values()) {
      editor.setDecorations(type, groups.get(type) ?? []);
    }
  }

  clear(editor: vscode.TextEditor): void {
    for (const type of this.types.values()) {
      editor.setDecorations(type, []);
    }
  }

  dispose(): void {
    for (const type of this.types.values()) {
      type.dispose();
    }
    this.types.clear();
  }

  private typeFor(step: number, alpha: number, theme: ThemeKind): vscode.TextEditorDecorationType {
    const key = `${theme}:${step}:${alpha}`;
    const existing = this.types.get(key);
    if (existing) {
      return existing;
    }
    const [r, g, b] = rgbForStep(step, theme);
    const type = vscode.window.createTextEditorDecorationType({
      after: { color: `rgb(${r}, ${g}, ${b})`, fontStyle: "italic" },
      overviewRulerColor: `rgba(${r}, ${g}, ${b}, ${alpha})`,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    this.types.set(key, type);
    return type;
  }
}

function attachment(text: string, lineLength: number, column: number, layout: Layout): vscode.ThemableDecorationAttachmentRenderOptions {
  const styles = ["none", "white-space: pre"];
  const scale = fontScale(layout.fontSize, layout.editorFontSize);
  if (scale !== undefined) {
    styles.push("display: inline-block", `transform: scale(${scale})`, `transform-origin: ${layout.position === "inline" ? "left" : "right"} center`);
  }
  const textDecoration = styles.join("; ") + ";";
  if (layout.position === "inline") {
    return { contentText: text, textDecoration, margin: "0 0 0 1em" };
  }
  return { contentText: text, textDecoration, margin: `0 0 0 ${paddingFor(lineLength, column, alignedWidth(text))}ch` };
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
