# Frontmatter module

The frontmatter subset `PLAYBOOK.md` uses: scalar `key: value` lines and
`- item` lists (`skills`, `principles`, `playbooks`). A deliberate per-package
copy of the principles, profiles, and references parsers, so the store owns its
grammar. It records unreadable lines so `verify` reports a malformed block
instead of dropping the line.

## Does not belong here

- Field rules (`name`, `description`, references) — those live in `../playbook/`
