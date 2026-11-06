# GATES

## Stage 0: Skill schema

- [ ] `bun run --cwd packages/pi-skills cli verify montflow-typescript-project-structure --dir $PWD` reports valid
- [x] frontmatter `name` equals the directory name and `version` is `3.0.0`
- [x] frontmatter `id` is `19088d58133341e3`
- [x] `groups` and `dependencies` are YAML lists, not scalars

## Stage 1: Contract conformance

- [x] the body has exactly `# When To Use`, `# Pipeline`, and `# Reference`
- [x] every concrete module rule names its owning skill instead of restating it
- [x] `mimicking-conventions` is a dependency and is the pre-write pipeline step
- [x] `typescript-result-over-throws` is neither a dependency nor referenced
- [x] `SKILL.md` contains no reference to `typescript-conventions`
