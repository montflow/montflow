# Report module

The run report: one self-contained HTML page from a `RunModel` (`../trace/`).
Inline styles, inline SVG and a few lines of script; nothing loads over the
network. Light and dark follow the system; `#theme=light|dark` overrides it.
`#card` hides everything below the paths diagram, which is the part the PNG
captures. Pure: model in, string out.

## Does not belong here

- Parsing and numbers — `../trace/`
- Writing files and driving the browser — `src/apps/cli/report-engines.apps.module.ts`
