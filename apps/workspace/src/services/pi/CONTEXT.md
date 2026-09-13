# Pi service

Startup gate for the dashboard: proves the `pi` CLI resolves before the
grid renders. One `pi --version` shell-out with a short timeout; anything
but a clean exit reads as missing and `index.tsx` renders the missing-pi
page instead of the dashboard.

## Belongs here

- `isInstalled` (never fails, boolean out)
- `parseVersion` (pure stdout trim, tested)

## Does not belong here

- Skill listing or installs — those live in `services/skills/`
- Rendering — `components/missing-pi.tsx` owns the missing page
- The gate decision — `index.tsx` picks the component
