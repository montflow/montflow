---
name: creating-pull-requests
description: Creates and updates GitHub pull requests with correct base/head branches, Conventional Commit titles, and issue links, and publishes demo evidence (screenshots, video) as attachments instead of committing binaries. Use when opening a PR, writing or updating a PR title/body, or adding screenshots/recordings to a PR or comment.
id: eaf9966028e44088
author: Daniel Montilla
version: 1.0.0
license: MIT
dependencies:
  - executing-skills
groups:
  - workflow
  - git
---

# When To Use

Use when opening a GitHub pull request, writing/updating a PR title or body, or attaching demo evidence (screenshots, recordings) to a PR or PR comment.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Preconditions

1. Confirm auth and repo:
   ```bash
   gh auth status
   git rev-parse --show-toplevel
   ```
2. Make sure the head branch is committed and pushed, and note the base branch (`main` unless told otherwise). Commit only through [planning-git-commits](../planning-git-commits/SKILL.md) — it owns Conventional Commit messages, user confirmation, and the pre-flight hook check.
3. Confirm the working tree is clean (`git status --porcelain`) — don't ship stray scratch files.
4. Run the repo's verification gate and note the result for the body (montflow: `bun run verify:montflow`; the fast variant `bun run verify:montflow:fast` drops tests).

## 2. Compose the PR

- **Title**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat(web): …`, `fix(api): …`, `docs: …`) — same scope rules as [planning-git-commits](../planning-git-commits/SKILL.md).
- **Body**: what changed, how it was verified, and `Closes #NNN` for the issue.
- **Rules**:
  - Use **absolute URLs** for anything embedded. **Never** use repo-relative media links (`./path/to.png`): they break the moment the head branch is deleted and resolve to a compare page.
  - **Do not commit binaries** (screenshots, video) just to display them. Attach them instead (Step 4). Committing media bloats history and users generally don't want it in the repo.
  - Write the body to a file and pass `--body-file` to avoid shell-quoting issues. Keep scratch files in the repo's gitignored scratch dir (`./tmp/`), never committed.

## 3. Open the PR

```bash
gh pr create \
  --base main \
  --head <head-branch> \
  --title "<conventional title>" \
  --body-file ./tmp/pr-body.md
```

Print the resulting URL. Non-draft unless the user asks for a draft.

## 4. Publish demo evidence as attachments (no repo commit)

**Constraints you must know:**

- `gh` has **no** command to attach a file to a PR or comment (`--attach` only exists on gh ≥ the 2026-09 media release; older versions have nothing).
- `gh gist create` → `failed to upload <file>: binary file not supported`, and gists are **public** — wrong for private repos.
- Release assets are external hosting, and the image/video URL usually renders as a download link, not inline.

**Use GitHub's own attachment endpoint** (the same one drag-and-drop uses):

```bash
REPO=owner/name
FILE=./tmp/demo.mp4
MIME=video/mp4            # image/png for screenshots
RID=$(gh api "repos/$REPO" --jq .id)

curl -s "https://uploads.github.com/user-attachments/assets?name=$(basename "$FILE")&content_type=$MIME&repository_id=$RID" \
  -X POST \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/json" \
  --data-binary "@$FILE"
# -> {"url":"https://github.com/user-attachments/assets/<uuid>"}
```

**Embed the returned URL** in the body/comment:

- **Image**: `![alt](https://github.com/user-attachments/assets/<uuid>)`
- **Video**: put the URL **alone on its own line** — GitHub renders it as an inline player. Do **not** wrap it in a `<video>` tag (sanitized away) and do not substitute a GIF unless asked.
- Post to a PR/comment:
  ```bash
  gh pr comment <number> --body-file ./tmp/pr-comment.md   # comment on PR or issue
  gh pr edit <number> --body-file ./tmp/pr-body.md         # replace the PR description
  ```

## 5. Verify the media actually renders

Don't assume — check GitHub's own renderer and the resolved asset:

```bash
# How GitHub rewrites the markdown (expect an <img> for images, a video component for the bare URL)
gh api --method POST /markdown -f mode=gfm -f context=$REPO \
  -f text='![x](https://github.com/user-attachments/assets/<uuid>)'

# The image resolves to a signed private-user-images URL; fetch it (expect 200 image/*)
```

For a **private** repo the raw attachment is access-controlled: `404` unauthenticated, `302` authenticated — i.e. viewers with access see it, the public does not.

## 6. PR hygiene & gotchas

- **A merged PR cannot be reopened.** GitHub only reopens PRs that were *closed without merging*. Comments still work on merged PRs.
- Deleting a branch after merge leaves `refs/pull/<n>/head` — the commit may remain reachable until GitHub GCs it. Removing it entirely needs a GitHub Support request.
- Pushing a media-only commit can trip git hooks that expect the full toolchain; if so, and the user approved, use `git commit --no-verify` / `git push --no-verify` (see [planning-git-commits](../planning-git-commits/SKILL.md) for the hook pre-flight pattern).
- If the user later says "remove the media", close the PR, delete the branch (remote + local), and delete the bot comment:
  ```bash
  gh pr close <n> --delete-branch
  gh api --method DELETE /repos/$REPO/issues/comments/<comment_id>
  ```

# Reference

- **[planning-git-commits](../planning-git-commits/SKILL.md)**: Committing and pushing the head branch — Conventional Commits, user confirmation, and hook pre-flight (MUST READ before opening a PR).
- **[documentation/recording-ui-demos.md](documentation/recording-ui-demos.md)**: How to produce the video/screenshots this skill publishes (browser automation, encoding, seeding) (MUST READ when evidence must be generated).
- **[GATES.md](GATES.md)**: End-of-process validation (MUST READ).

# Documentation

- **[documentation/recording-ui-demos.md](documentation/recording-ui-demos.md)**: Recording UI walkthroughs — headless browser via Playwright, video + screenshots, data seeding, conversions.
