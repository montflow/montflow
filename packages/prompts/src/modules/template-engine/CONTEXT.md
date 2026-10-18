# Template engine

The only place prompt templates are parsed or rendered. Wraps Handlebars in a
closed grammar and a mechanical analysis pass, so `Prompts.verifyPromptFile`
can _check_ a template instead of pattern-matching it.

## Belongs here

- `inspect(template)` — parse + analyse. Returns ordered `references` and
  `conditionals`, plus **every** problem (`issues`), never throws
- `render(template, context)` — compile with `noEscape` and a total context
- `RENDER_OPTIONS`, `ALLOWED_BLOCKS`, `GRAMMAR`, `VARIABLE_NAME_PATTERN`
- `isValidVariableName`, `isValid`, `formatIssues`, `buildContext`
- `TemplateIssue`, `TemplateAnalysis`, `TemplateRenderError`

## Does not belong here

- The prompt file shape, the `variables` schema, and the rules that connect
  them — that is `../prompts/`. This module knows nothing about prompts; it
  only knows about templates and bare variable names
- Persistence, UI, and slash commands — `../../services/`, `../../apps/`

## Constraints

- **Closed grammar on purpose.** `{{#each}}`, `{{#with}}`, subexpressions,
  dotted paths, and data variables are all rejected. A prompt's variables are
  flat strings, so a nested or list-shaped construct cannot be given a value;
  accepting one would only produce a template that renders nothing.
- **Never throw from `inspect`.** `verify` must be able to list every problem
  in one pass, so syntax errors come back as an `issues` entry.
- **`strict: false` in `RENDER_OPTIONS` is deliberate.** Strict mode throws on
  any unresolved reference even in an untaken branch. Totality comes from
  `buildContext` filling every declared variable, which is a check we control.
- `GRAMMAR` is the single source of truth for the prose handed to prompt
  authors. Keep it in step with `ALLOWED_BLOCKS` and `inspect`.
