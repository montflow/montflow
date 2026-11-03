# GATES

## Stage 0: Static

- [ ] `mf-specs author`, `spec_author`, and `/specs author` declare the same five inputs
- [ ] the binary renders and prints only; it contains no git worktree mutation

## Stage 1: Behaviour

- [ ] each flag reaches the template unchanged
- [ ] hidden values are neither required nor rendered
- [ ] `origin: other` requires `origin-branch`; `isolated: yes` requires `worktree-name`
- [ ] every invalid value names the flag, accepted values, actual value, and rerun
- [ ] the same answers through `mf-prompts` render the same text
