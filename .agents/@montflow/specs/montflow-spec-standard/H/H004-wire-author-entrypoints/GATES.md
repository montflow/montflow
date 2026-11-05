# GATES

## Stage 0: Static

- [x] `mf-specs author`, `spec_author`, and `/specs author` declare the same five inputs
- [x] the binary renders and prints only; it contains no git worktree mutation

## Stage 1: Behaviour

- [x] each flag reaches the template unchanged
- [x] hidden values are neither required nor rendered
- [x] `origin: other` requires `origin-branch`; `isolated: yes` requires `worktree-name`
- [x] every invalid value names the flag, accepted values, actual value, and rerun
- [x] the same answers through `mf-prompts` render the same text

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/specs test -- src/apps/cli/tests/author-execute.test.ts

- [x] the scoped package suite for this task passes
