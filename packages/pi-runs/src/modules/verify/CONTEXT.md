# Verify module

Mechanical run verification — validity and resumability, like the profile and
feature verifiers.

## Belongs here

- `verifyRun` — pure check over raw `run.md` / `session.jsonl` / `receipt.md`
- `VerifyIssue` / `VerifyResult` (`valid`, `resumable`, `issues`)

## Rules

- `valid` = well-formed: descriptor decodes, id matches dir, seq is 1-based and
  monotonic, receipt presence matches terminal status, outcome matches status.
- `resumable` = valid, not terminal, no receipt, status running/awaiting-input,
  and every event replays.
- Pure — no IO; `Store.verify` reads the files and calls this.

## Does not belong here

- File reads — `Store.verify`
- Resume execution — the runner refuses when `resumable` is false
