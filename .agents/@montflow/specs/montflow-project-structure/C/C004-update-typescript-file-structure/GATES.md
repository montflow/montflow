# GATES

## Stage 0: Skill schema

- [ ] `bun run --cwd packages/pi-skills cli verify typescript-file-structure --dir $PWD` reports valid
- [x] frontmatter `name` still equals the directory name and `version` incremented

## Stage 1: Rule alignment

- [x] relative specifiers use `.js` in `SKILL.md` and `GATES.md`
- [x] `src/index.ts` is documented as the entry carve-out
- [x] tests are described as colocated inside the module
