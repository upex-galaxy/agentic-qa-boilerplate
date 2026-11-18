# ADR-0029: The orchestration doctrine moves to the user-level skill `agent-orchestration`

- **Status:** Accepted (by the owner, 2026-11-18)
- **Date:** 2026-11-18
- **Deciders:** framework owner (boilerplate maintainer)
- **Tags:** orchestration, skills, installer, router
- **Supersedes:** none
- **Superseded by:** none

---

## Context

`orca-orchestration` was a T1 skill of this repo: 21 files, about 294 KB, synced into every project by `bun sync`. Most of it was generic doctrine (conductor cycle, worker contract, channel discipline, claims, gotchas) that any repo running a fleet needs, and the copies had drifted: the webapp, the three Bunkai repos and the Dev boilerplate each carried a different version, none identical to this one. Some of it was this repo's own (the launch seam of the workflow skills, worktree provisioning with `orca.yaml`, the identity hook, the Critical Rule numbers).

The owner decided on 2026-11-18 (decisions D1, D2, D2b and D3 of the move): rename the skill to `agent-orchestration`, keep its source in `upex-galaxy/agentic-user-skills`, install it at user level, keep the project-specific parts in the boilerplate, and load the skill by name through the `orca` row of the CLI mapping rather than through `REGISTRY.md`, the way `playwright-cli` loads.

## Decision

We will treat `agent-orchestration` as a T4 skill (`USER_LEVEL_SKILLS` in `cli/install.ts`) that `bun setup` installs and `bun sync` refreshes, loaded before any orchestration command by the `orca` row of `agent-tool-resolution.md` §6.5 and by the `[ORCHESTRATION_TOOL]` row of §6.

- This repo's parts live in `agentic-qa-core/references/fleet-launch-seam.md`, `fleet-provisioning.md` and `fleet-project-profile.md`, and cite the skill by name for the doctrine.
- `.agents/skills/orca-orchestration/` keeps only a five-line `SKILL.md` that points at the new skill; its other 20 files leave downstream projects through `RETIRED_SKILL_FILES`, each backed up first. The stub is removed once every repo has synced.
- The ROUTER row "orchestration detail" names `/agent-orchestration` in its "Then" column. The row kind does not change; the router lock moves to this ADR.

Router lock fingerprint for this change: `c42ccf96078c`.

## Consequences

- **Positive:** one source for the doctrine, with its own tests and history; a fix lands in every repo through the skill update instead of a sync per repo.
- **Negative / trade-offs:** a repo that synced and never re-ran `bun setup` has the stub and no skill until it does; `bun run setup:doctor` reports it. A downstream copy of the old `SKILL.md` that the project edited is not fast-forwarded by `bun sync --auto` and keeps the old body until it is replaced by hand. Anyone citing the old skill's files by path must rewrite the citation.
- **Neutral / follow-ups:** the profile keys `orchestrator_skills`, `message_verb` and `terminal_verb` are no longer read by the skill and stay in `.agents/project.yaml` until the owner retires them; the Dev boilerplate mirrors this change.

## Alternatives considered

- **Keep the skill in the boilerplate and sync it**. Rejected: the copies had already drifted, and the doctrine is not specific to a QA repo.
- **Move everything, project parts included**. Rejected: a user-level skill must not name a host repo's scripts, paths or rule numbers.
- **List the user skill in `REGISTRY.md`**. Rejected by D3: the registry indexes committed skills only.

## References

- `.agents/skills/agentic-qa-core/references/fleet-project-profile.md`, `fleet-launch-seam.md`, `fleet-provisioning.md`
- `cli/install.ts` (`USER_LEVEL_SKILLS`), `cli/update-boilerplate.ts` (`RETIRED_SKILL_FILES`), `cli/doctor.ts`
- ADR-0013 (the router lock), ADR-0017 (route adherence), ADR-0024 (permission posture)
