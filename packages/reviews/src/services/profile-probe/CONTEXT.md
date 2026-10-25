# ProfileProbe service

Lazy bridge from a review's optional `Profile:` reference to the
`@montflow/profiles` extension. It runs `mf-profiles verify <name> --dir
<workspace root>` and reduces the result to a `ProbeOutcome`, so `mf-reviews
verify` can delegate profile verification instead of reimplementing the profile
format.

## Belongs here

- `ProfileProbe` (`verify`), `ProbeOutcome` (`passed` / `failed` /
  `unavailable`), and the shell-out `Default` / `layer` implementations
- Mapping a missing binary (`ENOENT` / `EACCES`) to `unavailable`, so callers
  warn instead of failing
- The tier of verification the reviews engine runs on a declared profile

## Does not belong here

- Review format rules — `modules/review` owns those
- Turning outcomes into issues or warnings — `apps/cli/engines` owns that
- Profile format rules — the profiles plugin owns those
- File IO — `services/review-store` owns the review store

## Layers

`Default` shells out to `mf-profiles`; no platform layer is required. Tests and
overrides use `layer(bin)`.
