import assert from "node:assert/strict";
import { test } from "node:test";
import { findChunks, labelFromHeader, matchRecords } from "../chunks";
import { normalizeCode } from "../code";
import { formatDuration, formatShare } from "../format";
import { intensityFor, makeContext } from "../buckets";
import { colorStep, COLOR_STEPS, rgbForStep } from "../palette";
import { parseSidecar } from "../sidecar";
import { alignedWidth, annotationText, fontScale, labelMode, paddingFor, resolveColumn } from "../layout";
import { rulerAlpha } from "../opacity";

const doc = [
  "---",
  "title: probe",
  "---",
  "",
  "Intro text.",
  "",
  "```{r setup}",
  "x = 1",
  "```",
  "",
  "More text",
  "",
  "```{r}",
  "#| label: model",
  "#| echo: false",
  "y = 2",
  "```",
  "",
  "```{r}",
  "z = 3",
  "```",
  "",
  "```{r, label=\"quoted\", echo=FALSE}",
  "w = 4   ",
  "",
  "```",
  "",
  "```{python}",
  "print(1)",
  "```",
  "",
  "```{r}",
  "z = 3",
  "```",
];

const record = (label: string, code: string, elapsed = 0.1) => ({ label, start: null, end: null, elapsed, code: normalizeCode(code) });

test("findChunks parses fences, labels, and normalized code without option lines", () => {
  const chunks = findChunks(doc);
  assert.deepEqual(
    chunks.map((c) => [c.start, c.end, c.engine, c.knitrLabel, c.code]),
    [
      [6, 8, "r", "setup", "x = 1"],
      [12, 16, "r", "model", "y = 2"],
      [18, 20, "r", "unnamed-chunk-1", "z = 3"],
      [22, 25, "r", "quoted", "w = 4"],
      [27, 29, "python", "unnamed-chunk-2", "print(1)"],
      [31, 33, "r", "unnamed-chunk-3", "z = 3"],
    ]
  );
  assert.equal(chunks[2].label, undefined);
});

test("labelFromHeader handles positional and option labels", () => {
  assert.equal(labelFromHeader(" setup"), "setup");
  assert.equal(labelFromHeader(" setup, echo=FALSE"), "setup");
  assert.equal(labelFromHeader(", label = 'x y'"), "x y");
  assert.equal(labelFromHeader(", echo=FALSE"), undefined);
  assert.equal(labelFromHeader(undefined), undefined);
});

test("matchRecords requires identical code and prefers the same label among duplicates", () => {
  const chunks = findChunks(doc);
  const matches = matchRecords(chunks, [
    record("setup", "x = 1"),
    record("model", "y = 2 + 1"),
    record("unnamed-chunk-3", "z = 3"),
    record("renamed", "w = 4"),
    record("unnamed-chunk-1", "z = 3"),
    record("gone", "nothing"),
  ]);
  assert.deepEqual(
    matches.map((m) => [m.record.label, m.chunk.knitrLabel, m.chunk.start]),
    [
      ["setup", "setup", 6],
      ["unnamed-chunk-1", "unnamed-chunk-1", 18],
      ["renamed", "quoted", 22],
      ["unnamed-chunk-3", "unnamed-chunk-3", 31],
    ]
  );
});

test("normalizeCode ignores trailing whitespace and blank lines", () => {
  assert.equal(normalizeCode("a  \r\nb\n\n"), "a\nb");
});

test("formatDuration mirrors the R package", () => {
  assert.equal(formatDuration(1.23456e-5), "12.3 µs");
  assert.equal(formatDuration(0.0456), "45.6 ms");
  assert.equal(formatDuration(0.9996), "1 s");
  assert.equal(formatDuration(1.234), "1.23 s");
  assert.equal(formatDuration(75), "1m 15s");
  assert.equal(formatDuration(4000), "1h 6m 40s");
  assert.equal(formatShare(0.4567), "46%");
  assert.equal(formatShare(0.0456), "4.6%");
  assert.equal(formatShare(0.0012), "0.12%");
});

test("the palette interpolates between the theme stops in 16 steps", () => {
  assert.equal(colorStep(0), 0);
  assert.equal(colorStep(1), COLOR_STEPS - 1);
  assert.equal(colorStep(0.5), 8);
  assert.equal(colorStep(NaN), 0);
  assert.deepEqual(rgbForStep(0, "dark"), [137, 209, 133]);
  assert.deepEqual(rgbForStep(COLOR_STEPS - 1, "dark"), [241, 76, 76]);
  assert.deepEqual(rgbForStep(0, "light"), [56, 138, 52]);
  assert.deepEqual(rgbForStep(COLOR_STEPS - 1, "light"), [229, 20, 0]);
  assert.deepEqual(rgbForStep(5, "dark"), [204, 167, 0]);
  const mid = rgbForStep(8, "light");
  assert.ok(mid[0] > 191 && mid[0] < 209 && mid[2] > 3 && mid[2] < 22);
});

test("parseSidecar normalizes code, tolerates missing fields, and rejects garbage", () => {
  const sidecar = parseSidecar('{"file":"/a/b.qmd","status":"error","failed":"boom","chunks":[{"label":"boom","elapsed":0.2,"start":3,"end":5,"code":"stop()  \\n"}]}')!;
  assert.ok(sidecar);
  assert.equal(sidecar.total, 0.2);
  assert.equal(sidecar.failed, "boom");
  assert.equal(sidecar.chunks[0].code, "stop()");
  assert.equal(parseSidecar("not json"), undefined);
  assert.equal(parseSidecar('{"chunks": "nope"}'), undefined);
});

test("column layout right-aligns the annotation at the column", () => {
  assert.equal(resolveColumn([12, 20, 15], 0), 22);
  assert.equal(resolveColumn([12, 20, 15], 60), 60);
  assert.equal(resolveColumn([], 0), 0);
  assert.equal(paddingFor(12, 22), 10);
  assert.equal(paddingFor(30, 22), 1);
  assert.equal(paddingFor(12, 80, 8), 60);
  assert.equal(paddingFor(70, 80, 20), 1);
  assert.equal(alignedWidth("⏱ 1.2 s ✖"), 8);
});

test("parsing and matching a large document stays fast", () => {
  const lines: string[] = [];
  const records = [];
  for (let i = 0; i < 300; i++) {
    lines.push(`## Section ${i}`, "", "Some prose that goes on for a while and mentions nothing in particular.", "");
    const code = [`x${i} = rnorm(100)`, `mean(x${i})`, `plot(x${i}, main = "chunk ${i}")`];
    lines.push(i % 3 === 0 ? `\`\`\`{r chunk-${i}}` : "```{r}", "#| echo: false", ...code, "```", "");
    records.push(record(i % 3 === 0 ? `chunk-${i}` : `unnamed-chunk-${i}`, code.join("\n"), Math.random()));
  }
  const started = performance.now();
  let matched = 0;
  for (let rep = 0; rep < 50; rep++) {
    matched = matchRecords(findChunks(lines), records).length;
  }
  const perRefresh = (performance.now() - started) / 50;
  assert.equal(matched, 300);
  console.log(`      ${lines.length} lines, 300 chunks: ${perRefresh.toFixed(2)} ms per refresh`);
  assert.ok(perRefresh < 50, `refresh took ${perRefresh} ms`);
});

test("ruler intensity is log-scaled and clamped", () => {
  const ctx = makeContext([5, 3, 1, 0.5, 0.25, 0.15, 0.05, 0.02, 0.01, 0.005]);
  assert.equal(intensityFor(5, ctx, "share"), 1);
  assert.equal(intensityFor(0.01, ctx, "share"), 0);
  assert.ok(intensityFor(0.5, ctx, "share") > 0.3 && intensityFor(0.5, ctx, "share") < 0.8);
  assert.equal(intensityFor(5, ctx, "rank"), 1);
  assert.equal(intensityFor(0.005, ctx, "rank"), 0);
  assert.equal(intensityFor(10, ctx, "duration"), 1);
  assert.equal(intensityFor(0.001, ctx, "duration"), 0);
  assert.equal(intensityFor(0.1, ctx, "duration"), 1 / 3);
});

test("ruler alpha steps between the clamped bounds", () => {
  assert.equal(rulerAlpha(0, { min: 0.3, max: 1 }), 0.3);
  assert.equal(rulerAlpha(1, { min: 0.3, max: 1 }), 1);
  assert.equal(rulerAlpha(0.5, { min: 0.3, max: 1 }), 0.7);
  assert.equal(rulerAlpha(0.5, { min: 0.9, max: 0.2 }), 0.9);
  assert.equal(rulerAlpha(2, { min: NaN, max: 1 }), 1);
});

test("annotation text optionally carries the label", () => {
  assert.equal(annotationText(undefined, "1.2 s", false), "⏱ 1.2 s");
  assert.equal(annotationText("setup", "1.2 s", true), "[setup] ⏱ 1.2 s ✖");
  assert.equal(annotationText("setup", "12.3 ms", false), "[setup] ⏱ 12.3 ms");
});

test("label mode accepts the old boolean setting", () => {
  assert.equal(labelMode(true), "inline");
  assert.equal(labelMode(false), "off");
  assert.equal(labelMode("stacked"), "stacked");
  assert.equal(labelMode("nonsense"), "off");
});

test("font size becomes a visual scale relative to the editor font", () => {
  assert.equal(fontScale("", 12), undefined);
  assert.equal(fontScale("12px", 12), undefined);
  assert.equal(fontScale("15px", 12), 1.25);
  assert.equal(fontScale("0.85em", 12), 0.85);
  assert.equal(fontScale("90%", 12), 0.9);
  assert.equal(fontScale("9pt", 12), undefined);
  assert.equal(fontScale("12pt", 12), 1.333);
  assert.equal(fontScale("bogus", 12), undefined);
  assert.equal(fontScale("15px", 0), undefined);
});
