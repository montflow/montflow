# Memory

## Context

Phase C002: the ask-first decision step that precedes the utility sections in
`guides/installation.md`.

## Progress

- Added Local mode step 2, "Choose which utilities to install", immediately after
  the dependency install and before any utility section.
- Stated the rule in bold: if the request does not name utilities, ask before
  writing anything; never install every utility by default; no install command
  runs until the answer is known.
- Added the question verbatim, one bullet per utility with its reason to want
  it, accepting `all`, `none`, or a subset.
- Added the outcome table: `all` → install-all recipe;
  `none` → workspace untouched, all five reported skipped; subset → only the
  named sections in guide order, the rest reported skipped; anything else →
  ask again, install nothing.
- Closed with the reporting rule: every answer ends with an explicit installed
  vs skipped list.

## Open Questions

- None.

## Handoff

- The subset row links to `#3-install-only-the-utilities-you-chose`; the `all`
  row links to `#4-install-everything-all-five`. Renaming either heading means
  updating that row.

## Deviations

- Added an "anything else → ask again" row that TASK.md does not list, so the
  flow has no judgement call on an unclear answer.
