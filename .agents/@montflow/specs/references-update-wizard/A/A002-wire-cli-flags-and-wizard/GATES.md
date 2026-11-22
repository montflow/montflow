## Stage 0: Flags and wizard (mechanical)
command: bun run --cwd packages/references test -- src/apps/cli

- [ ] binary and slash update accept --ref, --latest, and --wizard, mutually exclusive
- [ ] wizard with --all is a usage error
- [ ] a --ref or --latest update prints the REFERENCE.md diff and leaves it uncommitted
- [ ] the wizard prompts for specific-commit or latest, shows subject and date before writing, and states when --force is needed
- [ ] non-TTY update with no target flag keeps today behaviour
- [ ] the wizard prompt and metadata display are separable for headless tests