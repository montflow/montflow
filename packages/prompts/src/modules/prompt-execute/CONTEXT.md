# Prompt-execute module

The two halves of _using_ a stored prompt: look at it (`inspect`), then run it
(`execute`). `../prompts/` owns the file shape and renders templates; this
module owns what a caller must supply and what to tell them when they have
not.

## Belongs here

- `inspect({ prompt, values })` — a flat, display-ready summary: metadata, one
  entry per variable with its effective value, and the required values still
  missing
- `table(summary)` — that summary as aligned plain text
- `execute({ prompt, model, values, skills })` — resolves a run to an
  {@link ExecutePlan}, or blocks it with a message written for whoever asked
- `ExecutePlan` / `ExecuteReady` / `ExecuteBlocked` / `ExecuteProblem`
- `ExecutionRequest` and the `PromptExecutor` port that dispatches one

## Does not belong here

- The prompt file shape, the `variables` schema, template rendering, and file
  verification — that is `../prompts/`
- Template parsing and the grammar — that is `../template-engine/`
- Running an agent — the extension injects a `PromptExecutor`; this module
  never touches a model
- Persistence, dialogs, and command parsing — `../../services/`, `../../apps/`

## Constraints

- **`execute` is pure and returns a plan, never a run.** Validation an agent
  has to satisfy is then testable without a model, and the same plan drives
  the CLI, the TUI, and a Pi tool.
- **Check order is deliberate**: empty template → unparseable template →
  missing model → missing required values. The cheapest decisive check runs
  first so a blocked plan names _one_ real problem instead of a pile.
- **Messages are self-contained.** Every blocked plan names the flag to pass
  _and_ the file to edit, because the reader is usually an agent that has
  neither the skill loaded nor the conversation that produced the prompt.
- **A model is required, from the caller or the prompt.** `execute` falls back
  to the prompt's own `model` before blocking, so a pinned prompt runs without
  the caller repeating it.
- **`table` emits plain text, never ANSI.** Agent tool results read the same
  string a human does; escapes would be noise.
