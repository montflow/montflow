Run the right spec command the first time — binary, slash, host tool, or TUI.

Every surface delegates to the same engine, so output, codes, and exit truth do not drift. The binary is `mf-specs`; inside the OpenCode host the command is `/specs`; the TUI picker reads the same `status` engine.

## Readers

| Command                                        | Answers                                        |
| ---------------------------------------------- | ---------------------------------------------- |
| `check [--name <spec>] [--strict] [--verbose]` | does the store verify?                         |
| `status --name <spec>`                         | lifecycle, per-phase review/gate/lock, verdict |
| `state --name <spec>`                          | compact derived state and active phase         |
| `next --name <spec>`                           | the ready set for the active phase             |
| `list [--pending\|--status <states>]`          | which specs exist, by derived state            |
| `resolve --name <spec> --task <id>`            | the task's dispatch target or `inherit`        |
| `sizing --name <spec> --task <id> [--human]`   | size, target, provenance, budgets              |
| `models [--catalog <path>] [--verify]`         | the host catalogue and config findings         |
| `which [--branch <name>]`                      | the one spec the branch names                  |

## Generators

| Command                                                | Writes                                      |
| ------------------------------------------------------ | ------------------------------------------- |
| `init --name <spec> --rigor <rigor>`                   | a whole v2 tree from a validated rigor plan |
| `create --name <spec>`                                 | the rigor-agnostic scaffold                 |
| `new-phase --name <spec> --objective <line>`           | the next `PHASE.md` and phase memory        |
| `new-task --name <spec> --phase <id> ...`              | the next `TASK.md` and `SPEC.md` row        |
| `stamp [--format instant\|date]`                       | one UTC timestamp, printed                  |
| `claim --name <spec> --task <id>`                      | the session binding for a task              |
| `waiver --name <spec> --phase <id> ...`                | the phase review decision and evidence      |
| `gate run --name <spec> --phase <id>`                  | `GATE-RESULTS.jsonl`                        |
| `gate record ... --judge <slug> --verdict pass\|fail`  | one subjective verdict                      |
| `mail --name <spec> --to <task-id\|all> --text <text>` | a board or mailbox entry                    |
| `migrate [--name <spec>\|--all] [--include-complete]`  | the v2 phase tree and `spec-version`        |
| `review decide --name <spec> --phase <id>`             | nothing; it only decides                    |
| `lock --name <spec> --phase <id>`                      | nothing; it only confirms                   |

`lock` is a confirmation verb, not a lock list. It writes no file and owns no status row. `review decide` is read-only and prints `decision`, `rounds`, `open`, `reason`, and the per-series breakdown.

## `claim` authority

The orchestrator holds the spec binding and is the only caller of `claim --start`, `claim --block --reason`, `claim --close`, the resetting `claim --release`, `gate run`, `gate record`, and `mail`. A worker may bind its own task and release only its own binding; neither changes a status. A refusal is `claim.not-orchestrator`, `gate.not-orchestrator`, or `mail.not-orchestrator`.

A transition writes the task status, the `SPEC.md` row, and the `PHASE.md` mirror in one temp-then-rename transaction under a registry lock, and rolls all records back on failure. The registry lives under `.agents/@montflow/.runtime/`, which is gitignored. `claim --close` validates the completion checklist and every required mechanical gate, so a close without proof fails `claim.completion-unchecked` or `claim.gate-unproven`.

## Surfaces

| Surface    | Form                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Binary     | `mf-specs <verb> [flags]`                                                                             |
| Slash      | `/specs <verb> [flags]` — the command verbs; `review decide`, `doctor`, and `version` are binary-only |
| Host tools | `spec_author`, `spec_execute`, `spec_status`, `spec_sizing`, `spec_rigor`, `spec_models`              |
| TUI        | the specs picker; offers only directories holding `SPEC.md`                                           |

The slash form validates flags per command and refuses a flag the verb does not implement with `cli.invalid-argument` and the command to run instead. The host tools render or read; they do not add a second rule set.

## Payload and prompts

`author`, `execute`, `sizing-config`, and `status-report` render a shipped prompt and print it; they do not dispatch. Inside the host, the matching slash verb and tool dispatch the rendered prompt on a session instead. `doctor --check` reports payload drift, and `doctor` repairs it. See [payload](./payload.md).

## See also

- [Phases](./phases.md) — what `claim`, `gate`, `waiver`, and `lock` change.
- [Specs](./specs.md) — what the readers report.
- [Payload](./payload.md) — install the skills, prompts, and rigors the verbs load.
