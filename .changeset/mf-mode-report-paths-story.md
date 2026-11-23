---
"@montflow/mode": patch
---

The report's Paths diagram tells the run's story. The playbook heads a spine of the lead's steps in order, each with the skill or playbook it routed to, and each step lists the workers it spawned and the branches, PRs and commits they produced. mf-mode-observe asks for the attrs and refs the story reads: `skill` and `playbook` on `phase.start`, `playbook` and `skill` on `worker.start`, and produced refs on `phase.end` and `worker.end`. Old traces still render.
