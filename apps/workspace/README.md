# @montflow/workspace

Fullscreen OpenTUI Solid workspace dashboard. One screen, a configurable
grid of panels — small info over skills and prompts down the wider
left rail, tall runs over profiles on the right side. Letter keys select a panel
(`[i] Info` titles show the binding), `q` quits.

```bash
bun run workspace
```

Run from anywhere in the repo (the script pins CWD to the app so the Solid
preload loads). Or run the TUI side by side with Pi in a second pane. Git
is read live from the working directory. All logic lives in this app under
`src/` (`modules/`, `services/`, `components/`); sibling `pi-*` packages
get consumed directly as panes gain data sources.

The `start`/`dev` scripts pass `--conditions=browser`: under plain Bun,
`solid-js/web` resolves to its SSR build (`isServer: true`), which
freezes every TanStack Query list after its boot load (one-shot fetch,
no live subscription). The browser condition selects the client build
so installs, creates, and agent runs update the panels live. Never drop
the flag without re-testing the install→list flip.

## Layout

The grid comes from `.agents/@montflow/dashboard/layout.json` in the
working directory (columns of `{ panel, keybind, height }` cells with a
`width` share each), falling back to the built-in default when the file
is missing or malformed. Edit the file and restart to re-layout —
unknown panel ids render as placeholders under their own id.

## Panels

- Info reads git live for the working directory.
- Skills lists `.agents/skills/` with `/` filter, `j/k` move, enter for
  details, esc back, `c` create. The detail offers `v` view, `d` delete,
  `m` modify. Create and modify run the shared `@montflow/pi-skills`
  flows — manual or agentic (filterable model picker from the pi
  catalogue, working overlay while headless `pi -p` runs). A missing
  skills dir offers `i` to install every montflow skill into pi
  project-local via the skills CLI.
- Profiles lists `.agents/@montflow/pi-profiles/` with the same `/`
  filter, `j/k` move, enter for details, esc back, `c` create treatment
  as skills. The detail offers `v` view, `d` delete, `m` modify. Create
  and modify run the shared `@montflow/pi-profiles` flows — manual or
  agentic (filterable model picker from the pi catalogue, working
  overlay while headless `pi -p` runs, requirements gate over installed
  skills). A missing store dir offers `⏎` to seed it. The runtime loads
  lazily via dynamic `import()` — never at boot.
- Runs lists `.agents/@montflow/pi-runs/runs/` with the same `/`
  filter, `j/k` move, enter for details, esc back, `c` create treatment
  as skills. Create asks for a name, an initial prompt, and a model
  (filterable picker from the pi catalogue), then launches a headless
  `pi -p` agent on the run. The detail shows the transcript plus the
  settlement receipt — `v` full view with `j`/`k` scroll, `x` interrupt
  a live run, `a` answer a parked one, `R` reload. A missing store dir
  offers `⏎` to seed it.

Without the `pi` CLI on PATH the dashboard never reaches the grid —
startup renders a full-screen install pointer instead.

## Status

Shell (`0.0.1`, private). Tooling matches the rest of the monorepo:
`turbo` `ts:check` / `lint:check` / `format:check`.
