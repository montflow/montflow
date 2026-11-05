Install or verify the specs payload in 1 minute.

`packages/specs/payload.json` declares every artifact this package ships. `mf-specs doctor` reads that manifest; no hand-written name array exists. The same `@montflow/payload` engine serves every payload package, so the statuses and refusal codes are identical everywhere.

## What ships

| Kind     | Name                    | Installed target                              |
| -------- | ----------------------- | --------------------------------------------- |
| `skill`  | `montflow-create-specs` | `.agents/skills/montflow-create-specs/`       |
| `skill`  | `montflow-find-specs`   | `.agents/skills/montflow-find-specs/`         |
| `prompt` | `spec-create`           | `.agents/@montflow/prompts/spec-create.json`  |
| `prompt` | `spec-execute`          | `.agents/@montflow/prompts/spec-execute.json` |
| `prompt` | `spec-sizing`           | `.agents/@montflow/prompts/spec-sizing.json`  |
| `rigor`  | `trivial`               | `.agents/@montflow/rigors/trivial.md`         |
| `rigor`  | `light`                 | `.agents/@montflow/rigors/light.md`           |
| `rigor`  | `standard`              | `.agents/@montflow/rigors/standard.md`        |
| `rigor`  | `deep`                  | `.agents/@montflow/rigors/deep.md`            |
| `rigor`  | `critical`              | `.agents/@montflow/rigors/critical.md`        |

Other packages own the other kinds: one `profile` per spec role is installed by `mf-profiles doctor`, and model-fallback owns one `prompt`. The manifest is the single source of truth for each package.

## Two modes

```bash
mf-specs doctor --check   # report only: no writes, no directory creation
mf-specs doctor           # repair: install, rewrite, report blocked
```

Report mode statuses are `ok`, `missing`, `stale`, `mismatched`, and `blocked`. Repair mode statuses are `present`, `installed`, `repaired`, and `blocked`. Every `mf-<cli>:check` script uses report mode, so `bun run mf:check` is write-free. `bun run mf:doctor` runs repair for every payload package.

## Ownership

A manifest-owned file is package payload. Edit `packages/specs/`, then reinstall; a local edit is `stale` and repair overwrites it. A file the manifest does not name, inside the same store, is user data: doctor never reads, rewrites, or deletes it. An extra file alone never makes a skill stale.

A payload doctor cannot repair is `blocked` with its own coded fix; one blocked payload never aborts the rest of the run.

## Embedded payload

The payload is embedded in the `mf-specs` binary at build time with `bun run generate:payload`. The package directory wins when present and the embed is the fallback, so a standalone binary can still repair a workspace. `src/modules/doctor/tests/embedded-payload.test.ts` fails when the embed drifts from the package.

## See also

- [Verbs](./verbs.md) — the commands that load the prompts and rigors.
- [Phases](./phases.md) — what the authoring skill and rigor decide.
- [Specs](./specs.md) — the store the payload writes into.
