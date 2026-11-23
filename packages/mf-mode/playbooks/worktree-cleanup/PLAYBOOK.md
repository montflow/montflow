---
name: worktree-cleanup
description: "Clean up a merged run and close its herdr workspace, or reclaim disk from unused worktrees and stale simulators."
---

# Worktree and simulator cleanup

Choose post-merge cleanup for the run's own worktree. Choose a disk-reclaim sweep for a set of worktrees, simulators, or caches. State the scope before running either path.

## Required gates for both paths

1. Snapshot and audit. Record `df -h /`. From the repository root, run `bash .agents/skills/mf-mode/scripts/worktree-audit.sh` and wait for the output. Pass `-b origin/<pr-base>` for post-merge cleanup or when the sweep targets a non-default base. Check that the audit covers each candidate from `git worktree list`. Hold unlisted candidates. Stop cleanup for the repository if the audit fails.
2. Cross-check every candidate against pinned and active chats from the operator or sidebar. A chat can use a sibling worktree through an arena or repro worker. A `safe` bucket can still belong to a pinned chat.
3. Resolve usage before deleting. For every `verify-recent-chat` row or uncertain candidate, delegate transcript checks to identify the chat and all worktrees it uses. Hold any candidate with unresolved usage, a pin, or another active session. The run may clean its own worktree after its work is complete. If you cannot obtain the pinned and active set, stop before deleting.

## Post-merge cleanup

1. Record the checkout path, local branch, remote and PR base. Confirm the PR is merged into that base and fetch the base. Check the local and remote branch tips against the fetched base. For a squash or rebase merge, verify the merge result is on the base and the tips match the merged PR head. Hold any tip with work outside the merge. Require empty `git status --porcelain --untracked-files=all` in the worktree.
2. Find the herdr workspace by its exact checkout path before removing the worktree. See **Close herdr last**. From a surviving checkout or the repository's common Git directory, run `git worktree remove <path>` without `--force`. If Git refuses, stop and investigate. Delete the verified local branch and its remote branch if present. If `git branch -d` refuses after a squash or rebase merge, recheck the exact tip against the merged PR before using `git branch -D`. Protect the remote deletion with `--force-with-lease=refs/heads/<branch>:<verified-oid>` so a later push blocks the deletion.
3. Keep `assets/<branch>` while a merged PR body still links to it. Check links that name the branch or pin a commit in its history. If you confirm no merged PR body links to assets on the branch, delete it. Keep the branch if the reference check is inconclusive.
4. Check `git worktree list`, the filesystem, the local refs, and `git ls-remote` for the remote refs. Confirm the checkout and intended branch refs are gone. If any check fails, report what remains and leave the workspace open. On retry, use the recorded checkout and workspace IDs, refresh the gates for remaining items, and verify items already absent. Close herdr last.

## Disk-reclaim sweep

1. Pause on irreversible loss. `wip:N` means N tracked uncommitted edits. Show the diff and get a decision before deleting them. For `scratch:N`, name the untracked files and confirm they are disposable. Hold open PRs and candidates in use. Confirm the remaining candidates are merged or abandoned.
2. Find matching herdr workspaces before removing the worktrees. Run `git worktree remove <path>` for each confirmed worktree and keep its branch refs. Use `--force` only after confirming exactly what it would discard. If files survive removal, inspect them before deleting them, then run `git worktree prune`. Re-list the worktrees and verify the paths are gone.
3. Reclaim simulators and caches within the requested scope. Use `xcrun simctl --set testing delete all` for XCTestDevices clones, `xcrun simctl delete unavailable` for unavailable devices, and `xcrun simctl runtime list` before deleting old runtimes with `xcrun simctl runtime delete <id>`. Other candidates include Xcode `DerivedData` and `iOS DeviceSupport`, Cursor's `state.vscdb.backup` and `snapshots/roots/<root>`, and package caches. Keep caches the operator asked to retain. Record `df -h /` again. Close herdr last.

## Close herdr last

- Use `herdr workspace list` and `herdr workspace get <id>` to match the exact checkout path. If worktree metadata is missing, match the original pane working directory from `herdr pane list --workspace <id>`. Check that list for sessions that would close with the workspace. Use the workspace ID, even if the label changes after Git removal. Hold ambiguous matches and workspaces with unrelated sessions. If herdr is absent or no workspace matches, record the skip. If herdr is in use but its commands fail, report the failed step.
- After cleanup verifies, close a matched workspace outside your session with `herdr workspace close <id>`. Confirm the workspace and its agent panes are gone. Use Git for removal, since `herdr worktree remove` can close the workspace before branch cleanup.
- If the target is `$HERDR_WORKSPACE_ID`, deliver the final reply before closing it. If the harness has a post-reply hook, have it call `herdr workspace close` from a surviving directory as the last action. Otherwise, arm a detached closer that waits for the final reply to appear in `$HERDR_PANE_ID`.

  Set `close_marker` to a fresh token that appears only at the end of the final reply. Keep it out of terminal output when arming the closer. Set `close_log` to a fresh absolute path outside the worktree. On herdr 0.9.5, use the command below. On herdr 0.7.4, use `herdr wait output <pane> --match <marker> --timeout 120000` for the wait.

  ```bash
  cd /tmp
  nohup bash -c 'herdr pane wait-output "$1" --match "$2" --timeout 120000 && exec herdr workspace close "$3"' \
    bash "$HERDR_PANE_ID" "$close_marker" "$HERDR_WORKSPACE_ID" </dev/null >"$close_log" 2>&1 &
  ```

  If the wait fails or the harness cannot display the reply in the pane, leave the workspace open. In the reply, report the self-close as scheduled. Verify it from another workspace when one is observing.

## Reply

Name the path you ran, its scope, the audit and chat checks, and the verified removals. Include worktrees, branches, and herdr workspaces where applicable. Report a scheduled self-close as pending and give its log path. For a sweep, include `df -h /` before and after and the space reclaimed. Name every skipped step and its reason, including any narrowed scope, held candidates, and retained asset branches.
