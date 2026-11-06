# GATES

## Stage 0: Skills

- [x] both packaged `SKILL.md` files pass the full montflow standard verifier
- [x] each skill's frontmatter version equals its newest changelog entry
- [x] neither skill carries a registry table
- [x] both skills call `mf-references` / `/mf-references`
- [x] the add skill documents that a registered reference routes to `update`

## Stage 1: Doctor

- [x] missing skills are installed; stale skills are repaired; mismatched file sets are reported
- [x] a missing `.gitignore` entry and a missing `.gitkeep` are repaired
- [x] an invalid registry entry is reported with its entry and field
- [x] `--check` writes nothing and exits 1 when unhealthy
- [x] the embedded payload matches `skills/`
- [x] `doctor` does not fail when no clone exists
