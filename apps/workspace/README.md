# @montflow/workspace

OpenCode TUI plugin: the montflow dashboard grid as one route page, plus a
server-side workspace report.

## Faces

- `@montflow/workspace/server` — registers the `workspace_info` tool and the
  `/mf-workspace` command. Both report native store counts (skills, profiles,
  prompts, specs) for the plugin directory.
- `@montflow/workspace/tui` — registers the `workspace` route page, an `app`
  slot claim that binds `/workspace` and `ctrl+w`, and a
  `home.footer.status` chip fed by the host's live session list.

## Layout

The grid comes from `.agents/@montflow/dashboard/layout.json` in the plugin
directory (columns of `{ panel, keybind, height }` cells with a `width` share
each), falling back to the built-in default when the file is missing or
malformed. Edit the file and restart to re-layout — unknown panel ids render
as placeholders under their own id.

## Panels

- Info reads git live and shows the prompt model through the host's model
  catalogue.
- Skills, Profiles, Prompts, and Specs list their native stores under
  `.agents/` with `/` filter, `j/k` move, enter for details, and esc back.
  `d`/`x` delete, `R` refetches.
- Sessions render on the native session list; the cell is a one-line
  placeholder, not a duplicate list.
- The focused panel persists through the host storage, and `?` opens the
  keymap overlay.

Authoring happens in the native faces: `/mf-skills`, `/mf-profiles`, and
`/mf-prompts` create or modify artifacts through their plugin tools. Spec work
runs through `mf-specs` and subagent sessions.

## Status

Private plugin (`0.0.1`). Tooling matches the rest of the monorepo: `turbo`
`ts:check` / `lint:check` / `format:check`, plus `test:tui` for the OpenTUI
suite.
