---
name: mf-mode-report
description: "Render an mf-mode-observe trace into one self-contained HTML report: headline numbers, a timeline with a lane for the lead, each worker and CI, a paths diagram of issues, workers and PRs, per-worker stats, friction, checks, decisions and what is left for the operator. Turned on by /mf-mode --report."
id: 539c2ab2c30be200
author: Daniel Montilla
version: 1.0.0
license: MIT
disable-model-invocation: true
---

# Report

Turn the run's trace into a page the operator reads in a minute. A script does the rendering, so every report has the same shape and its numbers come from the events alone.

## Render

1. Append `run.end` to the trace, per the **mf-mode-observe** skill.
2. Run `bun <this skill>/scripts/report.ts <trace> [--out <file.html>] [--title "<text>"]`. Node 22.18 or later runs it the same way. It prints the path of the HTML file, which lands next to the trace as `<name>.report.html` without `--out`.
3. Exit 1 means there was nothing to render (no file, or no valid event), and exit 2 means bad arguments. The run never waits on the report. Say it failed and why, and give the trace path.
4. Read its Trace health section, which lists skipped lines and spans that never ended. Fix how you append next time. Never edit the trace.
5. If your harness can show you the page, look at it once.
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

The page loads nothing over the network: styles, SVG and the tooltip script are inline. It follows the system theme, and `#theme=dark` or `#theme=light` at the end of the URL overrides it. Printing uses the light theme, so the browser's print dialog saves a PDF.
