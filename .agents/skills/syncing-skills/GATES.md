# GATES

Validation gates for the guided-installer flow (`npx skills`-driven). Run through these after every sync.

## Phase 1: Installation Correctness

- [ ] Repo skill list fetched successfully (`npx skills add montflow/montflow --list`, or API fallback)
- [ ] Full available list presented to the user before any install
- [ ] Only user-selected skills installed — no unrequested installs
- [ ] Requested names validated against the fetched list; unknown names warned about and dropped
- [ ] Install target confirmed with the user (agent + project/global) before running install
- [ ] Each installed skill has valid SKILL.md frontmatter (name + description) at the target
- [ ] `syncing-skills` never appears in installs (internal marker) and is never installed into a target

## Phase 2: Metadata & Documentation

- [ ] If the target maintains a skill index: table exists at `$TARGET/AGENTS.md` with correct entries — otherwise skipped by user choice (AGENTS.md registration is optional per setup-agentic-repo)
- [ ] AGENTS.md entries (if present) have correct relative paths and descriptions

## Phase 3: User Communication

- [ ] Available skills presented before install
- [ ] Selection confirmed before running the install command
- [ ] Post-install summary reported (skill, version, location)
- [ ] User was asked about git commit if the target is a repo
