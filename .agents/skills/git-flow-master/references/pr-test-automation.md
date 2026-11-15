# Pull request: test automation

> Template `/git-flow-master` uses when the active branch matches `test/*`, and for the final suite PR of an `sdet` strategy. Placeholders in `<<ANGLE_BRACKETS>>` are session variables filled at PR creation. Any that remain after substitution stay visible for the author to complete before posting.

## Summary

<<SUMMARY>>

## Changes

<<CHANGES>>

## Test Plan

<<TEST_PLAN>>

## Traceability

- Issue: <<ISSUE_KEY>> (<<ISSUE_URL>>)
- ATP: <<ATP_LINK>>
- ATR: <<ATR_LINK>>
- TCs covered: <<TC_LIST>>

## Evidence

<<EVIDENCE>>

## Merge danger

<<RISK>>

## Checklist

- [ ] Tests pass locally (`bun run test`)
- [ ] Type-check clean (`bun run types:check`)
- [ ] Lint clean (`bun run lint:check`)
- [ ] No AI attribution in commits
- [ ] Traceability links verified

`<<EVIDENCE>>` and `<<RISK>>` follow the rules in `pr-templating.md` (Evidence ranked by weight; Merge danger as door plus blast radius). A test-only PR is usually a two-way door with a blast radius of `tests`, unless it changes a shared fixture or the CI configuration.
