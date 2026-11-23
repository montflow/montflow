# Changelog

Releases: this package is versioned and tagged by changesets but never published to npm; run the CLIs from a git checkout.

## Unreleased

### Added

- The `mf-playbooks` CLI over the `.agents/@montflow/playbooks/<name>/PLAYBOOK.md` store: `doctor [--check]`, `list`, `show <name>`, and `verify [<name>] [--all]`, with agent-first output plus `--human` and `--verbose`
- `verify` checks readable frontmatter, a slug `name` equal to the directory, a non-empty `description`, one `# Title`, a non-empty body, and a non-empty `## Reply` when present; every `skills`, `principles`, and `playbooks` entry must exist under the same workspace root. A body with no list item is a warning
- The `opening-a-pr` playbook ships as `playbook` payload, adapted from pstack (MIT, see `LICENSE-pstack`), and `doctor` installs or repairs it
