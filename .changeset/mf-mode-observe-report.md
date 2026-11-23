---
"@montflow/mode": minor
---

Run reports and a PR body standard. `/mf-mode --observe` appends the run's phases, workers, CI, checks, friction and decisions to a JSONL trace (mf-mode-observe). `mf-mode report` renders the trace into a self-contained HTML report, a PNG of its summary and a PDF (mf-mode-report, `/mf-mode --report`). `mf-mode pr template` prints the PR body standard, `mf-mode pr check` holds a body to it before publishing, and `mf-mode pr attach` hosts screenshots and report files for the body's Proof section.
