# @montflow/reviews

Effect-first adversarial review primitives for OpenCode — the review _series_
and _round_ format, pure mechanical verification of a review file, a
`mf-reviews` CLI (a binary, and the same command in the host as
`/mf-reviews`), the `review_create` tool, and the
`montflow-adversarial-review` / `montflow-addressing-adversarial-review`
skills, shipped as package payload and installed by `doctor`.

```typescript
import { Review } from '@montflow/reviews';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const text = Review.renderRound({
    name: 'auth-refactor',
    round: '001',
    target: 'the auth refactor',
    created: '2026-10-12',
  });
  return Review.verifyRoundFile('001', text); // { valid: true, issues: [] }
});
```

## Review structure

A review lives in a **series** directory per target:

```
.agents/@montflow/reviews/<name>/
  REVIEW.md        # the series ledger: metadata + Rounds + Findings index tables
  001/
    REVIEW.md      # one round: that pass's findings and per-finding Discussion
  002/
    REVIEW.md
```

- A **round** is one review pass. The reviewer writes a new round directory
  (`001`, then `002`, …); the fixer edits the latest round in place. Nothing is
  ever overwritten.
- Every value is a `- Key: value` line or a table cell, and headings are fixed,
  so the file is cheap for an agent to read and cheap to verify mechanically.
- The series ledger indexes every round; `mf-reviews verify` checks that the
  ledger's tables agree with the round files.

The full contract is `Review.authoringRules()`.

## Commands

```bash
mf-reviews doctor [--check]                       # install / verify the skills
mf-reviews list [--verbose]
mf-reviews show <name> [--round <NNN>]            # the ledger, or one round
mf-reviews verify <name>|--all [--verbose]
mf-reviews create <name> [--target <text>] [--profile <name>] [--round <NNN>]
mf-reviews resume <name>                          # where an in-flight review left off
mf-reviews new <name>                             # alias of create
```

Inside OpenCode, the slash form is `/mf-reviews …`; from a shell it is
`mf-reviews …`. They are one CLI in two runtimes.

## Dispatch (in-session)

A short-lived CLI process cannot keep a spawned session alive, so a _spawned_
review is started from **inside the session**. The server plugin registers a
`review_create` tool:

```
review_create  name=<series>  [target=<what>]  [spec=<spec-slug>]  [profile=<name>]  [round=<NNN>]  [phase=<id>]  [model=<p/m>]
```

A **phase review** names `round=<NNN>` and `phase=<id>` so the review lands on the same round in every expected series and the round records which phase it reviews (`- Phase:`); without them the reviewer starts on the series' next free round with no phase attribution.

It ensures the series ledger exists, creates a native OpenCode session, and
prompts it with the `montflow-adversarial-review` instructions, returning the
session id. A dispatched profile also pins the session model, prepends the
profile's skills, and stamps the ledger. The review then runs in that session;
its outcome is the session's own execution event, so nothing montflow-owned
tracks or resumes it.

The `mf-reviews` **CLI**'s `create`/`new` only scaffold a series; the tool (or the
`/mf-reviews` command in-session) is what actually spawns a reviewer session.

`create` scaffolds a series and its first round; `resume` reports the latest
round and the open-finding count so an agent can pick a review back up. A series
may declare an optional `- Profile: <name>` in its ledger: `verify` asks the
`@montflow/profiles` plugin (`mf-profiles verify <name>`) whether that
profile exists and is valid. A profile that fails is an issue; a missing
profiles extension is a warning, not a failure.

A series is bound to **at most one** profile: pass `profile=<name>` to
`review_create` (or `--profile <name>` to `create`) to stamp it. A spec phase
that declares several `reviewer-profiles` gets one series per profile — named
`<spec>-<profile>` — with the general reviewer always keeping the `<spec>`
series. See
[`Migration: multi-reviewer reviews`](../specs/README.md#migration-multi-reviewer-reviews)
in the `@montflow/specs` README for the full change.

`verify` is pure over the file bytes: it reports every structural problem in one
pass, each with a `Fix:` line, and for an inconsistent ledger it prints the exact
table to paste.

## Skills

Two skills ship with the package and `doctor` installs them into
`.agents/skills/`, keeping them byte-identical to the package:

- `montflow-adversarial-review` — the reviewer half: writes a new round per pass
- `montflow-addressing-adversarial-review` — the fixer half: resolves findings in the latest round

```bash
mf-reviews doctor
```

## Status

Boilerplate (`0.0.1`, private). Source-only — no build step: a local-path
OpenCode install loads the `.ts` files directly. Run `bun install` from the
repo root for dependencies, then `turbo` `test` / `ts:check` cover this
package like the rest.
