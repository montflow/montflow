# Doctor apps module

`mf-prompts doctor` — install and keep current the skills an agent needs to
author and execute prompts. Inside Pi, the same command is `/mf-prompts doctor`.

## Belongs here

- `runDoctor(root, { check, invocation })` — checks `<root>/.agents/skills/`
  against the package payload and, unless `check`, repairs what it finds
- `readPayload(fs, path, name, shippedDir)` — the payload for one skill, with
  its origin (`package` or `embedded`); undefined when neither source has it
- `doctorMessage(result)` — the full per-skill report
- `doctorGateMessage(result, invocation)` — the two-line message `execute` shows
- `SKILL_NAMES` / `installedSkillDir` / `shippedSkillsDir` — identities and paths
- `embedded-payload.generated.ts` — the payload, generated (see below)

## Rules

- **Two checks per skill, not one.** _Presence_ — is it installed at all — is
  the obvious failure. _Freshness_ — do its bytes still match the package —
  matters just as much: a stale `SKILL.md` teaches an agent rules the verifier
  no longer enforces, and that fails later and further from the cause.
- **The payload has two sources, and the filesystem wins.** `readPayload`
  prefers a readable package directory and falls back to
  `EMBEDDED_SKILL_PAYLOAD`. Preferring disk means editing a skill in a source
  checkout takes effect with no regeneration step.
- **`check` mode never writes.** `execute` uses it to ask "are the skills
  usable?" without mutating the repo mid-run; `doctor --check` exposes it to a
  human who wants a read-only answer.
- **`invocation` is threaded into the report.** The binary's fix line reads
  `Run: mf-prompts doctor`; the slash command's reads
  `Run: /mf-prompts doctor`. One needs a leading slash and one must not
  have it, so it cannot be hardcoded.
- **Statuses are per skill** — `ok`, `missing`, `stale`, `mismatched`,
  `installed`, `repaired` — and the aggregate is `ok` / `repaired` / `drifted`.
  `repaired` and `installed` count as usable: doctor fixed it, so the run can
  proceed.
- Self-contained Effect: provides its own `NodeFileSystem` / `NodePath`, so
  adding the gate to `execute` gains no new layer requirement.

## The embedded payload

`embedded-payload.generated.ts` holds the `skills/` files verbatim, written by
`bun run generate:payload` (`scripts/generate-embedded-skills.ts`, which
`build:cli` runs before compiling).

It exists for exactly one reason: under `bun build --compile` the package
directory does not exist at runtime, so `import.meta.dirname` resolves _inside_
the bundle and the binary could neither install nor verify the skills — leaving
`execute` permanently blocked by its own gate.

**A stale embed is the dangerous failure**, which is why:

- the filesystem is always preferred, so the embed only matters to a compiled
  binary
- `tests/embedded-payload.test.ts` asserts the embed equals `skills/` byte for
  byte, so editing a skill without regenerating fails the suite

Regenerate after any skill edit:

```bash
bun run --cwd packages/pi-prompts generate:payload
```

## Does not belong here

- Command parsing/output — `apps/cli`
- Prompt file reads/writes — `services/prompt-store`
