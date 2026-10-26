# Which module

Mechanical answer to "which spec am I working on?". Given what git said about
the checked-out branch and the spec directory names that exist, it returns
exactly one name, or a coded miss listing the candidates. Pure — no IO, no
model, no guessing.

## Belongs here

- Branch grammar: `PREFIXES` / `Prefix` / `BRANCH_PATTERN`, `parseBranch`,
  `normalizeFeature`
- Git metadata text: `parseHead`, `parseGitFile`, `BranchSource`
- Matching: `matchFeature` (exact first, then a unique prefix pair, then a miss)
- The one resolver every caller shares: `resolve`, `WhichRequest`,
  `WhichResolution`, `WhichMatch`, `WhichMiss`
- Stable codes: `CODES` (`SPEC_NO_MATCH`, `SPEC_AMBIGUOUS`)
- `SPEC_FILE` — the marker that makes a directory a candidate

## Does not belong here

- Reading `.git` / `HEAD` from disk — the `cli` app owns it (`which`), and the
  host tool reuses that effect
- Rendering diagnostics — the agent-first diagnostic shape lives in `cli`
- Fuzzy, edit-distance, keyword, or description matching — never

## Consumers

- `mf-specs which` and `/specs which` (`apps/cli`)
- `mf-specs execute` when `--name` is absent (C003), through the same `which`
  effect — never a second copy of the matching rule
