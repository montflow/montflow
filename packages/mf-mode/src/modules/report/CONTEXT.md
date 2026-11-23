# Report module

The run report: one self-contained HTML page from a `RunModel` (`../trace/`).
Inline styles, inline SVG and a few lines of script; nothing loads over the
network. Dark only, on screen and in print.
`#card` hides everything below the paths diagram, which is the part the PNG
captures. The paths diagram lays the trace's `Story` out on a grid here: the
playbook and its steps down the first column, each one's workers and outputs to
its right. Pure: model in, string out.

## Does not belong here

- Parsing and numbers — `../trace/`
- Writing files and driving the browser — `src/apps/cli/report-engines.apps.module.ts`
