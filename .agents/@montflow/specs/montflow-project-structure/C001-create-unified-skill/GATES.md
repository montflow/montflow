# GATES

## Stage 0: Skill schema

- [ ] `bun run --cwd packages/pi-skills cli verify montflow-typescript-project-structure --dir $PWD` reports valid
- [ ] frontmatter `name` equals the directory name and `version` is `3.0.0`
- [ ] frontmatter `id` is `19088d58133341e3`
- [ ] `groups` and `dependencies` are YAML lists, not scalars

## Stage 1: Contract conformance

- [ ] the body has exactly `# When To Use`, `# Pipeline`, and `# Reference`
- [ ] every concrete module rule names its owning skill instead of restating it
- [ ] `mimicking-conventions` is a dependency and is the pre-write pipeline step
- [ ] `typescript-result-over-throws` is neither a dependency nor referenced
- [ ] `SKILL.md` contains no reference to `typescript-conventions`
