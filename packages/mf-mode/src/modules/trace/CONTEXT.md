# Trace module

The mf-mode-observe trace: one JSON event per line, appended by the lead and
its workers through the observe skill's `emit.sh`. `parseTrace` decodes each
line at the boundary with Schema; a bad line becomes a `Problem`, never a
crash. `buildModel` folds the events into the `RunModel` the report renders:
spans paired by `span`, lanes, worker stats, the paths graph and the headline
numbers. Pure, no IO.

## Rules

- **`KINDS` is the contract with `emit.sh`.** The observe test feeds every
  kind through the script and back through `parseTrace`; add a kind to both.
- **Numbers come from events only.** No clock reads: a run's wall clock is its
  first to last event.

## Does not belong here

- HTML, themes, layout constants — `../report/`
- Files, the browser, the CLI — `src/apps/cli/report-engines.apps.module.ts`
