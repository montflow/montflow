# GATES

## Stage 0: Skill schema

- [ ] `bun run --cwd packages/pi-skills cli verify effect-services --dir $PWD` reports valid

## Stage 1: Rule alignment

- [x] `Context.Service` is the canonical tag API in `SKILL.md`, `GATES.md`, `templates`, and `examples`
- [x] `ServiceMap.Service` appears nowhere in the skill, including the frontmatter description
- [x] service test layers are built with `Layer.effectContext` and live in the service module
- [x] `Id` naming is stated and relative specifiers use `.js`
