# @montflow/model-fallback

OpenCode plugin that walks a model fallback chain when a provider fails. When the
current model runs out of quota, rate limits, or rejects its key, the session
switches to the next configured model and continues — in place on the retry, or
by resuming after the failure — and records a visible note in the model history.

Three faces, all writing the same `opencode.jsonc` entry:

| Face                    | Use it for                                                    |
| ----------------------- | ------------------------------------------------------------- |
| `mf-model-fallback` CLI | Agents and scripts: show, set, verify, remove, doctor         |
| `model-fallback` prompt | Agentic setup: the agent presents live model choices and asks |
| `/mf-fallback`          | In-session dialogs: show, pick a chain, or remove it          |

## Enable it

```jsonc
// opencode.jsonc
{
  "plugins": [
    {
      "package": "@montflow/model-fallback",
      "options": {
        "chain": [
          "deepseek/deepseek-chat",
          "openrouter/anthropic/claude-sonnet-4",
          "anthropic/claude-haiku-4",
        ],
        "triggers": ["quota", "rate-limit", "auth"],
      },
    },
  ],
}
```

- `chain` — `provider/model` or `provider/model#variant`, ordered. The plugin
  never wraps: the last entry failing leaves the session where it is.
- `triggers` — defaults to `["quota", "rate-limit", "auth"]`; `timeout`,
  `provider-internal`, and `transport` are opt-in.

No chain means the plugin stays loaded and idle, and logs why.

## Local development install

The host installs a bare spec from npm, so a checkout has to be registered by
**absolute path** — relative paths are treated as npm specs too:

```jsonc
{
  "plugins": [
    {
      "package": "/abs/path/to/montflow/packages/model-fallback",
      "options": { "chain": ["deepseek/deepseek-chat", "opencode/glm-5.3-flash-free"] },
    },
  ],
}
```

The CLI recognises that entry (last path segment `model-fallback`) and updates it
in place, keeping the path. Restart the host after adding it; existing plugin
lists are resolved at startup.

## Configure it

Never hand-edit the entry; the CLI preserves the file's comments and other
plugins.

```sh
# What is configured now, and where
mf-model-fallback show

# Models this machine can actually run, favorites/recents first, plus a suggestion
mf-model-fallback models

# Write a chain (validated against the live catalog) and confirm it
mf-model-fallback set --chain deepseek/deepseek-chat,openrouter/anthropic/claude-sonnet-4
mf-model-fallback verify

# Remove only this plugin's entry
mf-model-fallback remove
```

Every command takes `--dir <workspace>` and `--json`; catalog commands take
`--server <url>` when the local service is not discoverable. `set` refuses models
the catalog does not list unless `--allow-unknown` is passed.

`models` requires a running host: only the host knows which providers have
credentials. It mirrors the model picker's `model.json`, so favorites and recents
lead the ranking, followed by the cheapest tools-capable model per provider.

## Agentic setup

`mf-model-fallback doctor` installs the packaged prompt into
`.agents/@montflow/pi-prompts/model-fallback.json`. Run that prompt and the agent
lists the live choices, asks which models you want and in what order, writes the
chain, verifies it, and reports the result.

`doctor --check` never writes and exits non-zero when the installed prompt is
missing, stale, or invalid; the repo gate runs it as `mf:check:model-fallback`.

## In-session

`/mf-fallback` opens the host dialogs: show the current chain, pick a new one
(model + up to three fallbacks, with context and cost per option), or remove it.
The summary lands in a modal.

## What the user sees when a fallback fires

1. `session.model.selected` writes its usual `model-switched` timeline separator.
2. A `synthetic` note — timeline label `Model fallback` — states the failed
   model, the failure, and the model now in use. It is durable, so replay keeps
   the explanation, and the model itself sees it on resume.

## How it decides

- **Retry hook** (`session.hook("retry")`): a matching failure switches the
  session model and flips the decision to `{ retry: true, delay: 0 }`, so the
  next attempt runs on the fallback instead of burning backoff on a model that
  is out of quota.
- **Terminal failure** (`session.execution.failed`): when retries are already
  exhausted the hook is never called, so the plugin switches, notes, and resumes
  the session with `resume: true`.
- Each session remembers the models it already abandoned, so a chain is walked
  once per session and never ping-pongs.

## Verification

```sh
bun run --cwd packages/model-fallback test
bun run --cwd packages/model-fallback ts:check
bun run --cwd packages/model-fallback lint:check
bun run --cwd packages/model-fallback cli doctor --check --dir <workspace>
```
