# Extension module

How a consumer repo extends or replaces a shipped playbook or principle without
touching the shipped copy. Pure: no IO.

The repo owns and commits
`.agents/@montflow/mf-mode/extensions/playbooks/<name>/PLAYBOOK.md` and
`.agents/@montflow/mf-mode/extensions/principles/<name>/PRINCIPLE.md`. mf-mode
only reads them: `doctor` never writes, repairs, or deletes there, and the
generated `.gitignore` block never ignores them.

## Belongs here

- `Source` — where a resolved entry came from: `shipped`, or an extension that
  `adds` a new name, `replaces` the shipped entry of its name, or `extends` a
  shipped target
- `resolve` — shipped entries plus extension entries in, what a reader sees
  out: one `Resolved` per name, extension over shipped, name-sorted, plus an
  `Issue` for each extension whose `extends` names no shipped entry (left out)
- The `extends` merge: the shipped document with the extension's `name`, its
  `description` when non-empty, each `Kind.lists` field unioned (shipped
  first, order kept), and the extension's body appended under
  `## Local additions` (no heading when the body is empty). Every other mode
  keeps the file bytes
- `provenance` — the line `show` prints first: `source=shipped`,
  `source=extension`, `source=extension replaces=<name>`, or
  `source=extension extends=<target>`
- `STORE_ROOT` — the extension stores' root

## Does not belong here

- Reading either store — that is the store services, through
  `../../services/markdown-store/`
- The `PLAYBOOK.md` / `PRINCIPLE.md` standard an extension is verified to —
  that is `../playbook/` and `../principle/`, run on the resolved document
- Each store's `Kind` (noun and list fields) and extension directory — those
  live in `../playbook/` and `../principle/`
