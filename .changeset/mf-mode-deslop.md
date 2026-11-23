---
"@montflow/mode": minor
---

mf-mode-deslop strips AI slop from the code a diff adds, before commit, in any harness. It removes narrating comments, guards the types already rule out, type escapes, one-caller wrappers, off-style code and debug leftovers, and keeps behavior. mf-mode, the opening-a-pr and autopilot-full playbooks, and mf-mode-help now point at it instead of the Cursor-only `/deslop` from cursor-team-kit.
