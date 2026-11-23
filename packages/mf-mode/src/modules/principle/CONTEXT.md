# Principle module

The principle model and its mechanical standard. Pure: no IO.

## Belongs here

- The `Principle` shape (`name`, `description`, `title`) and `decodeFile`
- `verifyFile` — the `PRINCIPLE.md` standard: readable frontmatter, `name` a
  slug equal to the directory, a non-empty `description` opening with
  its `Apply …` trigger (`Apply when`, `Apply before`, `Apply to`), exactly one `# Title`, a non-empty body after it, and a
  warning (never an error) past `MAX_BODY_LINES`
- Store constants (`FILE`, `STORE_DIR`, `EXTENSION_DIR`) and slug helpers
- `KIND` — how an `extends` extension merges a principle: no lists to union

## Does not belong here

- Reading the store — that is the `PrincipleStore` service
  (`../../services/principle-store/`)
- The frontmatter grammar — that is `../frontmatter/`
- Resolving extensions over shipped principles — that is `../extension/`
