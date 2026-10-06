# Verify module

Mechanical run verification — validity and resumability, like the profile and
feature verifiers.

## Belongs here

- `verifyRun` — pure check over raw `run.md` / `session.jsonl` / `receipt.md`
- `verifyStoreIgnored` — pure check that `.gitignore` ignores the runs path
- `VerifyIssue` / `VerifyResult` (`valid`, `resumable`, `issues`)
- `StoreIgnoreResult` (`ignored`, `issues`)

## Rules

- `valid` = well-formed: descriptor decodes, id matches dir, seq is 1-based and
  monotonic, receipt presence matches terminal status, outcome matches status.
- `resumable` = valid, not terminal, no receipt, status running/awaiting-input,
  and every event replays.
- Store ignore check: the last matching `.gitignore` rule wins, so a commented
  rule (or a later `!`) means "not ignored".
- Pure — no IO; `Store.verify` reads the files and the runner reads `.gitignore`.

## Does not belong here

- File reads — `Store.verify` / `Runner.verifyStore`
- Resume execution — the runner refuses when `resumable` is false
