---
id: C099
name: review-phase
type: review
originator: user
size: small
depends-on: C005
related-tasks:
reviewer-profiles: effect-reviewer
status: complete
---

# Task C099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase C: the shipped prompt
templates, the loader replacing inline assembly, the two execute modes, and the
author/execute commands.

## Requirements

- Verify `packages/specs` contains no prompt or skill body in TypeScript and
  that `src/skills` is gone with no dead export left behind.
- Attack prompt loading: unknown name, missing file, stale file, invalid
  template, undeclared variable, and a prompt whose declared skills are not
  installed. Each must fail before dispatch with a fix.
- Verify `spec-create` and `spec-execute` declare the skills they need and that
  no template inlines a skill body.
- Verify `execute` begins an unstarted spec and resumes one in progress, always
  deriving state from `state` and `next`.
- Attack detection: exact vs prefix, ambiguity, detached HEAD, a branch with no
  prefix, a `.git` file pointing at a worktree gitdir, a missing `.git`, and two
  specs sharing a prefix. Every failure must list the candidates and tell the
  agent to ask the user; no silent pick.
- Verify `execute --name` never consults the branch, and the binary, host tool,
  and `/specs which` all use one resolver.
- Attack the review budget: a tiny-only phase must stop after one reviewer round,
  a mixed phase must use its largest task's budget, and no prompt path may open
  a fourth round. At the cap, remaining findings must be escalated, not dropped.
- Attack the modes: guided must never suppress a useful question, and
  autonomous must stop for every destructive action, very dangerous tool
  call, and undecidable decision. Both must keep dispatch, gates, review,
  locking, and verification identical.
- Verify the binary only renders and the host tools only dispatch through the
  shared executor; no copied child-run implementation.
- Verify the workspace prompt copies came from doctor and are byte-identical to
  the package.
- Write findings as the phase review round and resolve or escalate them before
  the phase is locked.

## Completion

- [ ] All findings are resolved or escalated with a reason
- [ ] Both modes and the doctor gate were exercised and recorded
- [ ] `bun run mf:gate` passes
- [ ] The review round is linked with `- Phase: C`
