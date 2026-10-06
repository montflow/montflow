---
name: montflow-create-pi-prompts
description: Creates and modifies reusable prompt templates for the @montflow/pi-prompts extension, stored as JSON under .agents/@montflow/pi-prompts/. Use when an agent must author a new prompt, or change an existing one, directly from the rules below instead of shelling out.
id: 1f2ac0720ecc0742
author: Daniel Montilla
version: 3.0.0
license: MIT
dependencies:
  - executing-skills
groups:
  - workflow
---

# When To Use

Use when an agent must create or change a reusable prompt template for
`@montflow/pi-prompts`: a parameterized instruction stored as JSON under
`.agents/@montflow/pi-prompts/`. The agent authors the file itself from the
rules below — it does not call a CLI, and it does not dispatch a run.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Choose the Name

`<name>` is a kebab-case slug and becomes the file name:
`.agents/@montflow/pi-prompts/<name>.json`. If that file already exists, pick a
fresh name instead of overwriting it.

## 2. Write the File

Create `.agents/@montflow/pi-prompts/<name>.json` — valid JSON with double
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
`type` = `"text"` (`"textarea"` is the other option), `required` = `true`,
`default` = "". Omit fields that hold their default, so an entry that is only
required and unlabelled is just `{ "name": "…" }`.

Names must match `[a-zA-Z_][a-zA-Z0-9_]*`.

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

List `.agents/skills/` and read each `SKILL.md` frontmatter `name:` before
listing a skill — reference existing skills only, otherwise leave `skills`
empty. Set `model` to `provider/model-id` to pin one, or `""` to make it a
per-run choice.

## 7. Self-Check Before You Stop

1. valid JSON decoding to a `Prompt`
2. a slug `name` matching the file name
3. non-empty `description` and `template`
4. the template parses and stays inside the grammar above
5. every template variable is declared, once, in first-appearance order
6. every declared variable is a legal flat name and is actually used
7. no variable is both `required` and defaulted

## 8. Modify an Existing Prompt

Read the file, apply the change, and keep the JSON valid and the rules above
satisfied. Change only what the request asks for, and keep the file name and the
`name` field unchanged. Delete the file to remove the prompt.

# Reference

- **Grammar and analysis**: `TemplateEngine` in `packages/pi-prompts/src/modules/template-engine/template-engine.module.ts`
- **Verifier**: `Prompts.verifyPromptFile` and `Prompts.verifyReport` in `packages/pi-prompts/src/modules/prompts/prompts.module.ts`
- **Inspecting and executing a prompt**: skill `montflow-execute-pi-prompts`
