# Changelog

## [1.0.0] - 2026-10-13

### Added

- Initial release of `creating-pull-requests`.
- Guidelines for opening PRs (base/head, Conventional Commit titles, issue links, absolute-only media links).
- Publishing demo evidence as GitHub attachments via the `uploads.github.com/user-attachments` endpoint (no repo commit).
- Embedding rules (images via markdown, video as a bare URL player) and verification steps.
- PR hygiene gotchas: merged PRs cannot be reopened, relative links break on branch deletion, hooks on media-only commits.
- Cross-reference to `planning-git-commits` for committing/pushing the head branch and its hook pre-flight.
- `documentation/recording-ui-demos.md`: generic guidance for producing the video/screenshots (browser automation + encoding), deferring to a repo's own recording tooling when one exists.
