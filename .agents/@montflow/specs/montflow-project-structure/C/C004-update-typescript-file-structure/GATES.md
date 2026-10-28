# GATES

## Stage 0: Skill schema

- [ ] `bun run --cwd packages/pi-skills cli verify typescript-file-structure --dir $PWD` reports valid
- [ ] frontmatter `name` still equals the directory name and `version` incremented

## Stage 1: Rule alignment

- [ ] relative specifiers use `.js` in `SKILL.md` and `GATES.md`
- [ ] `src/index.ts` is documented as the entry carve-out
- [ ] tests are described as colocated inside the module
