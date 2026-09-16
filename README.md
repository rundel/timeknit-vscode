# timeknit for Positron and VS Code

Shows how long each knitr chunk took to run, inline in `.qmd` and `.Rmd`
documents, using the timing records written by the
[timeknit](https://github.com/rundel/timeknit) R package.

After a render, every chunk's opening line gets an italic annotation such as
`⏱ 1.2 s`, right-aligned to one column (your first ruler, or column 80) and colored by how much of the document's total time the chunk took.
Hovering shows the share of the total, the chunk's rank, and when the timing
was recorded. "timeknit: Show Chunk Timings" in the command palette lists the
chunks slowest first, with the document total in its title, and jumps to the
one you pick.

## How it works

The R package writes `<project>/.quarto/timeknit/<document>.json` at the end of
each render (the record format is described under
[Timing records for editors](https://github.com/rundel/timeknit#timing-records-for-editors)
in its README). This extension watches for those files in the workspace and
matches each record to the chunk in the open editor with identical code (after
trimming trailing whitespace and the leading `#|` option lines), preferring
the chunk with the same label when several are identical. A chunk you edit
simply loses its timing until the next render, since the number no longer
applies. Matching is a hash lookup and runs at most once per 300 ms of typing,
so it stays out of the way. Nothing runs in the editor and no terminal output
is parsed, so it works for `quarto render`, `quarto preview`,
the Render button, and `rmarkdown::render()` alike.

## Checking the setup

The extension never runs R on its own, so it cannot tell whether the R side is
configured. When nothing shows up after a render, run "timeknit: Check Setup"
from the command palette: it runs `timeknit::sitrep()` in a fresh `Rscript`
started in the active document's directory, exactly where Quarto starts R, and
shows the report in the timeknit Output panel along with the R home, library
paths, and which Rscript was used.

## Requirements

- The [timeknit](https://github.com/rundel/timeknit) R package installed and
  active, with the `timeknit.record` option left at its default of `TRUE`.
  Its [README](https://github.com/rundel/timeknit#setting-up-a-project) covers
  the setup.
- Positron or VS Code 1.90 or later.

## Settings

| Setting             | Default | Effect                                                                                   |
|---------------------|---------|------------------------------------------------------------------------------------------|
| `timeknit.enabled`  | `true`  | Show the annotations                                                                     |
| `timeknit.position` | `column` | `column` right-aligns each annotation so they all end at one column, `inline` puts each right after its fence |
| `timeknit.column`   | `0`     | The column the timings end at in `column` mode; `0` uses your first `editor.rulers` entry, or 80 without rulers |
| `timeknit.showLabel` | `off`   | `inline` shows `[label] ⏱ 1.2 s` on the opening line; `stacked` puts the label on the opening line and the timing on the line below |
| `timeknit.fontSize` | `""`    | CSS length for the annotation text, such as `12px` or `0.85em` (relative to the editor font); empty uses the editor font size. Applied as a visual scale so alignment is unaffected |
| `timeknit.rulerMinOpacity` | `0.3` | Opacity of the scrollbar mark for the fastest chunks |
| `timeknit.rulerMaxOpacity` | `1`   | Opacity of the scrollbar mark for the slowest chunks |
| `timeknit.rscriptPath` | `""` | Rscript used by the setup check; empty tries Positron's R, the R extension's `r.rpath`, `R_HOME`, then the PATH |

The annotations are placed with character-width margins, so they line up when
the editor uses a monospace font. Aligning to the editor's right edge is not
possible: the editor renders each line's text inside an absolutely positioned
box no wider than the text, every CSS positioning scheme available to injected
content resolves against that box, a huge scrolling container, or the whole
window, and the extension API does not expose the editor's visible width.
| `timeknit.colorBy`  | `share` | What the color reflects: `share` of total time (log scale, 0.5% green to 50% red), `rank` among chunks, or absolute `duration` (10 ms green to 10 s red) |

Colors run through a 16-step gradient from green through yellow and orange to
red, using the light or dark variant of VS Code's chart palette to match the
active theme. The scrollbar marks additionally fade with the same intensity,
clamped between `timeknit.rulerMinOpacity` and `timeknit.rulerMaxOpacity`, so
quick chunks stay visible but recede while slow chunks stand out.

## Building and installing

```sh
npm install
npm run compile
npm test
npm run package
```

`npm run package` produces `timeknit-<version>.vsix`. Reload the window after
installing over a previous version.

## Versioning

The extension version tracks the R package version with a numeric suffix:
`0.1.1-1`, `0.1.1-2`, and so on for extension-only changes, resetting to
`-1` when the R package version changes. Semver treats the suffix as a
prerelease tag, so every `0.1.1-N` sorts below a bare `0.1.1` (installing one
over a bare build of the same base version needs `--force`), and the scheme is
for local `.vsix` installs only, since Open VSX and the Marketplace reject
prerelease version strings. Install it with

```sh
positron --install-extension timeknit-0.1.1-13.vsix
```

or `code --install-extension` for VS Code, or through the Extensions view's
"Install from VSIX" action. To develop, open this folder and press F5 to launch
an Extension Development Host.
