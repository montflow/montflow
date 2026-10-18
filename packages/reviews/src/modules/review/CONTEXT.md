# review

The review artifact standard: parsing, mechanical verification, and scaffolding
for a review _series_ (`.agents/@montflow/reviews/<name>/REVIEW.md`) and its
_rounds_ (`<NNN>/REVIEW.md`).

## Belongs here

- The on-disk shape: file names, section headings, finding fields, and enums.
- Pure parsers (`parseRound`, `parseSeries`) and verifiers
  (`verifyRoundFile`, `verifySeriesFile`).
- Renderers that build a valid scaffold and the series tables.

## Does not belong here

- Filesystem reads and writes — that is `services/review-store`.
- Cross-file consistency between a ledger and its rounds — that is the CLI /
  doctor engines.
