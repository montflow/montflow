# Channel module

Schema-free parser and verifier for the two communication channels: the phase
`BOARD.md` broadcast and the per-task `MAILBOX.md` targeted mail. Both are
append-only markdown with one entry grammar, so an identified entry is a
checked fact rather than a convention.

## Belongs here

- `BOARD_FILE`, `MAILBOX_FILE`, `CHANNEL_ENTRY_PATTERN`, `CHANNEL_CODES`
- `parseChannel` — timestamp, from, to, and body, with the offending line named
- `verifyChannel` — title, grammar, order, target, and known-addressee rules
- `renderChannelEntry` / `appendChannelEntry` — the writer's one shape
- `bodyBreaksGrammar` — a body may not start a new `## ` entry

## Does not belong here

- Deciding who may send (`mail` and the claim registry own that authority)
- Choosing a stamp (the `stamp` module owns the instant)
- Delivering to a session (`mail`'s `SessionSteerPort` owns that)
- Turning a channel into a dependency: a mid-flight sibling need is a
  `depends-on` edge, never a mailbox thread
