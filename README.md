# mf-mode-report example assets

Review assets for the PR that adds `mf-mode-observe` and `mf-mode-report`
(branch `feat/mf-mode-observe-report`). This orphan branch holds only these
files, so no binary lands on `main`.

| File | What it is |
| --- | --- |
| `example.trace.jsonl` | The fixture trace, `packages/mf-mode/skills/mf-mode-observe/references/example.trace.jsonl` |
| `report-example.html` | The report `report.ts` renders from it (open it locally for hover tooltips) |
| `report-example-light.png`, `report-example-dark.png` | Header, timeline and paths, at 2x |
| `report-example-full.png` | The whole page, light theme |
| `report-example.pdf` | The browser's print of the page |

Regenerate from the PR branch:

```bash
bun packages/mf-mode/skills/mf-mode-report/scripts/report.ts \
  packages/mf-mode/skills/mf-mode-observe/references/example.trace.jsonl --out report-example.html
```

The PNGs and the PDF come from headless Chromium (`--screenshot`, `--print-to-pdf`)
on that HTML, with `#theme=dark` for the dark capture.
