# Memory

## Context

B001 fixes the phase-directory verifier contract: the per-level allowlist, the
directory-aware snapshot, every new finding, and the one legacy warning that
keeps `mf:check:specs` green until D001. Normative input: A003 §1–§3 and the
current `verifySpecTree` in `packages/specs/src/modules/structure/structure.module.ts`.

## Progress

- 2026-10-28: complete. Contract below; no code changed.

## Findings

### 1. Allowlist (normative constants)

| Level | Allowed | Notes |
| --- | --- | --- |
| spec root | `SPEC.md` + directories matching `PHASE_PATTERN` | one phase dir per phase token |
| phase directory | task directories matching `TASK_DIR_PATTERN` | no files, no other directories |
| task directory | `TASK.md`, `MEMORY.md`, `GATES.md` | required: `TASK.md`, `MEMORY.md`; no subdirectories |

`montflow-spec-standard/C001` extends the phase-directory row when `PHASE.md`
lands; no other row changes.

### 2. Snapshot contract

- `SpecFileEntry.kind?: 'file' | 'directory'`; absent reads as `file`.
- A directory entry carries `content: ''`; the verifier never reads it.
- The directory set is **declared directory entries ∪ every parent implied by a
  file path**. The union is required because existing callers (CLI status/next,
  reviews `verifySpecProfiles`, every structure test) build file-only
  snapshots; they must keep verifying. Declared entries are what make an empty
  directory observable.
- Paths stay POSIX-relative to the spec root; no leading slash; no `..`.

### 3. Finding table (normative)

| # | Trigger | `field` | `message` | Severity | Owner |
| --- | --- | --- | --- | --- | --- |
| F1 | task directory at the root | the directory | `Task directory '<dir>' must live inside a phase directory: <phase>/<dir>/.` | **warning**, `fix` = `Move it to <phase>/<dir>/.` | C002; **error** in D003 |
| F2 | directory at the root that is neither a phase nor a task dir | the directory | `Unexpected directory at the spec root.` | error | C002 |
| F3 | file at the root other than `SPEC.md` | the path | task-file placement hint (`TASK.md` → `TASK.md must live inside a task directory: <phase>/A001-<kebab-name>/TASK.md.`), else `Unexpected file at the spec root.` | error | C002 |
| F4 | file directly in a phase directory | `<phase>/<file>` | placement hint, else `Unexpected file in a phase directory; files live in a task directory.` | error | C002 |
| F5 | phase directory with no task directories | the phase | `Phase directory has no task directories.` | error | C002 |
| F6 | directory inside a task directory | the subdirectory | `Unexpected directory inside a task directory.` | error | C002 |
| F7 | task id letters ≠ containing phase dir | the task directory | `Task id '<id>' belongs to phase '<idPhase>', but lives under '<phase>/'.` | error | C002 |
| F8 | path deeper than `<phase>/<task>/<file>` | the path | `Path is deeper than <phase>/<task>/<file>.` | error | C002 |
| F9 | task directory name does not parse | the directory | existing kebab-name / pattern messages | error | unchanged, C002 applies to the leaf |
| F10 | missing `TASK.md` / `MEMORY.md`, unexpected file in a task dir | `<path>` | existing messages | error | unchanged |
| F11 | `locked-phases` entry with no phase directory | `locked-phases` | `Locked phase '<phase>' has no phase directory.` | error | C002 |
| F12 | phase directory with no `review` task | `phase <id>` | existing `Phase has no \`review\` task.` | error | C002, keyed to dirs |

Placement hints keep the form `<FILE> must live inside a task directory: <phase>/<id>-<kebab-name>/<FILE>.`
F1's target phase is `parseTaskDirName(dir).phase`.

### 4. Nesting and severity preservation

- `nest` keeps the current spread: `{ ...found, field: '<path>: <field>' }`, which
  preserves `severity`, `fix`, and `line`.
- The prototype's `issue(path: field, message)` rebuild is a defect; C002 must
  not port it.
- F1 is the only warning. `check --strict` promotes it meanwhile; after D003 no
  layout finding is a warning.

### 5. Unchanged checks (do not touch)

- `SPEC.md` frontmatter and task table (`spec` module).
- Task id/name↔directory agreement and body sections (`task`).
- Duplicate ids, table agreement (name/type/status/gates), dependency existence,
  phase order, cycles (structure, id-keyed).
- `GATES.md` and `MEMORY.md` content.
- `review-link`, `lifecycle`, `phaseOf`, `phaseRank`.

### 6. Tests C002 must add or change

- flat task directory → one warning with the target path and `fix`;
- empty phase directory → F5;
- unexpected directory at root → F2;
- file in a phase directory → F4;
- directory in a task directory → F6;
- phase mismatch → F7;
- four-segment path → F8;
- locked phase without a directory → F11;
- a snapshot that lists its existing directories and the same file-only
  snapshot produce identical findings (an empty directory is only observable
  once declared, so it is excluded from the equivalence);
- every pre-existing case keeps its verdict, with paths prefixed by the phase.

## Open Questions

- None.

## Handoff

- C002 implements F1–F12 and the tests; C001 implements the snapshot contract;
  D003 flips F1 to error and deletes the warning branch.

## Deviations

- None.
