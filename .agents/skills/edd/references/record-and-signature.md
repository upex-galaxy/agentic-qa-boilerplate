# The record and the signature

Two artifacts carry a delivery's evidence. The **record** is the gate's full account of one push, kept on the machine. The **evidence commit** is the signed, permanent part, kept in git history and checked by CI. This file says what each holds, what the pair proves and what it cannot.

## The record

| Property | Value |
|---|---|
| File | `<primary-root>/.session/evidence/<head-sha>.json`. The primary root is the parent of `git rev-parse --path-format=absolute --git-common-dir`, so a worktree session writes where durable state lives |
| Artifacts | `<primary-root>/.session/evidence/artifacts/<subject-sha>/`: traces, screenshots, transcripts |
| In git | never; `.session/` is ignored |
| Writer | `bun run edd gate` (pre-push hook) and `bun run edd verify --ci` (CI). The agent never writes it |
| When | every push the hook sees and every CI run of the verifier; the CI copy goes to the job summary and an Actions artifact |

The schema is `edd-evidence/1`. Its sections, in order:

| Section | Says |
|---|---|
| `subject` | the code commit, its tree, the patch-id of `base...sha`, the merge base, branch and repository |
| `push` | the remote ref, the flow (`direct`, `pr`, `chain`) and where the gate ran (`pre-push`, `ci`) |
| `contract` | digest of the merged contract, the ref it was read from, the computed depth and why |
| `static` | per check: command, exit code, duration, hash of the output |
| `agentic` | the evidence commit, its signature status and signer, and per check the verdict, who gave it, the environment, each artifact's hash and size, and the tester's free-text claim, marked as a claim |
| `ready` | CI only: open review threads, review-bot state, assignee, tracker link, title |
| `touches_gate` | whether the change touches `evidence.human` paths or keys, and which |
| `producer` | hash of the gate script that wrote it, worktree and session |
| `result` | `pass` or `fail` |

How a person sees it: in a PR, the body's evidence section is rendered from the record (`bun run edd render --pr`) and the CI verifier keeps one sticky comment with the verified copy. After a direct push the hook prints the record path and a one-line verdict, and `git log --format='%(trailers:key=Evidence-Digest)'` lists every attested push. Heavy artifacts are published for a person separately; the record holds only their hashes.

## The evidence commit

After the agentic run, the author or tester session runs `bun run edd attest`. The script, not the agent, hashes every artifact, checks that each required agentic check left at least one artifact of its `kind`, that traces and screenshots are newer than the code commit and that traces hit the host of the declared environment. Then it creates an empty, signed commit on top of the code:

```
test(evidence): attest 1a2b3c4 standard

{"schema":"edd-agentic/1","subject":"1a2b3c4...","patch_id":"9f..","depth":"standard",
 "contract_digest":"sha256:..","checks":[{"id":"changed-specs","verdict":"pass","verdict_by":"<tester label>",
 "env":"staging","artifacts":[{"path":"trace.zip","sha256":"..","bytes":40211}]}]}

Evidence-Subject: 1a2b3c4...
Evidence-Patch-Id: 9f...
Evidence-Digest: sha256:<of the JSON line above>
Worktree: <name|primary>
Session: <label>
```

Normal hooks run on it. The forensic trailers stay last.

## What CI verifies

The check `edd/evidence` runs the verifier from the **base** branch's code (`pull_request_target`), reading the PR's commits as data and never running them, so a PR cannot edit the verifier that judges it. The ruleset requires that check from the GitHub Actions app, so a status posted with a personal token does not count. A PR can still add a workflow of its own with a job of the same name: it comes from the same Actions app, and GitHub accepts its green check. See the table below. When the real verifier runs, it enforces:

| Rule | Why |
|---|---|
| the evidence commit changes no file (its tree equals its parent's) | evidence never smuggles code |
| its subject is the commit below it, or the patch-id still matches | a clean merge of the base keeps the evidence; any change to the PR's own diff voids it |
| the signature is valid against the allowed-signers list read from the base | a PR cannot add its own key |
| the contract digest matches the base's contract | a PR cannot weaken its own contract |
| recomputed depth is not above the attested depth | the attest cannot under-declare |
| every `verdict_by` differs from the `Session:` trailer of the code commits | the author is not its own tester |

Static checks run as ordinary required CI jobs next to it.

## What this can and cannot guarantee

The gate protects against mistakes and drift, not against an agent that deliberately forges a check. An agent that follows this doctrine cannot push red code, attest the wrong diff or test its own work without the gate noticing. An agent that sets out to cheat, using the owner's identity, can.

| Caught: mistakes and drift | Not caught: an agent that deliberately forges |
|---|---|
| a static check that fails: the pre-push gate re-runs it and CI runs it again | a green `edd/evidence` posted by a workflow the PR itself adds: same Actions app, same name, so the ruleset accepts it |
| evidence attested for another diff, or left stale by a later code change (patch-id) | a weakened static level: the static jobs run the PR's own workflow files and `package.json` scripts, so a PR that edits them is judged by its edited checks |
| a contract, signer list or verifier weakened by the change it judges, when the real verifier runs | that the agentic test happened as claimed: an agent holding the signing key and the tools can fabricate artifacts and the tester's claim |
| the author giving its own agentic verdict (`verdict_by` against the `Session:` trailer) | that session labels are real: they are self-declared and as honest as the harness's identity hook |
| a status posted with a personal token | a direct push beyond the local hook: the agent controls that machine, and CI on the pushed branch catches a problem only after the fact |
| every attested delivery stays in git history with its digests | the artifacts themselves after the retention window |

A change to the gate itself is delivered like any other change, so the right column includes a PR that loosens the gate. What covers it: the change takes depth `standard` or deeper, the record flags it as `touches_gate`, and a repo on `human-approves` lists the gate paths in CODEOWNERS so a person reviews them. Agents push with the owner's own GitHub identity, so the host cannot tell the owner from the agent, and the owner accepted this risk for their repositories.

Other cheap mitigations: a reader who opens every record flagged `touches_gate`, a tester session separate from the author, artifacts a reader can open from the PR, an optional reviewer session (`waiting.md`), post-merge detection (CI on push, regression runs), and `human-approves` for a team that wants a person on every merge.

**Upgrade path.** A dedicated GitHub App as the only source of `edd/evidence`, with the ruleset pinned to that app's `integration_id`, closes the forged-check gap: a workflow a PR adds cannot post as that app. It is offered to the owner at rollout and not built yet.

## Why not something simpler

| Mechanism | Why it falls short alone |
|---|---|
| a trailer on the code commit (`Evidence: pass`) | the agent writes it while composing the message, before any check runs; it proves nothing |
| git notes | bound to a SHA but carry no origin, and two sessions pushing notes at once reject each other |
| a committed attestation file | changes the tree on every push, so format and lint see it |
| a commit status posted by the agent | any account with push access can post one |
| artifact attestation from CI | does not fit a check that runs on a local machine |
