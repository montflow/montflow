# Title widget

Bold, colored title line for TUI dialogs: compiles the text through
`@montflow/format` (`bold` + `color`) and wraps it in a padded `Text`
block. Returns a `Widget` handle so dialogs compose it with `Widget.add` —
used for dialog headings so every widget shares one title style.

## Belongs here

- The title builder (`make`) with its default color (cyan)
- Nothing else: no dialogs, no input handling, no layout

## Does not belong here

- ANSI wrapping itself — that lives in `@montflow/format`
- The `Color` brand and codes — those live in `@montflow/format`
- Dialog layout (borders, lists, hints) — the consuming widget owns that
