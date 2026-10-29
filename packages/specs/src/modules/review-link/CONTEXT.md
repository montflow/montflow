# Review-link module

Pure convention binding a spec's per-phase `review` tasks to its review series
under `.agents/@montflow/reviews/`. A spec named `<name>` owns series `<name>`;
each declared reviewer profile adds `<name>-<profile>`. A phase's review lands
on one round attributed to that phase (`- Phase: <phase>` in the round's
`## Metadata`). The module never touches disk: the caller supplies the series
and their rounds.

## Belongs here

- Series naming: `seriesName`, `profileSeriesName`, `seriesNames`
- `roundForPhase` — the preferred round for a phase
- `roundPhase` — the phase a round file is attributed to, read from
  `## Metadata`; an attribution that is not a well-formed phase id (lowercased,
  decorated, or annotated) counts as no attribution
- `reviewPhases` — the phases carrying a `review` task
- `verify` — a complete `review` task has a round in every expected series, at
  one agreed round; optional, because a disk-driven `check` must not turn a
  historical spec red for predating the review store
- `verifyBudgets` — the mechanical review budget: a series may hold no more
  rounds attributed to a phase than that phase's size-derived budget
  (`review.budget-exceeded`), which is how the execute prompt's cap is enforced
  instead of merely stated; a round with no parsable attribution is a warning
  (`review.phase-unattributed`) instead of a silent exemption
- `PhaseBudget`, `SeriesSnapshot`, `ReviewTaskEntry`

## Does not belong here

- Deriving a phase's budget from task sizes — `sizing` owns `phaseReviewBudget`
- Reading the review store — the `SpecStore` service supplies the snapshots
- Deciding the reviewer profile set — `task` owns `reviewer-profiles`
