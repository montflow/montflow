# GATES

## Stage 0: Packaged skills

- [ ] `montflow-add-reference` and `montflow-find-reference` match the shipped `--help` output
- [ ] both document add→update routing and the `--human` / `--verbose` modes
- [ ] both pass `mf-skills verify` and their changelog version matches the frontmatter

## Stage 1: Skill surface

- [ ] a repo-wide grep finds no `adding-references`, `finding-references`, `adding-vendor`, or `finding-vendor`
- [ ] the `authoring-skills` groups table names the new skills
- [ ] no non-`montflow-*` reference skill remains
- [ ] `mf:check:skills` and `mf-references doctor --check` pass
