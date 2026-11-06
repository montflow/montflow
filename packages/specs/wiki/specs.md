Find any spec on disk and say what state it is in, in 30 seconds.

A spec is one planned piece of work: `SPEC.md` plus one directory per [phase](./phases.md). The store lives at `.agents/@montflow/specs/<name>/`. Every task lives inside a phase, so a phase is never just the leading letters of a task id.

## Store layout

```text
.agents/@montflow/specs/
  sizing.json                  # optional repo-wide dispatch config
  <name>/
    SPEC.md
    sizing.json                # optional spec/phase dispatch config
    A/                         # phase directory
    B/
```

The spec root holds only `SPEC.md`, optional `sizing.json`, and phase directories. A task directory at the root is an error; run `mf-specs migrate` to move it under its phase.

## `SPEC.md`

Frontmatter: `name`, `status`, `workspace-type`, `author`, `created`, and `spec-version`. The body holds `## Description`, `## Requirements`, and the `## Tasks` table `| ID | Name | Type | Status | Gates |`.

There is no lock field. A lock is derived from the [phase](./phases.md) records, and `mf-specs lock` only confirms it.

## Lifecycle

| State          | Meaning                                            |
| -------------- | -------------------------------------------------- |
| `pending`      | idle; no task has started                          |
| `in-progress`  | at least one task started                          |
| `blocked`      | work is blocked and needs a decision or dependency |
| `complete`     | every task is complete, including review           |
| `inconsistent` | the record contradicts itself; repair the records  |

`mf-specs status` adds the per-phase review decision, gate proof, and derived lock. `mf-specs state` is the compact form. `mf-specs list` filters the store by state.

## Versions: v2 and the frozen v1 rule

`spec-version: 2` is current. A spec with no `spec-version` reads as **v1**: the phase tree without `PHASE.md`. V1 is accepted with one `spec.version-outdated` warning and exits 0. No surface infers v2 from file presence, and no surface requires `PHASE.md` at v1.

A `status: complete` spec is **frozen** at its current version. `mf-specs migrate --all` skips it, and no later edit touches its prose, tree, status, or gates. Upgrade one deliberately with `mf-specs migrate --name <spec> --include-complete`; after that it is v2 and normal rules apply. Relabeling v2 without the phase tree fails `spec.version-untransformed`.

## Read a spec

```bash
mf-specs status --name ship-login
mf-specs state --name ship-login
mf-specs next --name ship-login
```

`status` is the panel, `state` is the one-line derived state, and `next` is the ready set for the active phase. All three read the same verifier; a dispatchable target is never printed for an invalid record.

## See also

- [Phases](./phases.md) — the directory, record, review, and lock rules.
- [Verbs](./verbs.md) — the generator that writes each field.
- [Payload](./payload.md) — install the shipped skills and prompts.
