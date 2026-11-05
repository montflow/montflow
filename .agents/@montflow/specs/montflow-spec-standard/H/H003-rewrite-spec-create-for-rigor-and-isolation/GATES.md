# GATES

## Stage 0: Static

- [x] the prompt declares `rigor`, `isolated`, `origin`, `origin-branch`, and `worktree-name` in first-appearance order
- [x] every conditional uses the G001 `when` form and its template guard matches
- [x] the prompt loads `using-git-worktrees` and never runs `git worktree add` directly

## Stage 1: Behaviour

- [x] `isolated: no` renders no origin or worktree token
- [x] `isolated: yes` renders origin and worktree/branch
- [x] `origin: other` renders the freeform branch and no other origin path does
- [x] the profile, skill, and prompt agree on the five rigor names
- [x] the doctor payload matches the packaged prompt bytes

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/specs test -- src/modules/prompt/tests/prompt.test.ts

- [x] the scoped package suite for this task passes
