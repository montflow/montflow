# Fallback-config module

The `options` block a user writes in `opencode.jsonc`, decoded into something
the plugin can act on.

```jsonc
{
  "package": "@montflow/model-fallback",
  "options": {
    "chain": ["deepseek/deepseek-chat", "openrouter/anthropic/claude-sonnet-4"],
    "triggers": ["quota", "rate-limit"],
  },
}
```

## Belongs here

- `Options` — the JSON shape
- `decode` — schema decode, model parsing, trigger validation; fails with
  `InvalidOptions` rather than guessing
- `idle` — the empty configuration that keeps the plugin registered but inert

## Does not belong here

- Chain walking — `model-chain`
- Trigger semantics — `fallback-trigger`
