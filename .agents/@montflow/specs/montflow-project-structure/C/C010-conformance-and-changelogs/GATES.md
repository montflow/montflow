# GATES

## Stage 0: Workspace skills

- [ ] `bun run --cwd packages/pi-skills cli verify --dir $PWD` reports every skill valid
- [x] every changed skill carries a `CHANGELOG.md` entry for its new version
- [x] `montflow-typescript-project-structure` has the three required body sections and an unchanged `id`
- [x] no live reference to `typescript-conventions` or `typescript-result-over-throws` remains outside changelogs

## Stage 1: Spec bookkeeping

- [x] `bun run --cwd packages/pi-specs cli check --dir $PWD/.agents/@montflow/specs --name montflow-project-structure` reports no structural issues
