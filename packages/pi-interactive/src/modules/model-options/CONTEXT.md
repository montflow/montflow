# Model-options module

Shared model-picker logic for `/mf-*` agentic flows: option builders,
catalogue resolution, subsequence filtering, and the menu-driven picker
with its agentic wrapper. The TUI widget itself stays in
`../../widgets/model-picker/`; this module is the non-TUI fallback plus
the option plumbing both paths share.

## Belongs here

- `ModelRef` / `ModelCatalog` / `ModelSource` (minimal Pi context slices)
- `modelOptions`, `resolveModelOptions`, `matchesFilter`
- `PICK_ANOTHER`, `pickModel`, `pickAgenticModel`

## Does not belong here

- Dialog ports (`InteractiveUi`, `ModelPickerFn`, `LoadingFn`) — `../dialogs/`
- TUI picker widget — `../../widgets/model-picker/`
- Child-agent execution — `@montflow/pi-effect`
