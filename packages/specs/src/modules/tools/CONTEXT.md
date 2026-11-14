# Tools module

The `## Tools` section of the workspace `AGENTS.md`: the table of CLI utilities
a reader can run and one line saying what each one answers.

## Belongs here

- `CLI_TOOLS` — the CLIs the section must list, each with its binary name and a
  one-line description. `mf-specs` is the entry this package owns.
- `renderToolsSection(tools?)` — the canonical block: heading, `| CLI | Description |`
  header, separator, one row per tool.
- `verifyAgentsTools(markdown, tools?)` — the static check. Reports a missing
  section (`agents.tools-missing`), a section with no table header
  (`agents.tools-no-table`), a known binary with no row
  (`agents.tools-missing-row`), and a row whose description cell is empty
  (`agents.tools-empty-description`).
- `addToolsSection(markdown, tools?)` — the repair. Inserts the section after
  `## Commands` when it is missing, otherwise replaces it, keeping a row for any
  binary this module does not know.
- `toolsSection(markdown)` — the section's line span, `start` inclusive and
  `end` exclusive.
- `AGENTS_FILE`, `TOOLS_HEADING`, `TOOL_COLUMNS`, `CODES`, `REPAIR_COMMAND`,
  `CHECK_COMMAND` — single source for the file name, heading, columns, finding
  codes, and the commands a finding names.

## Rules

- Pure: text in, text and findings out. No file IO here; the CLI reads and
  writes `AGENTS.md`.
- The heading is exactly `## Tools` — never `### Tools`, never a heading whose
  text merely starts with `Tools`.
- The table is two columns, `CLI` and `Description`, in that order. A row names
  the binary in backticks.
- Repair is idempotent: running it twice leaves the same bytes.
- Repair never deletes an unknown row. A workspace may list its own tool; the
  canonical rows come first, then the preserved rows.
- A finding is an error, not a warning: an unlisted CLI is the reason a reader
  re-derives state from files by hand.

## Does not belong here

- Reading or writing the file — `apps/cli`
- The spec store, phases, tasks, or locks — `modules/structure`, `modules/spec`
- Installing payload artifacts — `modules/doctor`
