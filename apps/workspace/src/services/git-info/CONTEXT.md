# Git info service

Platform adapter at the TUI composition-root boundary: shells out to git
and maps the output into `Workspace.Info`. Pure parsers (`parseBranch`,
`parseClean`) stay testable without a repo; `getInfo` never fails —
outside a repo the branch reads `unknown` and the tree reads clean.

## Belongs here

- `GitError` plus `runGit` shell-out
- Pure output parsers and `getInfo`

## Does not belong here

- Workspace identity shapes — those live in `@montflow/pi-workspace`
- Rendering — components read the resolved `Info`
