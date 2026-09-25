# Memory

## Context

Task A003: plan the extension + CLI surfaces over one engine.

## Progress

- 2026-09-21: complete.

## Findings

Reference packages:

- `@montflow/pi-profiles`: `src/extension.ts` default export,
  `src/apps/{interactive,cli}/`, package `pi.extensions: ["./src/extension.ts"]`,
  and `.pi/settings.json` package registration.
- `@montflow/pi-features`: `bin.mf-features` → `src/apps/cli/main.ts`, Effect CLI,
  same `pi.extensions` field.

`@montflow/pi-runs` today has **none** of this: no `extension.ts`, no `pi` field,
no `bin`, no `apps/`.

## Proposed layout

```text
packages/pi-runs/src/
  modules/            # schemas (run, run-event, receipt)
  services/
    store/            # persistence (existing)
    runner/           # NEW shared engine over AgentSession
  apps/
    cli/              # NEW `mf-runs` CLI (bin)
  extension.ts        # NEW Pi extension entry
```

- Shared engine is the only place that talks to `AgentSession`/`Store`.
- Extension registers commands + agent custom tools (`start`, `status`, `steer`,
  `answer`) and binds a `uiContext`.
- CLI exposes the same verbs non-interactively (always local).
- Workspace imports the package `.` export as a dependency.

## Manifest additions

- `package.json`: `"pi": { "extensions": ["./src/extension.ts"] }`,
  `"bin": { "mf-runs": "./src/apps/cli/main.ts" }`, keep `.` export, add
  `./extension`.
- `.pi/settings.json`: add `"../packages/pi-runs"`.
- Workspace detect: parse `pi list` for `pi-runs` (same pattern as
  `Profiles.parseListOutput`).

## Open Questions

- CLI framework: `effect/unstable/cli` (pi-features) vs hand-rolled (pi-profiles).
  Lean `effect/unstable/cli` for consistency with the newer package.

## Handoff

- A004: lock the surface list + manifest additions.
- C001/C002: implement extension + CLI.

## Deviations

- None.
