# @montflow/workspace

Fullscreen OpenTUI Solid workspace dashboard. One screen, a configurable
grid of panels — small info over skills and prompts down the wider
left rail, tall runs over features and profiles on the right side. Letter keys
select a panel
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
  catalogue, requirements gate over installed skills). Agentic create and
  modify dispatch an in-process `@montflow/pi-runs` run — both keybinds
  gate on the runs extension first. A create run's row is reachable with
  `g`; a modify run's detail opens directly. On settle the run's edit is
  re-encoded, the list refreshes, and a no-op or unusable file toasts
  instead. A missing skills dir offers `i` to install every montflow skill
  into pi project-local via the skills CLI.
- Profiles lists `.agents/@montflow/profiles/` with the same `/`
  filter, `j/k` move, enter for details, esc back, `c` create treatment
  as skills. The detail offers `v` view, `d` delete, `m` modify. Create
  and modify run the shared `@montflow/pi-profiles` flows — manual or
  agentic (filterable model picker from the pi catalogue, requirements
  gate over installed skills). Agentic create and modify dispatch an
  in-process `@montflow/pi-runs` run; the modify run's detail opens
  directly. A missing store dir offers `⏎` to seed it. The runtime loads
  lazily via dynamic `import()` — never at boot.
- Prompts lists `.agents/@montflow/pi-prompts/` with the same panel
  treatment. The detail offers `v` view, `d` delete, `m` modify. Create
  and modify run the shared `@montflow/pi-prompts` flows — manual or
  agentic (filterable model picker from the pi catalogue). Agentic modify
  dispatches an in-process `@montflow/pi-runs` run — the `m` keybind
  gates on the runs extension first — and that run's detail opens
  directly; on settle the run's edit is re-encoded, the list refreshes,
  and a no-op or invalid file toasts instead. Agentic create still runs
  headless `pi -p` behind the working overlay. A missing store dir offers
  `⏎` to seed it.
- Runs lists `.agents/@montflow/runs/` with the same `/`
  filter, `j/k` move, enter for details, esc back, `c` create treatment
  as skills. Create asks for a name, an initial prompt, and a model
  (filterable picker from the pi catalogue), then dispatches the
  in-process `@montflow/pi-runs` engine on the run. The detail splits
  in two columns: a left sidebar with the status badge, the agent's
  progress line, the model/feature/thinking/tools/timestamps/id
  metadata, the receipt, and the action menu; and a right column
  stacked as two panels — the initial prompt on top (sized to its text,
  capped, ellipsized past the cap) and the transcript below, rendered as
  markdown through the shared body (same styling as the profile
  detail) — a short window in preview mode, the whole panel in full
  view (`v`). The detail opens focused on the metadata column and at
  the top of the transcript, like the list it came from; `d`/`p`/`t`
  jump to a pane and `tab` cycles, the focused pane taking the accent
  border. `j`/`k` (and the arrows) scroll only the focused pane, and the
  menu keys only act when the metadata column holds focus — so the
  transcript never moves while you read the prompt. The prompt pane
  shows whole lines only, sized to its text and clipped to its own
  rows, so neither pane can overflow. On a short terminal the prompt pane
  is dropped (the prompt is the run's first transcript event). The
  transcript is refreshed live while the run is running or parked, and follows its
  tail only once you have scrolled into it. `s` steer a running run, `x`
  interrupt a live run, `a` answer a parked one, `R` reload. A missing
  store dir offers `⏎` to seed it.
- Features lists `.agents/@montflow/features/` — one row per feature
  with its derived lifecycle state (`pending`, `in-progress`, `blocked`,
  `complete`, `inconsistent`). `/` filters, `j/k` move,
  enter opens the detail, esc back, `c` begins a new feature, `R`
  refetches. `c` asks for a feature description and a model, then
  dispatches a `@montflow/pi-runs` author run that writes the spec; the
  run may park on `ask_user` (answer it from the run's detail with `a`),
  and `g` jumps to the dispatched run. The detail shows the header meta,
  verification issues, and every phase with its tasks and per-task
  statuses — `v` full view with `j`/`k` scroll. Verification and state
  come from `@montflow/pi-features`; `in-progress` vs `pending` comes
  from live runs bound to the feature.

Without the `pi` CLI on PATH the dashboard never reaches the grid —
startup renders a full-screen install pointer instead.

## Status

Shell (`0.0.1`, private). Tooling matches the rest of the monorepo:
`turbo` `ts:check` / `lint:check` / `format:check`.
