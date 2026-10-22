## Phase 1: PR Metadata

- [ ] The head branch was committed and pushed through [planning-git-commits](../planning-git-commits/SKILL.md) (Conventional Commit messages, user confirmation, hook pre-flight) and the repo's verification gate passed
- [ ] PR is opened against the intended base branch with the intended head branch
- [ ] Title follows Conventional Commits
- [ ] Body references the issue (`Closes #N`) where applicable
- [ ] Body contains no repo-relative links to media or files (absolute URLs only)

## Phase 2: Evidence Attachments

- [ ] Every embedded image URL resolves to an image (HTTP 200, `image/*`) when authenticated
- [ ] Video is embedded as a bare attachment URL (renders as a player), not a GIF or a committed repo file
- [ ] No binary media was committed to the PR for evidence (`git ls-tree` on the head shows none)

## Phase 3: Durability

- [ ] Attachment URLs are absolute and remain valid after the head branch is deleted
- [ ] No attempt was made to reopen a merged PR
- [ ] Any temporary/scratch files used to build the body or media live in the gitignored `./tmp/` and were not committed
