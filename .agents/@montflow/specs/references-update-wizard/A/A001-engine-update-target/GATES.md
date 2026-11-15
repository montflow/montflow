## Stage 0: Update target (mechanical)
command: bun run --cwd packages/references test -- src/modules/git src/modules/reference src/services/reference-store

- [ ] lifecycle update resolves a commit, tag, or branch ref against the remote before writing
- [ ] lifecycle update with --latest removes the ref line from REFERENCE.md
- [ ] an unresolvable ref or branch refuses with refused and writes nothing
- [ ] --ref and --latest are mutually exclusive in the engine
- [ ] the REFERENCE.md change is left uncommitted
- [ ] the dirty-clone --force refusal is preserved
- [ ] commit subject and date are readable at the lifecycle level for the wizard