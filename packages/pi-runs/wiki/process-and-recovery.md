# Process and recovery

How many Pi sessions exist, where they run, and what survives a crash or a
clean shutdown.

## One process, many sessions

Every run gets its **own Pi `AgentSession`** (`pi.createAgentSession` over
`SessionManager.inMemory(root)`), but they all run as concurrent fibers inside a
**single OS process**. There is no child process per run and no `pi -p` spawn in
the runs engine.

```mermaid
flowchart TB
  subgraph P[One surface process]
    R[Runner] --> S1[AgentSession run-a]
    R --> S2[AgentSession run-b]
    R --> Reg[(active registry Map)]
  end
  Disk[(.agents/@montflow/runs/)] --- R
```

The process boundary is the **surface**, not the run:

- The Pi extension and the workspace TUI are separate processes, each with its
  own `ManagedRuntime<Runner>` and its own `active` registry.
- `steer` / `answer` only reach runs live in the _same_ process. The CLI (`mf-runs`)
  is one-shot and reports "not live" for anything it did not start.
- `liveRunIds` is the honest answer to "is something actually working"; a
  persisted `running` left by a dead process is excluded.

## When transcripts hit disk

- Pi emits `message_end` per completed message; each one is mirrored into
  `Store.append` by a background consumer on the runner's runtime.
- Partial/in-flight generations are **not** persisted — there is no delta
  logging.
- Because the mirror is async (queue → consumer), a hard kill can drop the last
  event or two that had not been flushed yet.

## Crash vs clean shutdown

| Event                     | On-disk status               | Receipt     | Resumable? |
| ------------------------- | ---------------------------- | ----------- | ---------- |
| Hard crash (SIGKILL, OOM) | `running` / `awaiting-input` | none        | yes        |
| Clean shutdown            | `cancelled`                  | `cancelled` | no         |
| Settle (agent finished)   | `done` / `failed`            | yes         | no         |

- **Hard crash:** the run stays non-terminal, the in-memory registry is gone, so
  `steer`/`answer` fail. `run_resume` verifies it as resumable, rebuilds an
  in-memory session, and replays the stored messages.
- **Clean shutdown:** the extension's `session_shutdown` handler interrupts
  every live run, which writes a `cancelled` receipt. That makes in-flight runs
  terminal and **not** resumable. This is different from a crash, by design.
- **Crash during `ask_user`:** the assistant tool-call message was persisted but
  its tool result was not. Replay still accepts the raw message, so resume can
  seed a session whose last assistant turn has an unanswered tool call — worth
  watching.
- **Crash between `receipt.md` and the `run.md` status rewrite:** `Store.load`
  and `verify` reject the run ("Receipt present but status is 'running'").
  Repair by deleting the dangling `receipt.md`; the run becomes resumable again.

## Write safety

1. Atomic writes (temp + rename) mean a reader never sees a half-written file.
2. A leftover `.lock/` from a crashed writer is reclaimed after 60s.
3. `Store.load` re-verifies the run and refuses inconsistent state.

## See also

- [Architecture](./architecture.md) for the components involved.
- [Session model](./session-model.md) for the status machine.
- [Storage](./storage.md) for the file formats and the Pi-format delta.
- [Index](./index.md) for the page map.
