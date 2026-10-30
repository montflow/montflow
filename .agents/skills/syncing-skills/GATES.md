# GATES

Validation gates for the `mf-skills sync` flow. Run through these after every sync.

## Phase 1: Source & Target

- [ ] Source checkout resolved — a local clone or a registered `montflow` reference (with `mf-references add`)
- [ ] When no checkout existed, the reference was registered through the skill, not cloned by hand
- [ ] Source named explicitly (`--source`) whenever it is not the checkout the CLI runs from
- [ ] Source dependencies installed (`bun install` in the checkout) so `cli sync` can run
- [ ] Target workspace root confirmed with the user before writing (`--target`)
- [ ] Target is project-local (`<root>/.agents/skills/`) — never a machine-wide skill directory

## Phase 2: Sync Correctness

- [ ] `mf-skills sync` ran with real exit codes; a non-zero exit stopped the flow
- [ ] Every public skill exists at `<root>/.agents/skills/<name>/` with `SKILL.md`, plus the directory's other files (`CHANGELOG.md`, `GATES.md`) when the source has them
- [ ] Skills carrying `metadata.internal: true` were skipped — `syncing-skills` never appears at the target
- [ ] Unrelated skills at the target were left untouched
- [ ] Re-running reported `unchanged` for skills already in sync (idempotent)

## Phase 3: Verification

- [ ] `mf-skills sync --target <root> --check` ran after the write
- [ ] `--check` wrote nothing
- [ ] `--check` exited 0; on exit 1 the drift was resolved by re-running the sync

## Phase 4: User Communication

- [ ] Per-skill outcomes reported: `added`, `updated`, `unchanged`, or `skipped`
- [ ] Skipped internal skills called out once
- [ ] User was asked about committing `.agents/skills/` if the target is a git repo
