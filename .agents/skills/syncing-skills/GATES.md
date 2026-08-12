## Phase 1: Installation Correctness

- [ ] All requested skills exist in target `.agents/skills/`
- [ ] Each installed skill has valid SKILL.md frontmatter with correct version
- [ ] `syncing-skills` is NOT present in target `.agents/skills/`
- [ ] Version in target matches source for installed/upgraded skills
- [ ] No source skills were skipped without user-facing reason — except legitimate §2.3 auto-skips where target is up-to-date (identical version AND byte-identical content per the diff check). Any ambiguous/changed case requires a prompt or explicit user decision (keep/downgrade/merge).

## Phase 2: Metadata & Documentation

- [ ] If target maintains a skill index: table exists at `$TARGET/AGENTS.md` with correct entries — otherwise skipped by user choice (AGENTS.md registration is optional per setup-agentic-repo)
- [ ] AGENTS.md table (if present) lists all installed skills (not `syncing-skills`)
- [ ] AGENTS.md entries (if present) have correct relative paths and descriptions
- [ ] Changelog entries preserved per user's merge instructions

## Phase 3: User Communication

- [ ] Installation summary reported to user
- [ ] User was asked about git commit if target is a repo
- [ ] Any version/content conflicts were presented to user for resolution
