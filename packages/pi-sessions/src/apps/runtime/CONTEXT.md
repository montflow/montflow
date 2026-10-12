# Runtime apps module

Surface runtime: builds the file-backed `SessionRunner` layer for the CLI and the Pi
extension.

## Belongs here

- `sessionRunnerLayer({ root, bridge })` — engine + `PiSessionFactory` + bridge, no requirements
- `createSessionRunnerHost({ layerFor, bridgeFor })` — lazily builds one session runner runtime
  per repo root and disposes them all (store stays local to its repo)
- `storeLayer(root)` — file-backed store rooted at the repo
- `ConsoleBridge` — headless toast/notify to stderr, ANSI/control-sanitized

## Rules

- Surfaces build one runtime per repo root and reuse it, so the session runner's
  live-session registry persists across commands.
- The workspace bridge is the only per-surface variation; the host binds it per
  root so notifications reach the dispatching session.
- `disposeAll()` is called on `session_shutdown` after live sessions are interrupted.
