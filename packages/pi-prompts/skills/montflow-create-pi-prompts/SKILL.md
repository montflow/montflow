---
name: montflow-create-pi-prompts
description: Creates, modifies, and mechanically verifies reusable prompt templates for the @montflow/pi-prompts extension, stored as JSON under .agents/@montflow/pi-prompts/. Use when an agent must author a new prompt, change an existing one, or check one against the prompt standard.
id: 1f2ac0720ecc0742
author: Daniel Montilla
version: 2.2.0
license: MIT
dependencies:
  - executing-skills
groups:
  - workflow
---

# When To Use

Use when an agent must create, edit, or verify a reusable prompt template for
`@montflow/pi-prompts`: a parameterized instruction stored in the repo and
reused across sessions.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Ensure the Skills Are Installed

Run `mf-prompts doctor` (or `/mf-prompts doctor` inside Pi). It checks
`.agents/skills/` for the packaged
`@montflow/pi-prompts` skills and installs any that are missing. Re-run after
upgrading the package.

## 2. Choose the Surface

- `mf-prompts` (binary) or `/mf-prompts` (in Pi) — the headless CLI, every
  operation as flags. Use this one when no human is present.
- `/mf-prompts-tui` — the interactive menu for humans: browse, create manually
  or with an agent, inspect, render, execute.

## 3. Create the Prompt

### Agentic (interactive, TUI only)

`/mf-prompts-tui create` → **Create with agent** → describe the prompt → pick the
authoring model. A child agent writes exactly one file, runs `verify`, and stops.

### Manual (CLI)

```bash
/mf-prompts create <name> --template "text" \
  [--description "One line"] [--model provider/model-id] \
  [--skills a,b] [--variable name[:flags]] [--dir <path>]
```

- `<name>` is a kebab-case slug and becomes the file name.
- `--template` is required; everything else has a default.
- `--variable` may be repeated or comma-separated. Flags: `o` makes the
  variable optional, `d=<text>` gives it a default (which also makes it
  optional). Omit it entirely to derive every variable from the template as
  required.
- Omit `--dir` to write `.agents/@montflow/pi-prompts/<name>.json`; `--dir <path>`
  writes `<path>/<name>.json` instead.

## 4. Prompt Schema

The file is valid JSON with exactly these fields:

| Field         | Type     | Rules                                               |
| ------------- | -------- | --------------------------------------------------- |
| `name`        | string   | kebab-case slug; equals the file name               |
| `description` | string   | one non-empty line saying what the prompt does      |
| `template`    | string   | non-empty; the allowed grammar below                |
| `variables`   | array    | the template's variables, in first-appearance order |
| `skills`      | string[] | skill names the run loads (empty when none)         |
| `model`       | string   | `provider/model-id`, or `""` when unset             |

### Template grammar

Handlebars, restricted to these constructs. **Nothing else is accepted**, and
`verify` rejects the rest with a `Fix:` line.

| Construct                      | Meaning                                       |
| ------------------------------ | --------------------------------------------- |
| `{{name}}`                     | substitute the variable's value               |
| `{{! note }}`                  | comment, not rendered                         |
| `{{#if name}}…{{/if}}`         | include the block when the value is non-empty |
| `{{#unless name}}…{{/unless}}` | the inverse                                   |
| `{{else}}`                     | alternative branch of the enclosing if/unless |
| `{{else if name}}`             | chained branch                                |
| `{{~ … ~}}`                    | strip surrounding whitespace and newlines     |

Rejected: `{{#each}}`, `{{#with}}`, helper calls, subexpressions like
`{{#if (eq a b)}}`, dotted paths like `{{user.name}}`, data variables like
`{{@index}}`, partials. A prompt variable is a single flat string, so a nested
or list-shaped construct has no value to receive.

### Variables

Each entry is either a bare name (legacy: required, no default) or an object:

```json
{
  "name": "scope",
  "label": "Scope",
  "description": "What to limit to",
  "type": "text",
  "required": false,
  "default": ""
}
```

Omit any field to take its default: `label` = `name`, `description` = `""`,
`type` = `"text"` (`"textarea"` is the other option), `required` = `true`,
`default` = `""`. Omit fields that hold their default, so an entry that is only
required and unlabelled should be just `{ "name": "…" }`.

Names must match `[a-zA-Z_][a-zA-Z0-9_]*`.

### How `required`, `default`, and `{{#if}}` interact

The one rule that matters:

> A conditional tests the variable's **effective value**: what the user
> supplied, or the variable's `default` when the user left the field blank, or
> empty when there is neither.

So for _"if the user gave me a scope, use it, otherwise do the default thing"_,
declare the variable `{ "name": "scope", "required": false }` with **no**
`default` and put the fallback in `{{else}}`:

```
{{#if scope}}Some text this is the scope: {{scope}}
{{else}}Use the git to determine the unstaged changes that must be included.{{/if}}
```

Leaving `scope` blank is what makes the `{{else}}` branch run. A variable
_with_ a non-empty `default` is truthy by default, so only guard it with
`{{#if}}` when you want that default suppressed when the field is blank.

A variable can never be `required: true` _and_ have a `default` — it could
never be blank, so `required` would be a lie. `verify` rejects that pair.

## 5. Modify or Delete

```bash
/mf-prompts modify <name> [--template "..." ...] [--dir <path>]
/f-prompts-cli delete <name>
```

`modify` keeps any field you do not pass. `delete` removes the file.

## 6. Set a Model If the Prompt Should Pin One

A prompt may name the model it wants in its `"model"` field. If it does, a
caller does not have to pass one, and `execute` uses the pinned model rather
than asking. Leave it empty (`""`) to make the model a per-run choice.

```bash
/mf-prompts modify <name> --model provider/model-id
```

## 7. Verify — the authoritative check

```bash
/mf-prompts verify <name>
```

`verify` is the source of truth. It reports every problem in one pass, each
with a `Fix:` line, and when the variable list is wrong it hands back the exact
`variables` JSON to paste. Fix the issues it names and run it again.

It checks:

1. valid JSON decoding to a `Prompt`
2. a slug `name` matching the file name
3. non-empty `description` and `template`
4. the template parses and stays inside the grammar above
5. every template variable is declared, once, in first-appearance order
6. every declared variable is a legal flat name and is actually used
7. no variable is both `required` and defaulted

# Reference

- **Command surface**: `packages/pi-prompts/src/apps/cli/cli.apps.module.ts`
- **Grammar and analysis**: `TemplateEngine` in `packages/pi-prompts/src/modules/template-engine/template-engine.module.ts`
- **Verifier**: `Prompts.verifyPromptFile` and `Prompts.verifyReport` in `packages/pi-prompts/src/modules/prompts/prompts.module.ts`
- **Rules handed to child agents**: `Prompts.authoringRules`, embedded in `AUTHOR_PREPROMPT` / `MODIFY_PREPROMPT` in `packages/pi-prompts/src/extension.ts`
- **Inspecting and executing a prompt**: skill `montflow-execute-pi-prompts`
