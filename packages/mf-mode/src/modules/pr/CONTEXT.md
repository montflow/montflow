# PR module

The standard for an agent-written PR body and the checker that holds a body to
it before the worker publishes: seven `##` sections in a fixed order (Summary,
What changed, Decisions, Proof, Blast Radius, Verification, Follow-ups), at
most 40 lines, and one finding per gap with a one-sentence fix. Errors block
publishing; hints never do. It imports nothing, so CI runs
`scripts/pr-check.ts` with bare bun and no install.

## Does not belong here

- Reading stdin, flags and the exit code — those live in `../../../scripts/pr-check.ts`
- Publishing the PR or fetching its body — the worker's `gh` call owns that
