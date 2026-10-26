# Doctor apps module

`mf-specs doctor` — install the spec skills an agent needs to
author and discover specs, plus the shipped `spec-create`, `spec-execute`, and
`spec-sizing` prompts.

## Belongs here

- `runDoctor(root)` — checks `<root>/.agents/skills/<name>` for each name in
  `SPEC_SKILL_NAMES` (`montflow-create-specs`,
  `montflow-find-specs`) and `<root>/.agents/@montflow/prompts/<name>.json`
  for each name in `SPEC_PROMPT_NAMES` (`spec-create`, `spec-execute`,
  `spec-sizing`);
  installs what is missing, rewrites what is stale or partial, and is
  idempotent
- `runDoctorAt(startDir)` — resolves the nearest repo root, then runs `doctor`
- `resolveRepoRoot(startDir)` — nearest ancestor with a `.git` entry
- `promptProblem(name, text)` — decodes a canonical prompt before it is copied,
  so invalid bytes are reported instead of installed
- `DoctorError` / `DoctorCode` — one coded failure (`code`, `path`, `operation`,
  `problem`, preserved `cause`, `fix`) carried on a `blocked` payload
- `SPEC_SKILL_NAMES` / `CREATE_SPEC_SKILL_NAME` / `FIND_SPECS_SKILL_NAME`
  / `SPEC_PROMPT_NAMES` / `installedSkillDir` / `installedPromptDir`
  / `installedPromptFile` / `shippedPromptFile` — single source for the payload
  identities and install paths

## Rules

- Self-contained Effect: provides its own `NodeFileSystem` / `NodePath`, so the
  CLI gains no new layer requirement.
- Install source is the package payload at `<package-root>/skills/` and
  `<package-root>/prompts/`, resolved from this module's location. A readable
  package directory always wins; `embedded-payload.generated.ts` is the fallback
  and the only source in a `--compile`d binary, where the package directory does
  not exist. `bun run generate:payload` (run by `build:cli`) regenerates it, and
  `tests/embedded-payload.test.ts` fails if it drifts from the package.
- One payload's failure never aborts the run. A read, write, create, or
  validation failure becomes that payload's `blocked` outcome with its coded
  `DoctorError`; every other payload is still reported and attempted. Repair
  mode overwrites an unreadable prompt, because the atomic rename needs only
  directory permission.
- Writes are atomic: a sibling temp file, then `rename`. `rename` replaces the
  destination entry itself, so doctor never writes through a symlink. A
  symlinked skill directory is `blocked` in both modes (doctor will not remove a
  link it did not create); a symlinked prompt file is replaced by a regular
  file.
- Skills are compared by the files the package ships, byte for byte. Repair mode
  rewrites only those files, names them in `repaired`, and leaves every other
  file in the directory untouched: extra files alone never make a skill stale,
  so a repair run converges without deleting user data.
- Prompts are decoded and checked (`name` matches the file stem, non-empty
  `description` and `template`) before install. An invalid package prompt is
  `blocked` in both modes — invalid bytes are never installed.
- Doctor owns exactly `SPEC_PROMPT_NAMES`. It never reads, rewrites, or deletes
  `commit.json`, `effect-review.json`, or any other prompt in the same
  directory.
- Check mode writes nothing: it reports `ok` / `missing` / `stale` / `blocked`
  per payload. Repair mode reports `present` (untouched), `installed` (created),
  `repaired` (rewrote), or `blocked` (cannot clear the obstruction). A condition
  repair refuses — symlink, obstruction, invalid package prompt, unreadable
  directory — is `blocked` in check mode too, so the `Run: mf-specs doctor` hint
  only appears when repair can work.

## Does not belong here

- Command parsing/output — `apps/cli`
- Spec verification — `modules/structure` / `modules/lifecycle`
- Authoring or rendering a prompt — `packages/prompts`
