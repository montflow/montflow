---
name: montflow-execute-pi-prompts
description: Inspects and executes reusable prompt templates stored by @montflow/pi-prompts on a chosen model, then returns the agent's reply. Use when an agent must run a stored prompt — inspect its variables, supply the required ones, pick a model, and execute it.
id: a7fa5091d2615813
author: Daniel Montilla
version: 3.3.1
license: MIT
dependencies:
  - executing-skills
  - montflow-create-pi-prompts
groups:
  - workflow
---

# When To Use

Use when a stored prompt template must be run: the agent needs to know what it
takes, supply what is required, run it on a model, and use the reply.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 0. Pick a Front End

Three ways in, over the same engines:

```bash
mf-prompts <subcommand> …      # the binary — scriptable, real exit codes
/mf-prompts <subcommand> …      # the same command inside a Pi session
/mf-prompts-tui                 # the interactive menu, for humans
```

The binary and the `/mf-prompts` slash command are the _same_ CLI in two
runtimes, so everything below works identically in either. **Prefer them** when
you are an agent or a script: no dialogs, a meaningful exit code, and `execute`
prints exactly the text that would be sent.

Use `/mf-prompts-tui` only when a human is driving. It asks for values and a
model through dialogs, and its `Execute` action is the one form that _runs_ a
prompt, because running one needs a model runtime that lives in the Pi
extension — the binary has none, so its `execute` validates, renders, and stops
there.

Build it once with `bun run --cwd packages/pi-prompts build:cli`, which emits
`dist/mf-prompts` as a self-contained executable. Or run it from source with
`bun packages/pi-prompts/src/apps/cli/main.ts` from the repository root, so the
working directory is the one holding `.agents/@montflow/pi-prompts`. The
binary carries the prompt skills inside itself, so every subcommand below works
from a compiled binary with no package checkout present.

## 1. Ensure the Skills Are Installed

`execute` checks this itself and refuses to run if the skills are missing or
stale — an agent must never act on guidance the verifier no longer enforces.

```bash
mf-prompts doctor          # install or repair
mf-prompts doctor --check  # report only, change nothing
```

`doctor` reports one line per skill:

| status       | meaning                                                  |
| ------------ | -------------------------------------------------------- |
| `ok`         | installed and byte-identical to the package              |
| `stale`      | installed, but a file's contents differ from the package |
| `mismatched` | installed, but holding a different set of files          |
| `missing`    | not installed                                            |
| `installed`  | doctor just installed it                                 |
| `repaired`   | doctor just rewrote it                                   |

`installed`, `repaired`, and `ok` all count as usable. When anything else
remains, the binary exits non-zero and the slash command reports an error
notification. Run plain `doctor` and retry.

If `execute` stops with _"Prompts skills are not ready"_, that is this step
failing. Run `doctor`, then retry.

## 2. Find the Prompt

```bash
mf-prompts list             # names only
mf-prompts list --verbose   # plus description, model, and variable count
```

`show <name>` prints a prompt's raw template. In the TUI, `/mf-prompts-tui browse`
opens a picker with per-prompt actions (Show, Inspect, Fill & render, Execute,
Modify, Delete).

## 3. Inspect It

Always inspect before executing. It tells you exactly what to supply.

```bash
mf-prompts inspect <name> [key=value ...]
```

For a prompt described _"Draft a commit message."_, pinned to model
`opencode-go/deepseek-v4.1-flash`, loading skill `planning-git-commits`, with a
required `files` and an optional `scope`:

<!-- verified-output:inspect -->

```
commit-message — Draft a commit message.
  model     opencode-go/deepseek-v4.1-flash
  skills    planning-git-commits
  variables 2 (1 required, 1 optional)

  NAME   TYPE  REQUIRED  DEFAULT  VALUE
  ─────  ────  ────────  ───────  ─────
  files  text  yes       —        —
  scope  text  no        —        —

Missing required values: files
  Supply them as key=value pairs, or set "required": false in the prompt file.
```

`DEFAULT` is what gets used when the field is left blank. `VALUE` is the
effective value given whatever you have supplied so far. `—` means empty.

## 4. Execute It

```bash
mf-prompts execute <name> --model provider/model-id [key=value ...]
```

```bash
mf-prompts execute commit-message --model opencode-go/deepseek-v4.1-flash files=src/
```

- **`--model` is required** unless the prompt pins its own `"model"`. The
  command falls back to the prompt's model, so you only pass it when the
  prompt leaves it open.
- **Every required variable must be supplied.** Optional and defaulted
  variables are not demanded.
- The binary and the slash command validate, render, and print what _would_ be
  sent, exiting non-zero on any refusal. To actually run it, use the TUI or the
  Pi tool — both report their own actionable refusals:

  ```bash
  /mf-prompts-tui execute commit-message --model opencode-go/deepseek-v4.1-flash files=src/
  ```

In the TUI: `/mf-prompts-tui execute <name> [key=value ...]` checks the skills,
asks for the values and the model, then runs.

### When it refuses

Every refusal names the exact fix, in the spelling of the front end you used.
Do not guess — read the message.

| message                        | meaning                              | fix                                                                   |
| ------------------------------ | ------------------------------------ | --------------------------------------------------------------------- |
| `has no model`                 | neither you nor the prompt named one | pass `--model provider/model-id`, or set `"model"` in the prompt file |
| `needs N required values`      | required variables unanswered        | add `name=value` pairs, or set `"required": false` in the prompt file |
| `not valid Handlebars`         | the template will not render         | run `verify <name>` and fix what it reports                           |
| `does not pass verification`   | the file fails `verify`              | run `verify <name>` and fix every issue it reports                    |
| `Prompts skills are not ready` | step 1 failed                        | run `doctor`, then retry                                              |

## 5. Use the Reply

`execute` returns the agent's final text. Send it onward, or dispatch it as a
separate run with `@montflow/pi-runs` (see skill `montflow-dispatch-pi-runs`).

To see the rendered text _without_ running an agent, use
`mf-prompts render <name> key=value ...`.

It demands the same required values, and it does **not** verify the prompt:
`render` will show you the output of a file that `verify` rejects, which is
useful for seeing what is wrong — but it means never dispatch rendered output
you have not verified. `execute` refuses anything `verify` would reject,
undeclared variables included, which would otherwise render as nothing.

# Reference

- **Engines** — `list`, `load`, `verify`, `inspect`, `render`, `plan`, `doctor`,
  `create`, `modify`, `remove` — plus the input grammars both front ends share:
  `packages/pi-prompts/src/apps/cli/engines.apps.module.ts`
- **Renderers** and the token contract (lean by default, `--verbose` only adds,
  failures never suppressed):
  `packages/pi-prompts/src/apps/cli/renderers.apps.module.ts`
- **Binary command tree** (`effect/unstable/cli`) and `main.ts`:
  `packages/pi-prompts/src/apps/cli/binary.apps.module.ts`
- **Slash parser** (registered as `/mf-prompts`):
  `packages/pi-prompts/src/apps/cli/slash.apps.module.ts`
- **Interactive menu** (registered as `/mf-prompts-tui`):
  `packages/pi-prompts/src/apps/interactive/interactive.apps.module.ts`
- **Programmatic**: `PromptExecute.inspect`, `PromptExecute.table`,
  `PromptExecute.execute` in
  `packages/pi-prompts/src/modules/prompt-execute/prompt-execute.module.ts`
- **Pi tools**: `prompt_inspect` (`name`, optional `values` as `[name, value]`
  pairs) and `prompt_execute` (`name`, optional `model`, optional `values`) — an
  agent can call these instead of either command
- **Authoring a prompt**: skill `montflow-create-pi-prompts`
