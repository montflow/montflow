---
name: montflow-execute-prompts
description: Inspects and executes reusable prompt templates stored by @montflow/prompts on a chosen model, then returns the agent's reply. Use when an agent must run a stored prompt — inspect its variables, supply the required ones, pick a model, and execute it.
id: a7fa5091d2615813
author: Daniel Montilla
version: 3.5.0
license: MIT
dependencies:
  - executing-skills
  - montflow-create-prompts
groups:
  - workflow
---

# When To Use

Use when a stored prompt template must be run: the agent needs to know what it
takes, supply what is required, run it on a model, and use the reply.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 0. Pick a Front End

Two ways in, over the same engines:

```bash
mf-prompts <subcommand> …      # the binary — scriptable, real exit codes
/mf-prompts <subcommand> …     # the same command in the OpenCode host
```

Agents can also call the `prompt_inspect` and `prompt_execute` tools directly.
They are the native path: `prompt_execute` renders the prompt and runs it on a
session, returning the reply. The `/mf-prompts` slash command does the same in
the host. The **binary** has no model runtime, so its `execute` validates,
renders, and stops there.

Build it once with `bun run --cwd packages/prompts build:cli`, which emits
`dist/mf-prompts` as a self-contained executable. Or run it from source with
`bun packages/prompts/src/apps/cli/main.ts` from the repository root, so the
working directory is the one holding `.agents/@montflow/prompts`. The binary
carries the prompt skills inside itself, so every subcommand below works from a
compiled binary with no package checkout present.

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
mf-prompts list                   # names only
mf-prompts list --verbose         # plus description, model, and variable count
mf-prompts list --status valid    # only files that pass verification
mf-prompts list --status invalid  # only files that fail verification
```

`show <name>` prints a prompt's raw template.

## 3. Inspect It

Always inspect before executing. It tells you exactly what to supply.

```bash
mf-prompts inspect <name> [key=value ...]
```

Or call the `prompt_inspect` tool with `name` and optional `values`.

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

Or call `prompt_execute` with the same name, model, and values; it runs the
rendered prompt in a native session and returns the reply.

- **`--model` is required** unless the prompt pins its own `"model"`. The
  command falls back to the prompt's model, so you only pass it when the
  prompt leaves it open.
- **Every required variable must be supplied.** Optional and defaulted
  variables are not demanded.
- The binary validates, renders, and prints what _would_ be sent, exiting
  non-zero on any refusal. The slash command and `prompt_execute` actually run
  it and report their own actionable refusals.

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

`execute` returns the agent's final text. Send it onward, or hand it to the
`subagent` tool when it should run as its own session.

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
  `packages/prompts/src/apps/cli/engines.apps.module.ts`
- **Renderers** and the token contract (lean by default, `--verbose` only adds,
  failures never suppressed):
  `packages/prompts/src/apps/cli/renderers.apps.module.ts`
- **Binary command tree** (`effect/cli`) and `main.ts`:
  `packages/prompts/src/apps/cli/binary.apps.module.ts`
- **Slash parser** (registered as `/mf-prompts`):
  `packages/prompts/src/apps/cli/slash.apps.module.ts`
- **Interactive engines** (dialogs and menus; the plugin does not register them
  yet): `packages/prompts/src/apps/interactive/interactive.apps.module.ts`
- **Programmatic**: `PromptExecute.inspect`, `PromptExecute.table`,
  `PromptExecute.execute` in
  `packages/prompts/src/modules/prompt-execute/prompt-execute.module.ts`
- **Tools**: `prompt_inspect` (`name`, optional `values` as a record) and
  `prompt_execute` (`name`, optional `model`, optional `values`) — an agent can
  call these instead of either command
- **Authoring a prompt**: skill `montflow-create-prompts`
