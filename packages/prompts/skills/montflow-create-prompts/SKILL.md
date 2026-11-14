---
name: montflow-create-prompts
description: Creates and modifies reusable prompt templates for the @montflow/prompts plugin, stored as JSON under .agents/@montflow/prompts/. Use when an agent must author a new prompt, or change an existing one, from the rules below and verify it with the CLI.
id: 1f2ac0720ecc0742
author: Daniel Montilla
version: 3.3.1
license: MIT
dependencies:
  - executing-skills
groups:
  - workflow
---

# When To Use

Use when an agent must create or change a reusable prompt template for
`@montflow/prompts`: a parameterized instruction stored as JSON under
`.agents/@montflow/prompts/`. The agent authors the file itself from the
rules below, discovers skills and runs `mf-prompts verify <name>` through the
CLI, and does not dispatch a session.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Choose the Name

`<name>` is a kebab-case slug and becomes the file name:
`.agents/@montflow/prompts/<name>.json`. If that file already exists, pick a
fresh name instead of overwriting it.

## 2. Write the File

Create `.agents/@montflow/prompts/<name>.json` — valid JSON with double
quotes, no comments, and no trailing commas — with exactly these fields:

| Field         | Type     | Rules                                               |
| ------------- | -------- | --------------------------------------------------- |
| `name`        | string   | kebab-case slug; equals the file name               |
| `description` | string   | one non-empty line saying what the prompt does      |
| `template`    | string   | non-empty; the allowed grammar below                |
| `variables`   | array    | the template's variables, in first-appearance order |
| `skills`      | string[] | skill names the run loads (empty when none)         |
| `model`       | string   | `provider/model-id`, or `""` when unset             |

## 3. Keep the Template Inside the Grammar

Handlebars, restricted to these constructs. **Nothing else is accepted**, and
the verifier rejects the rest.

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

## 4. Declare the Variables

Each entry is either a bare name (required, no default) or an object:

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

Omit any field that holds its default: `label` = `name`, `description` = `""`,
`type` = `"text"` (the other kinds are `"textarea"`, `"select"`, and
`"confirm"`), `required` = `true`, `default` = "". Omit fields that hold their
default, so an entry that is only required and unlabelled is just
`{ "name": "…" }`.

A `"select"` adds `"options"`: a non-empty list of strings; its value is one of
those options or `""`. A `"confirm"` is a boolean question: it has no `"options"`,
`"default"`, or `"required"`, and its value is `"yes"` when checked and `""`
when not. The verifier rejects any of those three fields on a confirm.

```json
{ "name": "flag", "label": "Use a worktree?", "type": "confirm" }
```

Names must match `[a-zA-Z_][a-zA-Z0-9_]*`.

### Conditions

A variable may declare visibility with an optional `when` object: a
discriminated union with exactly one form and no other keys.

```json
{ "controller": "isolated", "equals": "yes" }
{ "controller": "flag", "truthy": true }
```

The `when.controller` must be declared **earlier** in `variables` — the
renderer only walks backwards. A `select` controller compares one of its own
`options` with `equals`; a `confirm` controller compares with `truthy: true`.
A variable with no `when` is always visible. Never point at a later variable, a
`text`/`textarea` variable, or a value the controller does not offer.

A hidden variable resolves to empty, so its `{{#if}}` takes `{{else}}` — put
the fallback in the else branch. Guard the conditional child, never the
controller: for an `origin` that has `when`, write `{{#if origin}}`, not
`{{#if isolated}}` (a select's `"no"` is non-empty, so that guard is always
true). Omit `default` on a conditional variable so flipping the controller
back cannot surface a stale prefill.

```json
{ "name": "isolated", "label": "Isolated branch?", "type": "select",
  "options": ["yes", "no"], "required": true },
{ "name": "origin", "label": "Origin", "type": "select",
  "options": ["current", "main", "other"],
  "when": { "controller": "isolated", "equals": "yes" } }
```

```
{{#if origin}}Branch from {{origin}}.
{{else}}Use the current checkout.{{/if}}
```

A controller can itself be conditional. Guard each conditional child at its own
level, and keep variable names flat identifiers — `origin_branch`, not
`origin-branch`:

```json
{ "name": "isolated", "label": "Isolated branch?", "type": "select",
  "options": ["yes", "no"], "required": true },
{ "name": "origin", "label": "Origin", "type": "select",
  "options": ["current", "other"], "required": true,
  "when": { "controller": "isolated", "equals": "yes" } },
{ "name": "origin_branch", "label": "Origin branch", "type": "text",
  "required": true, "when": { "controller": "origin", "equals": "other" } },
{ "name": "worktree_name", "label": "Worktree name", "type": "text",
  "required": true, "when": { "controller": "isolated", "equals": "yes" } }
```

```handlebars
Isolated:
{{isolated}}.
{{#if origin}}Origin:
  {{origin}}
  {{#if origin_branch}}Branch: {{origin_branch}}{{/if}}
  {{#if worktree_name}}Worktree: {{worktree_name}}{{/if}}{{/if}}
```

`{{#if origin}}` is allowed even though `origin` controls `origin_branch`: it has
its own `when`, so it is a conditional child. Only a controller with no `when`
of its own must never be guarded.

## 5. Respect required, default, and `{{#if}}`

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
never be blank, so `required` would be a lie.

## 6. Reference Only Skills That Exist

Discover the installed skills with the CLI — `list` prints every name with its
description, so there is no reason to scan the store by hand:

```
mf-skills list
```

When a name needs its full contract, read it with `mf-skills show <skill>`
instead of opening the file manually. Reference existing skills only, otherwise
leave `skills` empty. Where the binary is not on `PATH`, use the in-repo form:

```
bun run --cwd packages/skills cli list --dir "$PWD"
bun run --cwd packages/skills cli show <skill> --dir "$PWD"
```

Set `model` to `provider/model-id` to pin one, or `""` to make it a per-run
choice.

## 7. Verify with the CLI

`mf-prompts verify <name>` is the mandatory self-check for both create and
modify. Run it and fix every issue before you stop.

```
mf-prompts verify <name>
```

Where the binary is not on `PATH`:

```
bun run --cwd packages/prompts cli verify <name> --dir "$PWD"
```

The ten rules it measures:

1. valid JSON decoding to a `Prompt`
2. a slug `name` matching the file name
3. non-empty `description` and `template`
4. the template parses and stays inside the grammar above
5. every template variable is declared, once, in first-appearance order
6. every declared variable is a legal flat name and is actually used
7. no variable is both `required` and defaulted
8. every `when` carries exactly one of `equals` or `truthy`, points at an
   earlier `select` or `confirm` controller whose kind matches the form, and
   for `equals` uses one of that controller's options
9. a `confirm` carries no `options`, `default`, or `required`
10. no `{{#if}}` guards a controller that has no condition of its own

## 8. Modify an Existing Prompt

Read the file, apply the change, and keep the JSON valid and the rules above
satisfied. Change only what the request asks for, and keep the file name and the
`name` field unchanged. Delete the file to remove the prompt.

Finish with the same mandatory gate as creation:

```
mf-prompts verify <name>
```

(or `bun run --cwd packages/prompts cli verify <name> --dir "$PWD"` when the
binary is not on `PATH`).

# Reference

- **Grammar and analysis**: `TemplateEngine` in `packages/prompts/src/modules/template-engine/`
- **Verifier**: `Prompts.verifyPromptFile` and `Prompts.verifyReport` in `packages/prompts/src/modules/prompts/prompts.module.ts`
- **Inspecting and executing a prompt**: skill `montflow-execute-prompts`
