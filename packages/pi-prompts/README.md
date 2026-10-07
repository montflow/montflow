# @montflow/pi-prompts

Effect-first prompt template primitives for Pi extensions — the `Prompt` and
`Variable` Schema Classes, a Handlebars engine restricted to a closed grammar,
mechanical file verification, a `mf-prompts` CLI (a binary, and the same
command inside a Pi session as `/mf-prompts`), an interactive
`/mf-prompts-tui` menu, and the agent-callable `prompt_inspect` /
`prompt_execute` Pi tools.

```typescript
import { Prompts, PromptExecute } from '@montflow/pi-prompts';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const prompt = Prompts.make(
    'review',
    '{{#if scope}}Review {{files}}, limited to {{scope}}.\n{{else}}Review {{files}}.\n{{/if}}',
    'Reviews a set of files.',
  );

  // Look at it first — what does this need?
  yield* Effect.sync(() => console.log(PromptExecute.table(PromptExecute.inspect({ prompt }))));

  // Then resolve a run. `execute` never dispatches; it tells you what is
  // missing, or hands back the rendered text and the model to use.
  const plan = PromptExecute.execute({
    prompt,
    model: 'opencode-go/fast',
    values: { files: 'src/' },
  });
  if (!plan.ok) return yield* Effect.fail(plan.message);
  return plan.text; // "Review src/, limited to src/.\n"
});
```

## Commands

```bash
# The CLI — the binary, or the same command inside a Pi session
mf-prompts doctor [--check]                    # install / verify the skills
mf-prompts list [--status valid|invalid]
mf-prompts inspect <name> [key=value ...]     # variables table
mf-prompts execute <name> --model p/m [key=value ...]
mf-prompts render <name> [key=value ...]      # text only, no agent
mf-prompts show | verify | create | modify | delete | help

# The interactive menu, for humans
/mf-prompts-tui browse | create | inspect <name> | execute <name> | …
```

Inside Pi, the slash form is spelled `/mf-prompts …`; everywhere else it is
`mf-prompts …`. They are one CLI in two runtimes.

`execute` runs `doctor` first and refuses when the packaged skills are missing
or stale — an agent must not act on guidance the verifier no longer enforces.
It requires a model (from `--model` or the prompt's own `"model"`) and every
required variable; each refusal names the exact fix.

## Template grammar

Handlebars, restricted so every template is mechanically checkable:

| Construct                               | Meaning                                   |
| --------------------------------------- | ----------------------------------------- |
| `{{name}}`                              | substitute the variable's value           |
| `{{! note }}`                           | comment, not rendered                     |
| `{{#if name}}` / `{{else}}` / `{{/if}}` | branch on whether the value is non-empty  |
| `{{#unless name}}`                      | the inverse                               |
| `{{else if name}}`                      | chained branch                            |
| `{{~ … ~}}`                             | strip surrounding whitespace and newlines |

Rejected by the verifier: `{{#each}}`, `{{#with}}`, helper calls,
subexpressions, dotted paths, data variables, partials. A prompt variable is a
single flat string, so a nested or list-shaped construct has no value to
receive.

Values are **not** HTML-escaped — a prompt is prose for an agent.

## Variables

`variables` is a bijection with the template in first-appearance order. Each
entry is a bare name (required, no default) or an object:

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

A conditional tests the variable's **effective value** — what the user
supplied, or its `default`, or empty. That single rule is what makes
`{{#if scope}}…{{else}}…{{/if}}` the "user gave me a scope, otherwise do X"
pattern.

## Verification

`Prompts.verifyPromptFile(name, raw)` is pure and reports every problem in one
pass, each with a `Fix:` line, plus the exact `variables` JSON to paste when
coverage is wrong. `Prompts.verifyReport` renders it for an agent;
`/mf-prompts verify <name>` is the command.

```bash
/mf-prompts verify review
```

## Skills

Two skills ship with the package and `doctor` installs them into
`.agents/skills/`, keeping them byte-identical to the package:

- `montflow-create-pi-prompts` — authoring, modifying, and verifying a prompt
- `montflow-execute-pi-prompts` — inspecting and executing a stored prompt

```bash
/mf-prompts verify review
```

## Status

Boilerplate (`0.0.1`, private). Source-only — no build step: Pi loads the
`.ts` files directly. Run `bun install` from the repo
root for dependencies, then `turbo` `test` / `ts:check` cover this package
like the rest.
