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

The check `edd/evidence` runs the verifier from the **base** branch's code, reading the PR's commits as data and never running them, so a PR cannot change the verifier that judges it. The ruleset requires that check from the GitHub Actions app specifically, so a status posted with the agent's own token does not count. The verifier enforces:

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

| Guaranteed | Not guaranteed |
|---|---|
| the merge gate opens only on a check that Actions produced from base-branch code, and the host enforces it | that the agentic test happened as claimed: an agent holding the signing key and the tools can fabricate artifacts |
| the static level is recomputed by CI for a PR that leaves the gate alone; the agent cannot mint it | that the tester told the truth in its verdict and claim |
| the evidence is bound to the exact diff; any later change to the code voids it | that session labels are real: they come from the harness's identity hook and are as honest as that hook |
| a PR cannot weaken its own contract, signer list or verifier | protection of a direct push beyond the local hook: the agent controls that machine, and CI on the pushed branch catches a problem only after the fact |
| every attested delivery stays in git history with its digests | the artifacts themselves after the retention window |
| | a weakened static level: the static jobs run the PR's own workflow files and `package.json` scripts, so a PR that edits them is judged by its edited checks. A gate change is delivered like any other change; the record flags it as `touches_gate` and nothing stops it |

The signature proves where the evidence came from and what it is bound to. It does not prove the evidence is true. What narrows that gap is cheap: a reader who opens every record flagged `touches_gate`, a tester session separate from the author, artifacts a reader can open from the PR, an optional reviewer session (`waiting.md`), post-merge detection (CI on push, regression runs), and `human-approves` for a team that wants a person on every merge.

## Why not something simpler

| Mechanism | Why it falls short alone |
|---|---|
| a trailer on the code commit (`Evidence: pass`) | the agent writes it while composing the message, before any check runs; it proves nothing |
| git notes | bound to a SHA but carry no origin, and two sessions pushing notes at once reject each other |
| a committed attestation file | changes the tree on every push, so format and lint see it |
| a commit status posted by the agent | any account with push access can post one |
| artifact attestation from CI | does not fit a check that runs on a local machine |
