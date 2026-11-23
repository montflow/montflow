# Playbook module

The playbook model and its mechanical standard. Pure: no IO.

## Belongs here

- The `Playbook` shape (`name`, `description`, `title`, `skills`,
  `principles`, `playbooks`) and `decodeFile`
- `verifyFile` — the `PLAYBOOK.md` standard: readable frontmatter, `name` a
  slug equal to the directory, a non-empty `description`, exactly one
  `# Title`, a non-empty body after it, a non-empty `## Reply` when present,
  and every reference resolved against the `References` the caller gathered.
  A body with no list item (`1.` or `-`) is a warning, because some upstream
  playbooks are prose
- Store constants (`FILE`, `STORE_DIR`, and the skills and principles paths a
  reference resolves against)

## Does not belong here

- Reading any store — that is the `PlaybookStore` service
  (`../../services/playbook-store/`), which also gathers `References`
- The frontmatter grammar — that is `../frontmatter/`
