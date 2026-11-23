# Frontmatter module

The frontmatter subset `PRINCIPLE.md` uses: scalar `key: value` lines and
`- item` lists. A deliberate per-package copy of the profiles and references
parsers, so the store owns its grammar. It records unreadable lines so
`verify` reports a malformed block instead of dropping the line.

## Does not belong here

- Field rules (`name`, `description`) — those live in `../principle/`
