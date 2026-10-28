# Sync apps module

`mf-skills sync` — publish a montflow checkout's public skills into a
workspace skill store. The binary and the `/mf-skills sync` slash command share
this engine; neither front end owns a domain rule.

## Belongs here

- `runSync({ from, dir, check, force, invocation })` — copies
  `<from>/.agents/skills/` into `<dir>/.agents/skills/`, returning per-skill
  outcomes and drift as data, and writing the sync manifest
- `isInternalSkill(markdown)` — the public/internal classification, read from
  the nested `metadata.internal` frontmatter key
- `checkoutRoot(path)` / `skillsStoreDir(path, root)` — the default checkout
  and the `<root>/.agents/skills` store layout
- `DEFAULT_SYNC_INVOCATION` — the slash form, used when a caller does not name
  itself

## Rules

- **Outcomes are per skill** — `added`, `updated`, `unchanged`, `skipped`
  (internal), `refused` (diverged without `--force`) — each carrying `name`,
  `source`, `target`, per-file status, and `drift` (`current`/`stale`/
  `diverged`/`unmanaged`) plus differing files and manifest commit.
- **Only bytes that differ are written.** A current skill is never rewritten,
  which is what makes sync idempotent.
- **One skill is all or nothing.** Every changed file is staged as a sibling
  temp first; only when all of them are staged are existing destinations copied
  to sibling backups and the temps renamed over them. A failed stage removes its
  temps and every directory it created (child before parent) and leaves the
  skill byte-identical; a failed backup or rename removes what this run already
  published, restores the backups, and leaves no `.tmp`/`.bak` behind.
- **A destination is never missing.** The backup is a copy, not a rename, so
  every existing destination stays at its path until the atomic rename that
  replaces it. A process death during publish leaves the old bytes in place
  instead of a missing `SKILL.md` and an orphaned `.bak`.
- **Skills are published sequentially.** A mid-run failure names the skills
  already applied before it, so a reader can tell what landed.
- **A target path never escapes the store.** The destination and every existing
  ancestor up to the canonical store root are resolved; a symlinked skill
  directory, file, or subdirectory pointing outside is refused before any
  write.
- **A source store with no skill is a refusal.** Directories without a
  `SKILL.md` are not skills, so filtering happens before "empty" is decided —
  an internal-only store still has `skipped` outcomes and is not empty.
- **Managed skills track the source.** A file the source deleted is pruned from
  a managed skill during a normal sync, so an update cannot stay diverged.
  Unrelated target skills and files outside the managed skill set survive.
- **`check` mode writes nothing.** It computes the same outcomes and drift and
  reports `drifted`; the front end turns that into exit code `1` for stale,
  diverged, or an unmanaged byte difference.
- **Diverged is never overwritten by default.** A local edit refuses the skill
  (`refused`); `--force` replaces it. A refused run does not rewrite the
  manifest.
- **The manifest records what landed.** `syncedAt`, source facts, and per-file
  hashes are written only for a run that actually applied its skills.
- **A corrupt, unreadable, or unsupported manifest fails the run** instead of
  being treated as unmanaged, so local edits are not overwritten blindly.
- **Public means no `metadata.internal: true`.** The nested mapping is parsed
  directly because `Skill.parseSkillFile` flattens indented keys, so a
  top-level `internal` is not the same flag.
- **Refusals are displayable strings.** A missing source store names the
  invocation and `--source <checkout>` so the reader can type the fix.
- Self-contained Effect: provides its own `NodeFileSystem` / `NodePath`; no
  argv, no `process.cwd()`, no console output.

## Does not belong here

- Flag parsing, output, and `--verbose` rendering — `../cli` (B002)
- The `SKILL.md` grammar and file store — `../../modules/skill`,
  `../../modules/skill-store`
- Doctor's packaged-skill install/repair path — `../doctor`
