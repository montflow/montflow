# GATES

## Stage 0: Skill schema

- [ ] `bun run --cwd packages/pi-skills cli verify typescript-modules --dir $PWD` reports valid
- [x] frontmatter `name` still equals the directory name and `version` incremented

## Stage 1: Rule alignment

- [x] no `layers/` group remains in `SKILL.md` or `GATES.md`
- [x] `structs` is listed in the group registry and groups are described as open-ended and plural
- [x] relative specifiers use `.js`
- [x] `CONTEXT.md` is stated as conditional and leaf-module-only, with the template
- [x] explicit return types are scoped to exported/public-API functions
