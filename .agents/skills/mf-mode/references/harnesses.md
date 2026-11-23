# Harnesses

mf-mode's skills, principles and playbooks name concepts, not one harness's tools. Read this file once per session and map each concept to your harness. When your harness has no row for a concept, do the step the plain way the row's last column gives, and say so in one line. Never pass a field or value your harness's tool schema rejects.

This file is written by montflow, not imported from pstack. A cell that says "check" was not confirmed for every version of that harness: look at the tool list your session actually offers.

## Concepts

| Concept | Claude Code | Codex | OpenCode | Pi | Cursor | Without it |
|---|---|---|---|---|---|---|
| Spawn a subagent | `Agent` tool (`subagent_type`, `model`, `effort`) | check: subagent support depends on the version | `task` tool | an extension such as pi-subagents | `Task` tool | Run the step yourself, in sequence, and say so. |
| Read-only subagent | `subagent_type: "Explore"`, and the brief says "do not edit files" | check | an agent configured without edit tools | check | `readonly: true` | Say "do not edit files" in the brief and check `git status` afterward. |
| Isolated subagent (its own checkout) | `isolation: "worktree"` | check | check | check | `environment: "cloud"` | Create a git worktree per worker and name it in the brief. |
| Background subagent | the default | check | check | check | `run_in_background: true` | Run it in the foreground. |
| A profile as a subagent (`mf-mode-generic-worker`, `mf-mode-comment-sicko`) | Pass the profile's model and paste `mf-profiles show <name>` into the brief, or install it as `.claude/agents/<name>.md` | Paste the profile into the brief | `mf-profiles` registers profiles as agents in OpenCode | Paste the profile into the brief | `subagent_type: "<name>"` when installed as an agent | Paste `mf-profiles show <name>` into the brief. |
| Run a seat on another harness | `mf-mode dispatch` (runs `claude -p`) | `mf-mode dispatch` (runs `codex exec`) | `mf-mode dispatch` (runs `opencode run`) | `mf-mode dispatch` (runs `pi -p`) | not supported | Run the seat natively on your own model and say so. |
| Todo list | `TodoWrite` | `update_plan` | `todowrite` | check | the todo tool | Keep the list in your reply and update it at each phase. |
| Ask the user a structured question | `AskUserQuestion` (absent in `-p` mode) | ask in plain text | check | ask in plain text | `AskQuestion` | Ask in plain text, with numbered options. |
| Loop or wake-up for long runs | `/loop`, or scheduled wake-ups | check | check | check | `/loop` | Keep working until the check passes; end the turn only with the reason you stopped. |
| Project skills | `.claude/skills/` (link `.agents/skills`) | `.agents/skills/` | `.agents/skills/` | check | `.cursor/skills/` | `.agents/skills/` |
| User skills | `~/.claude/skills/` | check | check | check | `~/.cursor/skills/` | Use the project directory. |
| Always-on rules | `CLAUDE.md`, or `AGENTS.md` | `AGENTS.md` | `AGENTS.md` | `AGENTS.md` | `.cursor/rules/*.mdc`, `AGENTS.md` | `AGENTS.md` |
| This workspace's transcripts | `~/.claude/projects/<slug>/<session>.jsonl`, the slug being the workspace path with each `/` and `.` turned into `-` | `~/.codex/sessions/` (dated folders of `rollout-*.jsonl`; filter by working directory) | check | check | `~/.cursor/projects/<slug>/agent-transcripts/` | Skip transcript reading and say so. |

## Models

Which harness and model run a role is per user, in `.agents/@montflow/mode/roles.json` (git-ignored). Never read or edit that file yourself: `mf-mode roles resolve <role>` returns one line per seat, already resolved for the harness you run in, and `mf-mode roles verify` rejects any model its harness does not run (`fable` under `codex`, a bare `gpt-5.5` under `opencode`). Model names are each harness's own: Claude Code takes `opus`, `sonnet`, `haiku`, `fable` or a `claude-*` id plus an effort; Codex takes OpenAI ids (`gpt-*`); OpenCode and Pi take `provider/model`.

`mf-mode` tells which harness you run in from the environment Claude Code, Codex and OpenCode set. When it cannot (Pi, or one harness started inside another), it refuses and asks for `--harness`. A session started by `mf-mode dispatch` carries `MF_MODE_HARNESS`, so a nested lead resolves correctly.

When a model is rejected at spawn time, never pass it again: fall back to the role's default in the Subagents section of the **mf-mode** skill, then the closest model of the same family, then the session's model, and say so.

## Features some harnesses lack

Review bots such as Bugbot comment on a pull request like any reviewer, so triage them with the forge command the step gives (`gh` by default). A step that needs a hosted feature your harness does not have, such as Cursor Automations or a cloud agent's dashboard, is skipped with one line, `Skipped: <step>. <reason>.`, and the run goes on. When a later step needs what the skipped step made, leave a placeholder and name it in that line.
