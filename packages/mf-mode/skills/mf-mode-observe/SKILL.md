---
name: mf-mode-observe
description: "Record an mf-mode run while it happens: an append-only JSONL trace of phases, workers, CI, checks, friction, decisions and tool round-trips, written by the lead and its workers. Turned on by /mf-mode --observe or --report. The mf-mode-report skill renders the trace."
id: a54a2268ef4eacab
author: Daniel Montilla
version: 1.0.0
license: MIT
disable-model-invocation: true
---

# Observe

With observe on, the run writes down what it does while it does it. One JSON object per line, appended, never edited. The **mf-mode-report** skill turns the file into a report.

## Turn it on

`/mf-mode --observe <task>` turns it on for the whole run, and `--report` turns it on too. In your first message:

1. Pick the trace path: `<scratch>/mf-trace-<UTC yyyymmddThhmmss>.jsonl`, with `<scratch>` your harness's scratchpad directory, or `${TMPDIR:-/tmp}` when it has none. Use the absolute path and keep the file out of git.
2. Set `<emit>` to the absolute path of this skill's `scripts/emit.sh`.
3. Append `run.start` with the goal as its summary.

## Append an event

```bash
bash <emit> <trace> <kind> "<summary>" [--actor A] [--span S] [--status ok|fail|skip] \
  [--ref R]... [--calls N] [--secs N] [--note "<text>"] [--attr k=v]... [--ts ISO]
```

The script stamps `ts`, escapes the JSON, and appends one line with `>>`. It always exits 0. A bad flag or a failed write prints one line on stderr and the run goes on. It takes no lock and reads nothing, so the lead and its workers append to the same file at once.

An append never costs a round-trip of its own. Chain it onto a command you are already running (`bun run test; bash <emit> ...`), or hold the events and append them with your next call. An event appended late passes `--ts` with the time it happened.

## The event

| Field | Type | Meaning |
| --- | --- | --- |
| `v` | `1` | Schema version. |
| `ts` | ISO-8601 UTC | When it happened. The script stamps it; `--ts` overrides. |
| `actor` | string | Who appended it: `lead`, or a worker id. Default `lead`. |
| `kind` | a kind below | What happened. |
| `summary` | string | One line in plain words. |
| `span` | string, optional | Pairs a `*.start` with its `*.end`. For a worker, the worker id. |
| `status` | `ok`, `fail` or `skip`, optional | The outcome of an `*.end`, a `check` or a `link`. |
| `refs` | strings, optional | What it touches, as `type:id`: `issue:#23`, `pr:#55`, `branch:feat/x`, `commit:2e99d6f`, `file:src/a.ts:12`, `url:https://…`. |
| `calls` | number, optional | Tool round-trips, counted as below. |
| `secs` | number, optional | Seconds it cost, on `friction` and `check`. |
| `note` | string, optional | The second line: a check's command, a decision's reason, a friction's fix. |
| `attrs` | string map, optional | Extras: `harness`, `model` and `effort`, the `playbook` a run, step or worker follows, the `skill` a step routes to or that spawned a worker, and the `phase` a worker belongs to. |

[`references/example.trace.jsonl`](references/example.trace.jsonl) is a real three-worker run rebuilt event by event with this script.

## What to append, and when

| When | Kind | Fields |
| --- | --- | --- |
| Your first message | `run.start` | Summary is the goal. Refs name the issue it works. Attrs `harness`, `model`, `playbook`. The paths diagram starts from the playbook. |
| A playbook step or stretch of work begins | `phase.start` | Span is a short phase id. Attr `skill` when the step routes to a skill (`mf-mode-arena`, `mf-mode-swarm`, `mf-mode-interrogate`), or `playbook` when it runs another playbook (`opening-a-pr`). |
| It ends | `phase.end` | The same span, a status, and calls spent in the phase. Refs to what the step produced: a branch, a PR, a commit. |
| Before you spawn a worker | `worker.start` | Span is the worker id. Summary is its task. Refs name its issue and branch. Attrs `harness`, `model`, `effort`, the `playbook` it runs and the `skill` that spawned it. Add `phase` with a phase id when you spawn it outside the phase that is open. |
| Its report comes in | `worker.end` | The same span, a status, refs to the branch and PR it produced, calls from its report. |
| You trigger CI or start waiting on it | `ci.start` | Span is the CI run id. Refs name the PR. |
| CI finishes | `ci.end` | The same span and a status. |
| A test, build, lint or claim check runs | `check` | A status, and the command as the note. |
| Something costs time it should not | `friction` | Secs and calls it wasted, and the fix you would make as the note. |
| You choose between options | `decision` | The reason as the note. |
| A relation the paths diagram should show | `link` | Refs run from the first to each of the rest. Status `fail` marks a finding that breaks or changes the target. |
| Something is left for the operator | `todo` | Refs to what it is about. |
| Anything else worth a timestamp | `note` | |
| Before your final reply | `run.end` | A status, and the run's total calls. |

Count your own tool calls per phase. A friction's calls are the ones it wasted, already inside its phase's count.

## Workers

The lead appends `worker.start` and `worker.end` itself, so every worker gets its lane even when it cannot write the file. Add one line to each kickoff, with the paths and the worker id filled in:

`Trace: append your phases, checks, friction and decisions with bash <emit> <trace> <kind> "<summary>" --actor <worker id>, chained onto calls you already make. A failed append never stops your work.`

A worker sandboxed away from the trace's directory skips appending. Its report still feeds `worker.end`.

## Rules

- Append only. A wrong event gets a later event that corrects it. Never edit the file.
- Never put a secret, a token or customer data in an event. The trace and its report can end up attached to a PR.
- Log the moments that shape the run: a phase, a spawn, a check, a cost, a choice. Skip routine commands.
- A decision a reviewer must trust on evidence also goes in the **mf-mode-show-me-your-work** log when that skill runs. The trace keeps its timing.

## End

Append `run.end` once the work is done, after the PR is open and its checks have settled. With `--report` on, run the **mf-mode-report** skill. Name the trace path in your reply.
