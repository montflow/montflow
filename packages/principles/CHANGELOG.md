# Changelog

Releases: this package is versioned and tagged by changesets but never published to npm; run the CLIs from a git checkout.

## Unreleased

### Added

- The `mf-principles` CLI over the `.agents/@montflow/principles/<name>/PRINCIPLE.md` store: `doctor [--check]`, `list`, `show <name>`, and `verify [<name>] [--all]`, with agent-first output plus `--human` and `--verbose`
- `verify` checks readable frontmatter, a slug `name` equal to the directory, a `description` opening with `Apply when`, one `# Title`, and a non-empty body; a body past 60 lines is a warning
- The `fix-root-causes` principle ships as `principle` payload, adapted from pstack (MIT, see `LICENSE-pstack`), and `doctor` installs or repairs it
