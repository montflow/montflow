# Spec source module

Turns the workspace's spec store into options for a prompt variable whose
`source` is `specs`. Pure: it reads no files, so the TUI entry owns IO and this
module owns ordering and labelling.

## Belongs here

- `SpecEntry` (`name`, `state`) and `SpecState` (`pending` | `complete`)
- `guess` — the one spec a conventional branch name points at, or `undefined`
- `parseState` — the only reader of `SPEC.md`'s declared status
- `order` — branch guess first, then pending, then complete
- `describe` — the row description, readable without colour

## Does not belong here

- Reading directories or files — the prompts TUI entry does that
- Branch resolution — the TUI entry reads `HEAD`, because that is checkout IO
- Prompt rendering or variable substitution — that is `../prompts/`

## Constraints

- **A spec is complete only when `SPEC.md` says `status: complete`.** Anything
  else stays `pending`, so uncertainty never hides runnable work behind a
  completed-looking row.
