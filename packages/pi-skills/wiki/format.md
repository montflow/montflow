Write a valid `SKILL.md` in 5 minutes.

Every [skill](./skills.md) is one file at the path in [storage](./storage.md). Frontmatter is machine metadata; body is agent instructions.

## Frontmatter

```yaml
---
name: adversarial-review
description: Performs a hostile, bug-hunting code review that assumes the author made mistakes.
id: a1b2c3d4e5f6a7b8
author: Your Name
version: 1.0.0
groups:
  - refactoring
  - testing
dependencies:
  - executing-skills
---
```

1. `name` — directory-safe slug, must match the directory name.
2. `description` — one or two sentences saying WHEN to use the skill.
3. `id` — exactly 16 lowercase hex chars, immutable once set.
4. `author` — who maintains the skill.
5. `version` — SemVer string.
6. `groups` — browse tags. Omit the key when empty.
7. `dependencies` — frontmatter names of skills to load first. Omit the key when empty.

## Body

```markdown
# When To Use

Use when reviewing code and the user wants more than a polite pass.

# Pipeline

## 1. Isolate context

Review in a fresh session — never reuse the author's context.

## 2. Report findings

Write each defect with a code path, an input, and a state.

# Reference

Links to files in the skill directory the agent can look up on demand.
```

1. `# When To Use`, `# Pipeline`, `# Reference` — all three required.
2. Short sections with concrete steps — inputs, outputs, edge cases.
3. No filler — the body loads into agent context on every use.

1. Short sections with concrete steps — inputs, outputs, edge cases.
2. No filler — the body loads into agent context on every use.

## Verify

`/mf-skills` browse opens each skill's detail menu with a verify status
panel between the heading and the options: `✓ verified` or
`✗ not verified — N issues`. The check is mechanical
(`Skill.verifySkillFile`): required frontmatter fields, `name` matching
the directory, and the three body sections above. `Re-verify` re-runs it
on the file; `Transform to standard` (shown only while unverified) spawns
an agent to fix the shape without changing what the skill teaches.

## Parse rules that bite

1. Missing `name` falls back to the directory name.
2. Missing `description` reads as empty — the skill still lists.
3. `groups` / `dependencies` keep string items only; blank entries drop.
4. Malformed files are skipped from listings, never fatal.
5. `/mf-skills` round-trips the five modeled fields — extra frontmatter keys stay on disk only when edited by hand.
6. A skill can list fine while failing verification — listing is lenient, verification is strict.

## See also

- [Skills](./skills.md)
- [Storage](./storage.md)
- [Package](./package.md)
