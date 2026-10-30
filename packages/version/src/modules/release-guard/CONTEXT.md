# Release guard

Constants shared by the release-guard script and its tests: the five CLI package
names and the sentence each CHANGELOG must carry.

## Belongs here

- The fixed CLI list and the release-versus-checkout marker.

## Does not belong here

- Reading the workspace or deciding failures (the `scripts/check-release.ts`
  composition point).
