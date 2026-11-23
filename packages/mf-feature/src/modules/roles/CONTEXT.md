# Roles module

The roles model, its checks, and resolution. Pure: no IO.

## Belongs here

- `HARNESSES`, `ROLES`, `PANELS`, `BINARIES`, `EFFORTS`
- The `RolesFile` schema and `decode` (structure via Schema with every issue,
  excess fields refused, then `check`: known roles, one seat outside a panel,
  each model and effort accepted by its harness)
- Seat specs (`harness:model[:effort],…`): `parseSeat`, `formatSeat`
- `resolve` — first available candidate per seat; the current harness is
  `native`, an installed one is `dispatch`, none is `dropped`
- `detectHarness` — `MF_FEATURE_HARNESS`, else exactly one harness's markers

## Does not belong here

- Reading or writing the file — `../../services/roles-store/`
- Probing `PATH` or the environment — `../../services/host/`
