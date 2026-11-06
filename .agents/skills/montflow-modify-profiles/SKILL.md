---
name: montflow-modify-profiles
description: Modifies, updates, extends, or audits existing agent profiles in .agents/@montflow/profiles/. Use when the user wants to edit an existing profile, add content to a profile, audit a profile for quality, or update profile metadata.
id: 6be1129292870a51
author: Daniel
version: 1.2.1
license: MIT
groups:
  - profiles
dependencies:
  - executing-skills
  - grilling
---

# When To Use

Use when modifying, updating, extending, or auditing an existing agent profile. Includes editing PROFILE.md, adding instructions or checklist items, updating metadata, reviewing quality, or restructuring profile files.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Identify Target Profile

Confirm which profile to modify. If unspecified, ask the user. Locate the profile at `.agents/@montflow/profiles/<name>/`.

## 2. Load Current State

Read the profile's `PROFILE.md` in full: frontmatter (`name`, `description`, `model`, `skills`) plus body (`# Title`, `## Instructions`, `## Review Checklist`).

## 3. Audit (if applicable)

If the task involves quality review, assess against [montflow-create-profiles conventions](../montflow-create-profiles/SKILL.md):

- `name` is a kebab-case slug matching the directory name
- `description` is one line saying WHAT the agent is (role and job)
- `model` is a real `provider/model-id` or blank — never invented
- Every skill in `skills:` exists — check the names with `mf-skills list` (it prints each name and description) instead of scanning the store; `mf-profiles verify <name>` reports a declared skill that is not installed as a **warning**, not an error, and exits 0, so treat that warning as a fix item
- `## Instructions` is non-empty and actionable
- `## Review Checklist` has at least one verifiable item

Report findings to the user before proceeding.

## 4. Plan Changes

Outline the specific modifications needed:

- Which fields or sections change and how
- Whether the change alters what the agent is (update `description`) or only how it behaves (update `## Instructions`)
- Whether new skills must be referenced (discover them with `mf-skills list` first)

Present the plan to the user for confirmation before executing.

## 5. Execute Modifications

Apply changes using Edit/Write tools. Follow these conventions:

- Never rename the profile directory and never change the `name` field — the name is the identity
- Keep `description` saying WHAT the agent is (its role and job — it drives profile selection)
- Reference existing skills only (discover names with `mf-skills list`); drop unknown names instead of inventing them
- Keep at least one `## Review Checklist` item
- If `.agents/skills/montflow-create-profiles/SKILL.md` exists, follow its standards
- Edit only the named profile under `.agents/@montflow/profiles/` — do not touch anything else

## 6. Verify

Run the mechanical check first — it validates the file shape and reports the
skills declared in `skills:`:

```
mf-profiles verify <name>
```

Where the binary is not on `PATH`:

```
bun run --cwd packages/profiles cli verify <name> --dir "$PWD"
```

A declared skill that is not installed is a **warning**, not an error: the check
prints `1 warning` and still exits 0 (`mf-profiles verify` and `mf-prompts
verify` behave the same). Treat every warning as a fix item before the gate
passes — a check mark alone does not validate a declared skill. Then run through
[GATES.md](GATES.md) for what the verifier cannot judge, and fix any failures.

# Reference

- **Profile authoring standards**: [montflow-create-profiles](../montflow-create-profiles/SKILL.md)
- **Skill execution**: [executing-skills](../executing-skills/SKILL.md)
- **Profile creation**: [montflow-create-profiles](../montflow-create-profiles/SKILL.md)
