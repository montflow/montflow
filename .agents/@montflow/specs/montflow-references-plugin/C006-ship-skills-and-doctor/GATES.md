# GATES

## Stage 0: Skills

- [ ] both packaged `SKILL.md` files pass the full montflow standard verifier
- [ ] each skill's frontmatter version equals its newest changelog entry
- [ ] neither skill carries a registry table
- [ ] both skills call `mf-references` / `/mf-references`
- [ ] the add skill documents that a registered reference routes to `update`

## Stage 1: Doctor

- [ ] missing skills are installed; stale skills are repaired; mismatched file sets are reported
- [ ] a missing `.gitignore` entry and a missing `.gitkeep` are repaired
- [ ] an invalid registry entry is reported with its entry and field
- [ ] `--check` writes nothing and exits 1 when unhealthy
- [ ] the embedded payload matches `skills/`
- [ ] `doctor` does not fail when no clone exists
