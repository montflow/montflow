# Frontmatter module

The tolerant markdown frontmatter grammar shared by every file parser:
scalar `key: value` lines plus blank-value keys followed by `  - item`
list lines, with `#` comment lines skipped. Also the field readers
(`fieldString`, `fieldList`) that normalize scalars and comma-separated
lists.

## Belongs here

- `parseMarkdown`, `ParsedMarkdown`, `FieldValue`
- `fieldString`, `fieldList`

## Does not belong here

- Schema validation of the extracted fields — `spec` / `task` own that
- Body/section parsing — the owning module (`spec`, `gates`, `memory`)
