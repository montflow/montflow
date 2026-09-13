# Workspace module

Workspace identity for the dashboard. One `Info` equals the current working
directory plus its git state (branch, clean/dirty).

Singular name per the TypeScript modules skill (`workspace` → `Workspace`).
The class is `Info`, so the call-site reads `Workspace.Info` — no stutter.

## Belongs here

- `Info` Schema Class plus `decodeUnknown` boundary helper
- Pure helpers (`make`, `basename`, `summarize`, `title`)

## Does not belong here

- Dashboard selection state — that lives in `../dashboard/`
- Git IO — the git-info service (`../../services/git-info/`) reads git and
  maps it into `Info`
- Rendering — components read the resolved `Info`
