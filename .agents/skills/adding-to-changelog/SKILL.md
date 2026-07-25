---
name: adding-to-changelog
description: Adds brief, compressed changelog entries following Keep a Changelog + SemVer. Creates CHANGELOG.md if missing. Handles unreleased, new version, or last-version targets. Compresses entries via caveman-compression. Outputs ADHD-friendly format. Use when user asks to update, add to, or maintain a CHANGELOG.md.
id: 698329d5f0e855f4
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
  - caveman-compression
  - i-have-adhd
groups:
  - documentation
  - conventions
---

# When To Use

Use when asked to update a CHANGELOG.md — add entry, create file, bump version, or maintain release notes.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.
>
> Also load [caveman-compression](../caveman-compression/SKILL.md) and [i-have-adhd](../i-have-adhd/SKILL.md) — this skill applies both.

# Pipeline

## 1. Ensure CHANGELOG.md Exists

If `CHANGELOG.md` does not exist at project root, create it:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
```

## 2. Determine Target Version

Ask user or infer from context:

| Scenario | Action |
|---|---|
| No version specified | Add under `## [Unreleased]`. Create heading if missing. |
| Bump requested (major/minor/patch) or release requested | Read last version from file. Bump per SemVer. Insert new dated heading **immediately below** `## [Unreleased]` (above the previous version). Move any `## [Unreleased]` entries into the new heading. Leave `## [Unreleased]` empty. |
| Specific version given | Add under that version heading. Create heading if absent. Date: ask user; if pre-release (MAJOR.0 not yet GA), omit date per Keep a Changelog convention. |
| Last version target | Read last version entry. Add under its heading. |
| Yank requested | Append ` [YANKED]` suffix to an existing version heading: `## [X.Y.Z] - YYYY-MM-DD [YANKED]`, or `## [X.Y.Z] [YANKED]` for date-less pre-releases. Preserve existing entries. |

> **Bump vs release**: "bump to X.Y.Z" and "release X.Y.Z" mean the same thing here — both move Unreleased entries into a new dated version heading. There is no separate "release" branch.

**SemVer rules:**
- MAJOR: breaking changes
- MINOR: new features, backward compatible
- PATCH: bug fixes, backward compatible
- Pre-release: append a dot-separated SemVer identifier — e.g., `-alpha`, `-beta.1`, `-rc.2`, `-0.3.7`. Build metadata after `+` is allowed.

**Date format:** `YYYY-MM-DD` per ISO 8601.

## 3. Classify Entry Type

Map change to one of six Keep a Changelog types:

| Type | When |
|---|---|
| `### Added` | New features, capabilities, files |
| `### Changed` | Changes to existing functionality |
| `### Deprecated` | Soon-to-be-removed features |
| `### Removed` | Removed features |
| `### Fixed` | Bug fixes |
| `### Security` | Vulnerability fixes |

## 4. Compress Entry

Run the full [caveman-compression](../caveman-compression/SKILL.md) pipeline on each entry body — remove scaffolding, keep essentials, apply smart heuristics, verify meaning preserved. Output compressed text only.

The entry sits under a typed heading (`### Added`, `### Fixed`, …) so the heading already conveys the action. **Do not re-prefix the verb.** Drop the leading verb from the bullet unless dropping it loses meaning.

**Examples** (showing the heading + compressed bullet):

- `### Added` — source *"Added a new feature that allows users to export their data as CSV files"*
  → `- CSV data export`
- `### Fixed` — source *"Fixed the issue where the login button was not working on mobile devices"*
  → `- Login button on mobile`
- `### Security` — source *"Updated the dependency on lodash from version 4.17.20 to 4.17.21 to address a security vulnerability"*
  → `- Lodash 4.17.20→4.17.21`

> **Warning:** Apply caveman-compression to entry bodies only — never to the Keep a Changelog header boilerplate, version headings, dates, or type headings.

## 5. Apply ADHD-Friendly Structure

Apply [i-have-adhd](../i-have-adhd/SKILL.md) rules to the response:

1. **Lead with the next action**: First line gives the reader a runnable next step (e.g., `Open CHANGELOG.md to review the new [Unreleased] entry`) — not a status report
2. **Number multi-step work**: If multiple versions or entries, list them as numbered steps
3. **End with one concrete next action**: Close with ONE thing the reader can do in under two minutes
4. **Make wins visible**: Show the exact entry/heading inserted verbatim (not "I added an entry"); the win goes in the body, not the opener
5. **No preamble/recap/closers**: No "Let me…", no "I've now…", no "Let me know if…"
6. **Specific time**: If user asks about effort, give a concrete estimate ("about 30 seconds per entry")

## 6. Insert Entry

Place entry in correct location in CHANGELOG.md:

```
## [Unreleased]          ← top (if targeting unreleased)

### Added                ← type heading (create if absent)

- Compressed entry text

### Fixed                ← another type, same version

- Another entry
```

**Rules:**
- Entries under same type heading are bullet lists (`- entry`)
- If type heading exists, append to it
- If type heading missing, insert in order: Added, Changed, Deprecated, Removed, Fixed, Security
- One entry per bullet — no sub-bullets
- Single blank line between sections

## 7. Verify

Run the gates in [GATES.md](GATES.md) before declaring done. Do not duplicate those checks inline.

# Reference

- **Keep a Changelog**: https://keepachangelog.com/en/1.1.0/
- **Semantic Versioning**: https://semver.org/spec/v2.0.0.html
- **caveman-compression**: ../caveman-compression/SKILL.md
- **i-have-adhd**: ../i-have-adhd/SKILL.md
