# Prompts module

Effect-first prompt template primitives for Pi extensions. The `Prompt`
Schema Class is the schema and the type in one — decode, encode, construct,
and annotate with a single export.

## Belongs here

- `Prompt` Class (name, description, template, variables, skills, model)
- Trusted constructor with defaults (`make`) and boundary codecs
  (`decodeUnknown`, `encode`, `FromJson`)
- Template rendering (`renderToString`, `renderPrompt`) and helpers (`usesVariable`)

File persistence lives in `../../services/prompt-store/` — this module
never touches the filesystem.

## Does not belong here

- Pi business logic (commands, tools, event handlers) — that lives in the
  consuming extension (e.g. `pi/zi`), or the interactive command in
  `../interactive/`
- Pi UI primitives (`notify`, `confirm`, `select`, `input`) — those live in
  `@montflow/pi-effect`
- Persistence — the consuming extension owns prompt files; this module only
  encodes/decodes their content
