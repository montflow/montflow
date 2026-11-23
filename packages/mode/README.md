# @montflow/mode

The `mf-mode` CLI: which harness and model run each kind of delegated work in
an `/mf-mode` run, and the headless dispatch that runs a seat on another
harness. It makes the mechanical calls an agent would otherwise guess (which
harness it is in, which seat wins, the exact command line) so the skill text
only has to say "run this and do what it prints".

Harness-agnostic: it knows Claude Code, Codex, OpenCode and Pi by their CLIs
and environment, and needs none of them installed to resolve a role.

## The roles file

```
.agents/@montflow/mode/roles.json   # per user; the directory's own .gitignore keeps it out of git
```

```json
{
  "version": 1,
  "roles": {
    "bug-fix": [
      [
        { "harness": "claude-code", "model": "opus", "effort": "xhigh" },
        { "harness": "codex", "model": "gpt-5.5", "effort": "high" }
      ]
    ]
  }
}
```

A role is a list of seats (one, or several for a panel: `arena-runners`,
`arena-judges`, `interrogate-reviewers`). A seat is an ordered list of
candidates. The first candidate whose harness is available wins: the harness
you run in always is, another one is when its CLI is on `PATH`. A role not in
the file resolves to the defaults in the `mf-mode` skill's Subagents section,
on the current harness.

Edit it with `roles set`, never by hand. `verify` fails on unknown roles or
fields, more than one seat outside a panel, and any model or effort its
harness does not take:

| Harness       | Models                                         | Effort                                        |
| ------------- | ---------------------------------------------- | --------------------------------------------- |
| `claude-code` | `opus`, `sonnet`, `haiku`, `fable`, `claude-*` | `low` `medium` `high` `xhigh` `max`           |
| `codex`       | `gpt-*`, `o*`, `codex-*`                       | `minimal` `low` `medium` `high` `xhigh`       |
| `opencode`    | `provider/model`                               | any variant name (sent as `model#variant`)    |
| `pi`          | `provider/model`                               | `off` `minimal` `low` `medium` `high` `xhigh` |

## Commands

```bash
mf-mode roles [--human] [--dir <root>]                  # = roles show
mf-mode roles show [--human] [--dir <root>]             # every role: its seats, or `default`
mf-mode roles set <role> --seat <spec> [--seat <spec>…]  # spec: harness:model[:effort],… in preference order
mf-mode roles unset <role>                               # back to the defaults
mf-mode roles verify [--human] [--dir <root>]            # non-zero on any error; no file is valid
mf-mode roles resolve <role> [--harness <h>] [--human] [--verbose]
mf-mode dispatch <role> --seat <n> --brief <file> [--profile <name>|none] [--read-only] [--harness <h>] [--dry-run]
```

`resolve` prints one line per seat. Each ends with `next=`, the one thing to do:

```
$ mf-mode roles resolve interrogate-reviewers
role=interrogate-reviewers source=set current=claude-code seats=3
seat=1 run=native harness=claude-code model=fable effort=high next="spawn with your subagent tool on this model and effort"
seat=2 run=dispatch harness=codex model=gpt-5.5 effort=high next="mf-mode dispatch interrogate-reviewers --seat 2 --brief <file>"
seat=3 run=dropped skipped="pi:google/gemini-4-neon (pi not installed)" next="skip this seat and say so"
```

`dispatch` resolves the seat itself, so the caller names only the role and the
seat number, never a harness or model. It refuses a `native` or `dropped`
seat and says what to do instead. The worker gets its profile's instructions
(default `mf-mode-generic-worker`, from `mf-profiles`) followed by the brief,
runs in the workspace root, and its final report is printed on stdout; the
exit code is the worker's.

| Harness       | Command (`write`)                                                                                         | `--read-only`               |
| ------------- | --------------------------------------------------------------------------------------------------------- | --------------------------- |
| `claude-code` | `claude -p --model M [--effort E] --permission-mode auto` (brief on stdin)                                | `--permission-mode plan`    |
| `codex`       | `codex exec --model M [--config model_reasoning_effort="E"] --sandbox workspace-write -` (brief on stdin) | `--sandbox read-only`       |
| `opencode`    | `opencode run --model M[#E] --auto <brief>`                                                               | `--agent plan`              |
| `pi`          | `pi -p --model M [--thinking E] <brief>`                                                                  | `--tools read,grep,find,ls` |

The child gets `MF_MODE_HARNESS=<harness>`, so a lead nested inside a dispatch
resolves from the right harness.

## Current harness

`--harness` wins. Otherwise `MF_MODE_HARNESS`, then the markers each harness
sets for its commands: `CLAUDECODE` (Claude Code), `CODEX_THREAD_ID` and
`CODEX_SANDBOX*` (Codex), `OPENCODE` (OpenCode). No marker, or markers from two
harnesses, is a refusal that asks for `--harness`: the CLI never guesses.

## Checks

`bun run mf-mode:check` runs `roles verify` on this checkout. The package's
binary test also scans every `mf-mode` skill, playbook, principle, profile,
the harnesses reference and the wiki for `` `mf-mode <command>` `` and fails
on a command this binary does not have, so the text agents follow can never
name a verb that does not exist.
