# Sessions app

Session dispatch for the agentic `/mf-skills` flows. An agentic port never
runs a child agent inline: it dispatches a native OpenCode session through
`SessionDispatchPort`, notifies the dispatching session, and unwinds the shared
interactive flow with `Interactive.DISPATCHED`. The session writes the
`SKILL.md`; a settle watcher waits for it, re-reads, canonically re-encodes,
and notifies the outcome.

## Belongs here

- `makeSkillSessionPorts(ports, { storeFor })` — the generator, modifier, and
  transform ports, plus `bind` (the session notify channel per working
  directory) and `shutdown` (interrupt dispatched sessions that have not
  settled)
- `storeFor(root)` — the file-backed `Interactive.SkillStore` over
  `.agents/skills`
- `buildSessionPrompt` — the shared child-prompt assembly
- Completion correlation: `pickAuthoredSkill` (reply-named first,
  single-fresh-skill fallback) for author sessions; raw-snapshot no-op
  detection for editor sessions
- The settle watcher: `SessionDispatchPort.wait` → `reply` → completion hook,
  forked into the caller's scope

## Does not belong here

- The flows, dialogs, and pre/postprompts — those live in
  `../interactive`; this module only supplies the agentic ports
- The `SKILL.md` grammar and the file store — those live in
  `../../modules/skill` and `../../modules/skill-store`
- Session storage, transcripts, and lifecycle rules — the host owns those
  (`SessionDispatchPort`); this module starts sessions and settles results
