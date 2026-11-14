# GATES

## Stage 0: Packaged skills

- [x] `montflow-add-reference` and `montflow-find-reference` match the shipped `--help` output
- [x] both document add→update routing and the `--human` / `--verbose` modes
- [x] both pass `mf-skills verify` and their changelog version matches the frontmatter

## Stage 1: Skill surface

- [x] a repo-wide grep finds no `adding-references`, `finding-references`, `adding-vendor`, or `finding-vendor`
- [x] the `authoring-skills` groups table names the new skills
- [x] no non-`montflow-*` reference skill remains
- [x] `mf:check:skills` and `mf-references doctor --check` pass
