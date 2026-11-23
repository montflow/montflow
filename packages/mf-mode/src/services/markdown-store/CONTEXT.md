# MarkdownStore helpers

The directory reads the principle and playbook stores share: one directory per
entry, each holding one markdown file. Plain functions over the `FileSystem`
and `Path` a store already holds, not a service of their own.

## Belongs here

- `readEntries` — every directory in one store as `{ name, raw }`, undecoded,
  name-sorted; a missing store is empty. Both stores read their shipped
  directory and their extension directory through it
- `entryNames` — the directories across several stores that hold an entry
  file, for reference resolution

## Does not belong here

- Which directories a store reads — that is each store service
- Resolution and merging — that is `../../modules/extension/`
