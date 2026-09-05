Write a valid `SKILL.md` in 5 minutes.

Every [skill](./skills.md) is one file at the path in [storage](./storage.md). Frontmatter is machine metadata; body is agent instructions.

## Frontmatter

```yaml
---
name: adversarial-review
description: Performs a hostile, bug-hunting code review that assumes the author made mistakes.
groups:
  - refactoring
  - testing
dependencies:
  - executing-skills
---
```

1. `name` — display name, usually matches the directory.
2. `description` — one or two sentences saying WHEN to use the skill.
3. `groups` — browse tags. Omit the key when empty.
4. `dependencies` — frontmatter names of skills to load first. Omit the key when empty.

## Body

```markdown
# When To Use

Use when reviewing code and the user wants more than a polite pass.

# Pipeline

## 1. Isolate context

Review in a fresh session — never reuse the author's context.

## 2. Report findings

Write each defect with a code path, an input, and a state.
```

1. Short sections with concrete steps — inputs, outputs, edge cases.
2. No filler — the body loads into agent context on every use.

## Parse rules that bite

1. Missing `name` falls back to the directory name.
2. Missing `description` reads as empty — the skill still lists.
3. `groups` / `dependencies` keep string items only; blank entries drop.
4. Malformed files are skipped from listings, never fatal.
5. `/mf-skills` round-trips the five modeled fields — extra frontmatter keys stay on disk only when edited by hand.

## See also

- [Skills](./skills.md)
- [Storage](./storage.md)
- [Package](./package.md)
