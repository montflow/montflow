# Sessions app

Session dispatch for the agentic `/mf-skills-tui` flows. An agentic port never
runs a child agent inline: it dispatches a `@montflow/pi-sessions` session,
notifies the dispatching session, and unwinds the shared interactive
flow with `Interactive.DISPATCHED`. The session writes the `SKILL.md`; its
completion hook re-reads, canonically re-encodes, and notifies the
outcome — the same contract the workspace dashboard's skills panel
uses, so both surfaces behave identically.

## Belongs here

- `makeSkillSessionPorts({ storeFor, layerFor })` — the generator, modifier,
  and transform ports the extension registers, plus `bind` (the session
  notify channel per working directory) and `shutdown` (interrupt live
  sessions, then dispose runtimes)
- One lazily built `SessionRunner` runtime per repo root, so a dispatched session
  stays steerable and answerable for as long as the extension lives
- `buildSessionPrompt`, `SESSION_TOOLS` — the shared child-prompt assembly and
  the `read`/`write`/`edit` allowlist
- Completion correlation: `finalAssistantText`, `pickAuthoredSkill`
  (reply-named first, single-fresh-skill fallback) for author sessions;
  raw-snapshot no-op detection for editor sessions
- `layerFor` is the test seam the runtime factory hangs off

## Does not belong here

- The flows, dialogs, and pre/postprompts — those live in
  `../interactive`; this module only supplies the agentic ports
- The `SKILL.md` grammar and the file store — those live in
  `../../modules/skill` and the extension composition root
- Session storage, transcripts, and lifecycle rules — the engine owns those
  (`@montflow/pi-sessions`); this module starts sessions and settles results
