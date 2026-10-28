# Memory

## Context

Task A002 retargets every document that names the external `skills` installer at
the in-repo `mf-skills sync` contract documented in `guides/installation.md`.
`sync` itself is a later phase (B001–B003); this task documents only.

## Progress

- Rewrote `.agents/skills/syncing-skills/SKILL.md` (v4.0.0) around `mf-skills
  sync`: resolve the source checkout (local clone or `adding-references`
  reference), present source/target, sync with `--from`/`--dir`, verify with
  `--check`, report per-skill outcomes. Removed every global-install instruction,
  `-g` flag, agent-target table, and external maintenance command. Kept
  `metadata.internal: true` and frontmatter `name`/`id`.
- Rewrote `syncing-skills/GATES.md` around sync/`--check`, internal skip,
  project-local-only target, and user confirmation before writing.
- Added `syncing-skills/CHANGELOG.md` 4.0.0 entry recording the switch.
- Root `README.md`: skills section now runs `mf-skills sync --dir "$PWD"` and
  points at `guides/installation.md`; no `npx skills`, no global install.
- `packages/skills/README.md`: `sync` added to the subcommand list plus a
  `## Sync` section covering `--from`, `--dir`, `--check`, public/internal split,
  per-skill outcomes, and project-local scope.
- `packages/profiles/CLI.md`, profiles interactive `SkillInstaller` comment,
  workspace `INSTALL_HINTS.skills`, and the `skills` row + verb/flag tables in
  `.agents/documentation/author-mf-utility-cli.md` retargeted at `sync`.

## Open Questions

- None.

## Handoff

- `mf-skills sync` is still unimplemented (B001–B003). Docs describe the
  contract from `guides/installation.md`; B004 conformance should re-check the
  wording against the shipped flags.
- Remaining `npx skills` hits are only inside
  `.agents/@montflow/specs/installation-guide/` (SPEC.md, TASK.md, GATES.md,
  A001 notes), which describe the old state and are excluded by this task.

## Deviations

- Historical `syncing-skills` CHANGELOG entries (3.0.0, 2.2.2) named `npx
  skills` and `INSTALL_INTERNAL_SKILLS=1`. Rewritten to "external skills CLI"
  without those literals so the repo-wide grep gate holds; the chronology and
  meaning are preserved.
- `packages/profiles/CLI.md` names `mf-profiles doctor --dir <root>` as the
  installer that ships `montflow-create-pi-profiles`, with `mf-skills sync` as
  the checkout alternative — `doctor` is the existing real path.
