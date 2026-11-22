# Principle module

The principle model and its mechanical standard. Pure: no IO.

## Belongs here

- The `Principle` shape (`name`, `description`, `title`) and `decodeFile`
- `verifyFile` — the `PRINCIPLE.md` standard: readable frontmatter, `name` a
  slug equal to the directory, a non-empty `description` opening with
  `Apply when`, exactly one `# Title`, a non-empty body after it, and a
  warning (never an error) past `MAX_BODY_LINES`
- Store constants (`FILE`, `STORE_DIR`) and slug helpers

## Does not belong here

- Reading the store — that is the `PrincipleStore` service
  (`../../services/principle-store/`)
- The frontmatter grammar — that is `../frontmatter/`
