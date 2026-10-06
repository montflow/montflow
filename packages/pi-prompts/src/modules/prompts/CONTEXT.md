# Prompts module

The prompt file shape plus the rules that connect it. `Prompt` and `Variable`
are Schema Classes — schema and type in one. Decoding, encoding, construction,
and annotation are each a single export.

## Belongs here

- `Prompt` Class (name, description, template, variables, skills, model) and
  `Variable` Class (name, label, description, type, required, default)
- `VariableEntry` — the on-disk codec: accepts a bare name or an object,
  resolves defaults, encodes back to the minimal object
- Trusted constructor with defaults (`make`, `requiredVariable`) and boundary
  codecs (`decodeUnknown`, `encode`, `FromJson`)
- Slug helpers (`isValidName`, `slugify`, `SLUG_PATTERN`)
- Value resolution (`resolveValues`, `missingRequired`) and rendering
  (`renderToString`, `renderPrompt`)
- Mechanical verification (`verifyPromptFile`, `verifyReport`, `verifyInfoLine`,
  `VerifyIssue`, `VerifyResult`) and the author-facing rules
  (`authoringRules`, `templateVariables`, `analyze`)

## Does not belong here

- Parsing and compiling templates — that is `../template-engine/`, which knows
  about templates and bare variable names but nothing about prompt files
- Pi business logic (commands, tools, event handlers) — the interactive command
  in `../interactive/` and the CLI in `../cli/`
- Pi UI primitives (`notify`, `confirm`, `select`, `input`) — those live in
  `@montflow/pi-effect`
- Persistence — the consuming extension owns prompt files; this module only
  encodes/decodes their content

## Constraints

- **`authoringRules()` is the single source of truth for the prose handed to
  prompt authors.** `extension.ts` embeds it in `AUTHOR_PREPROMPT` and
  `MODIFY_PREPROMPT`; the packaged skills restate it in markdown. When the
  grammar or the schema changes, change it there first.
- **`variables` is a bijection with the template, in first-appearance order.**
  That is what lets the run dialog lay itself out from the template alone, and
  it is what `verify` enforces. When coverage is wrong, `verifyPromptFile`
  returns `expectedVariables` — the JSON to paste — rather than only
  describing the problem.
- **A variable cannot be `required` _and_ have a `default`.** Required means the
  run cannot dispatch without it; a default means blank is answered. Rejected
  by `verify` and unreachable through the CLI flag grammar.
- **A conditional tests the _effective_ value** — supplied, else `default`,
  else empty. See `authoringRules()` for the consequence, which is the whole
  "user gave me a value, or use my fallback" pattern.
