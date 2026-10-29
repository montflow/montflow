# Build info

Answers "what build am I?" for one `mf-*` CLI: package name and version from the
owning `package.json`, plus git commit, dirty state, branch, and checkout root
from the checkout that contains the package.

## Belongs here

- Reading a package manifest without guessing or hardcoding a version.
- Read-only git facts (`rev-parse`, `status --porcelain`) behind Effect's
  `ChildProcess` service.
- Degrading to name/version/checkout when the package is not in a git checkout.

## Does not belong here

- Network calls, cache writes, or update decisions (see the update-check
  module).
- Rendering for a specific CLI; the CLI module owns the human and JSON forms.
