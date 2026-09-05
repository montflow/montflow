Inspect any workspace skill in 2 minutes — what it holds, what it never does, how it gets used.

A skill is a named instruction pack: one line saying when to use it, plus the body text an agent loads into context. Profiles reference skills by name; prompts attach them per run.

## What a skill holds

| Field          | Answers                                         |
| -------------- | ----------------------------------------------- |
| `description`  | When to use it, in one or two sentences         |
| `groups`       | Tags for browsing (`testing`, `refactoring`, …) |
| `dependencies` | Other skills to load first                      |
| `body`         | Instructions the consuming agent follows        |

## What a skill never does

1. Never activates itself — a consumer loads it.
2. Never runs code — text only, no tools or commands.
3. Never switches models.
4. Never resolves its own dependencies — consumers load those.

Storage only. This extension inspects and edits skills on disk; execution lives with the consumer. Details: [storage](./storage.md).

## How skills get used

```mermaid
flowchart LR
    S["SKILL.md on disk"] --> I["/mf-skills: inspect or modify"]
    I --> C["Consumer loads body into agent context"]
    C --> D["Dependencies load first, in listed order"]
```

1. Author under `.agents/skills/` — by hand, or let `/mf-skills create` spawn an agent from your description.
2. Browse with `/mf-skills` — pick a skill, then Show, Modify, or Delete (delete confirms first).
3. Reference by name from profiles (`skills:`) or prompts.
4. Import the Effect helpers instead of reimplementing slugs — see [package](./package.md).

## See also

- [Storage](./storage.md)
- [Format](./format.md)
- [Package](./package.md)
