# Format module

ANSI terminal text formatting behind an Effect `Pipeable` API: build a
`Format` with `make`, pipe it through transforms (`bold`, `color`), and
finish with `compile` to render the ANSI-escaped string.

## Belongs here

- The `Format` Pipeable value plus its transforms (`make`, `bold`, `color`)
- Rendering/consuming helpers (`compile`, `stripAnsi`)

## Does not belong here

- The `Color` branded type, codes, and constructors — those live in
  `structs/color`; format only consumes colors through `Color.code`
- Class-merging or CSS concerns — that is `@montflow/stlx`
- Terminal widgets or prompts — those live in the Pi packages
- Logging sinks — consume the compiled string, do not add appenders here
