# Runs app

Run dispatch for the agentic `/mf-skills` flows. An agentic port never
runs a child agent inline: it dispatches a `@montflow/pi-runs` run,
notifies the dispatching session, and unwinds the shared interactive
flow with `Interactive.DISPATCHED`. The run writes the `SKILL.md`; its
completion hook re-reads, canonically re-encodes, and notifies the
outcome — the same contract the workspace dashboard's skills panel
uses, so both surfaces behave identically.

## Belongs here

- `makeSkillRunPorts({ storeFor, layerFor })` — the generator, modifier,
  and transform ports the extension registers, plus `bind` (the session
  notify channel per working directory) and `shutdown` (interrupt live
  runs, then dispose runtimes)
- One lazily built `Runner` runtime per repo root, so a dispatched run
  stays steerable and answerable for as long as the extension lives
- `buildRunPrompt`, `RUN_TOOLS` — the shared child-prompt assembly and
  the `read`/`write`/`edit` allowlist
- Completion correlation: `finalAssistantText`, `pickAuthoredSkill`
  (reply-named first, single-fresh-skill fallback) for author runs;
  raw-snapshot no-op detection for editor runs
- `layerFor` is the test seam the runtime factory hangs off

## Does not belong here

- The flows, dialogs, and pre/postprompts — those live in
  `../interactive`; this module only supplies the agentic ports
- The `SKILL.md` grammar and the file store — those live in
  `../../modules/skill` and the extension composition root
- Run storage, transcripts, and lifecycle rules — the engine owns those
  (`@montflow/pi-runs`); this module starts runs and settles results
