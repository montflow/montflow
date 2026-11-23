---
"@montflow/mode": minor
---

Extend or replace a shipped playbook or principle from your own repository. Put the file in `.agents/@montflow/mf-mode/extensions/playbooks/<name>/PLAYBOOK.md` or `.agents/@montflow/mf-mode/extensions/principles/<name>/PRINCIPLE.md` and commit it. Without `extends`, it replaces the shipped entry of the same name or adds a new one. With `extends: <name>`, `mf-mode playbooks show` prints the shipped entry with the extension's lists unioned in and its body under `## Local additions`. `show` prints a `source=` line first and `list` marks every entry that comes from an extension. `mf-mode verify` checks extensions to the same standard, and `doctor` never touches the extension store.

Agents now read playbooks and principles only through `mf-mode playbooks show` and `mf-mode principles show`. A test fails any shipped skill that links a playbook or principle file instead.
