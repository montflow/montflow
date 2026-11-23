---
name: mf-mode-report
description: "Render an mf-mode-observe trace with mf-mode report into a self-contained HTML report, a PNG of its summary and a PDF: headline numbers, a timeline with a lane for the lead, each worker and CI, a paths diagram of issues, workers and PRs, per-worker stats, friction, checks, decisions and what is left for the operator. Turned on by /mf-mode --report."
id: 539c2ab2c30be200
author: Daniel Montilla
version: 1.0.0
license: MIT
disable-model-invocation: true
---

# Report

Turn the run's trace into a page the operator reads in a minute, and a picture of it the PR body shows. The CLI does the rendering, so every report has the same shape and its numbers come from the events alone.

## Render

1. Append `run.end` to the trace, per the **mf-mode-observe** skill.
2. Run `mf-mode report <trace>` (the **mf-mode** skill says how to run `mf-mode` when it is not on your PATH). It writes `<name>.report.html` next to the trace, and with a Chromium-family browser also `<name>.report.png` (the summary: headline numbers, timeline, paths) and `<name>.report.pdf` (the whole page). `--out <dir>` moves them, `--title` sets the title, `--theme dark` darkens the PNG, and `--browser <path>` picks the browser.
3. Exit 1 means there was nothing to render. A missing browser is not a failure: the output says `images=skipped` and why, and the HTML is still written. The run never waits on the report.
4. Read the `problem` lines, also listed under Trace health in the page. Fix how you append next time. Never edit the trace.
5. When the run opened a PR, the report goes in last, so it covers the PR and its CI. Run `mf-mode pr attach <png> <pdf>`, paste the lines it prints under `## Proof` in the body file, run `mf-mode pr check` on it, then `gh pr edit <number> --body-file <file>`.
6. Reply with the report path, the trace path and the headline numbers.

## What it shows

| Section | Built from |
| --- | --- |
| Headline numbers | Wall clock from the first event to the last. Workers, the most at once, and busy time against one-after-another time. Lead round-trips from `run.end`, else the sum over the lead's `phase.end` events. Checks, friction (seconds and wasted calls), PRs and operator items. |
| Timeline | A lane for the lead, each worker, any other actor, and CI. Bars are phase, worker and CI spans. Marks are checks, friction with a strip for the time lost, and decisions. A vertical line marks each PR's first mention. |
| Paths | Issues, workers and PRs. A worker's start refs point into it and its end refs out of it. Each `link` event adds an edge labeled with its summary. Without any refs, the lead's phases in order. |
| Workers | Per worker: task, model, wall clock, round-trips, checks passed and failed, friction, result and outputs. |
| Friction, Checks, Decisions, Left for the operator, Phases | One row per event or span. |
| Event log | Every event, folded. |

The page loads nothing over the network: styles, SVG and the tooltip script are inline. It follows the system theme, and `#theme=dark` or `#theme=light` at the end of the URL overrides it. `#card` shows the summary alone, which is what the PNG captures. Printing uses the light theme.
