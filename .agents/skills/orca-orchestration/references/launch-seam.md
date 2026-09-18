# The Launch Seam — How a Workflow Skill Hands Work to a Fleet

> Loaded by: any workflow skill that distributes work (`sprint-testing`, `test-automation`,
> `shift-left-testing`, `framework-development`, `regression-testing`), and by whoever edits one.
> This is the CONTRACT between a skill that owns the WHAT and this skill, which owns the HOW.
> It is the only place where a workflow skill is allowed to mention orchestration at all, and even
> there it mentions it silently.

---

## 1 · The one seam, and what the two paths actually share

Every workflow skill that distributes work writes a **launch file** — `launch.txt` inside its own
session scope, N lines, each one self-contained and ready to paste. It writes that file **always**,
whether or not any runtime exists.

**The byte-identical rule survives, with a narrower scope.** The line in `launch.txt` is the line a
HUMAN pastes, byte for byte, and a conductor that deliberately opens an unsupervised terminal passes
it verbatim as that terminal's command. What it can no longer be is the supervised launch: the
runtime recognizes only agents IT started, so a terminal created from our own command line can never
be adopted (`orca-orchestration/references/gotchas.md` G44). Supervision is the native launch, and
the native launch takes an agent, a model and an effort level — **not a command line**.

So what the two paths share is not the argv. It is the PAYLOAD: the same brief files, cited by the
same absolute paths, and the same prompt text — pasted by a human on one path, delivered by
`[ORCHESTRATION_TOOL] send-prompt` right after readiness on the other. A paraphrased prompt is still
the failure this rule exists to prevent; the prompt is what must not drift.

| Responsibility | Without a runtime (the contract) | With a runtime (supervised) |
|---|---|---|
| Launch | the human opens N terminals and pastes N lines from `launch.txt` | `[ORCHESTRATION_TOOL] launch: one native supervised worker per unit of work (agent + model + effort), then send the prompt into it` |
| Prompt | it is inside the pasted line | delivered as a separate step, same text, opening with `/<workflow-skill> <KEY> fleet worker` |
| Credentials | the pasted line runs in the user's own shell, which already has them | the runtime's interactive shell loads them via direnv; the conductor VERIFIES them on screen before sending work (G45) |
| State | the workflow's own blocked-state tokens in its session memory, plus the tracker | the mailbox: wait on done / escalation / question |
| Sibling awareness | each worker knows only its own ticket | the roster in the brief; a worker broadcasts a fact that changes someone else's decision |
| Close | the human closes terminals | `[ORCHESTRATION_TOOL] close: release the supervised worker by dispatch` |

Workflow skills write `[ORCHESTRATION_TOOL] <verb>: …` pseudocode and point at `orca-orchestration`
for the real grammar. Only this skill spells out commands, because only this skill is the tool owner.

---

## 2 · What a workflow skill writes

### 2.1 · The launch file

- Path: `.session/<skill-slug>/<scope>/launch.txt`.
- **Regenerated whole** at each planning pass. Closed or finished items simply drop out; nothing is
  edited in place, so there is never a half-updated file.
- One line per unit of work, **self-contained**: it exports whatever the worker needs, then starts
  the agent with the full prompt. A line that depends on something typed earlier in that terminal is
  not a launch line.
- Shape (Claude Code example; other harnesses use their own binary and their own documented flags):

  ```
  bun run claude -- --model <full-model-id> --effort <level> --permission-mode auto \
    -n "<KEY>-<slug>" '<prompt>'
  ```

  `bun run claude` forwards trailing arguments to the binary through the env-loading wrapper
  (verified: `bun run claude -- --version` prints the CLI version), and the wrapper is what makes the
  env file win over an inherited variable. On a harness where the launcher cannot set a session name,
  omit the flag and have the brief instruct the worker to rename itself in its first turn.

**This line is for a human, or for a terminal nobody will supervise.** Two things about it do not
survive the supervised path, and a skill that assumes they do is writing a lie into its own doc:

1. **An environment prefix does not reach a supervised worker.** There is no argv on the native
   launch, so `FOO=bar <binary> …` has nowhere to live. Measured: the two variables the sprint fleet
   used to mark a worker were empty in all three sessions even on the custom-argv path, because the
   prefix belongs to a shell the runtime did not keep. **Never detect fleet mode from an environment
   variable.** Detect it from the prompt token and the brief; an exported variable is at most a
   redundant signal on the human-paste path.
2. **A session-name flag exists only in a pasted line.** On the supervised path the session is titled
   from the PROMPT, which is why the prompt has a fixed opening (§2.1b).

### 2.1b · The prompt, which IS shared by both paths

Whether it is pasted inside a launch line or sent into a native worker, the prompt has the same three
parts, in this order:

```
/<workflow-skill> <KEY> fleet worker. Read <ABS>/<scope>/COMMON.md then <ABS>/<scope>/W-<label>.md
and execute your brief. Run every stage without returning to the prompt until worker_done is sent;
stage boundaries are not checkpoints. Channel: orca orchestration. No heartbeats.
```

- **The opening token is load-bearing.** `/<workflow-skill> <KEY> fleet worker` is what the identity
  hook reads to title the session (there is no name flag on the supervised path) and what the workflow
  skill reads to know it is running as a fleet worker.
- **The continuation sentence is not decoration.** Two of three workers in the last fleet stopped at
  a stage boundary with work remaining, on briefs that said "no checkpoints": the instruction works
  when it arrives as the worker's own prompt and fails as a pointer to a file. It belongs in the
  prompt, in the brief, and in `COMMON.md`.
- **One prompt, one task** (`references/brief-template.md` §5). The brief lives in a FILE; the prompt
  points at it.

### 2.2 · The three quoting rules, non-negotiable

1. **The whole prompt is single-quoted; it contains no `'` and no unescaped `"`.** The delimiter is
   fixed (single quotes, always) so it is never a per-line choice; a prompt that needs either
   character is rephrased instead of switching delimiter.
2. **`<` and `>` inside the quoted prompt are literal text, not redirection.** Redirection only
   fires on an unquoted `<`/`>`; once the whole prompt sits inside single quotes the shell never
   interprets them, so this rule does not ban those two characters.
3. **Validate every line with a shell syntax check before anything is launched** (`sh -n` over the
   file, or the equivalent for the shell the user actually runs). On 2026-09-04 five lines died at
   once on a quoting error: the environment variables never exported, and the terminals looked
   perfectly fine.

### 2.3 · The three gated lines

When the gate passes (`SKILL.md` §The gate), a workflow skill may do exactly three things, each one
gated and each one silent when the gate fails:

1. **Hand the work to the launcher** instead of asking the human to paste it: one supervised worker
   per unit of work, then the same prompt delivered into it (§1, §2.1b). A conductor that wants an
   unsupervised terminal instead passes the `launch.txt` line verbatim as that terminal's command.
2. **Seed the per-unit brief** with the fleet fields (`references/brief-template.md`), including
   `Run: <run_id>` when the worker is launched without a dispatch.
3. **Add the mailbox report** to what a worker already writes: the workflow's own tokens and files
   stay, the message is an addition. Never a replacement.

Everything else — Runs, Tasks, adoption, board cards, waiting, acking, liveness, closing — belongs to
this skill. A workflow skill never spells out a command for it.

---

## 3 · What a workflow skill must NEVER do

| Never | Why |
|---|---|
| list a runtime, a binary or an app as a **prerequisite** | the flow works without it; a prerequisite turns an optional accelerator into a hard dependency |
| put it in a **non-bypassable probe** | a machine without it would fail a gate it has no reason to pass |
| mention it in the **ATR environment block** or any report of record | the artifact of record must read identically on every machine, forever |
| include it in the **blocked-token sweep** | the sweep is the fallback that must work WITHOUT it |
| **name it to the user when the gate fails** | state A is total silence. Not a hint, not a suggestion, not an aside. The install recommendation belongs to `orca-orchestration`, and fires only because the user ASKED for orchestration |
| change what a single worker does | N=1 must remain today's behaviour byte for byte. Fleet mode adds a coordinator above the loop; it does not alter the loop |
| paraphrase the prompt, on either path | see §1 and §2.1b: the prompt is the payload both paths share |
| detect fleet mode from an environment variable | it does not survive either path. Measured empty in all three sessions of the last fleet (§2.1) |

**The test that settles any future edit**: would this line still make sense, unchanged, to a tester
who has never heard of the orchestrator? If not, it belongs in this skill.

---

## 4 · Per-skill scope and topology

| Skill | Scope for `launch.txt` | Topology |
|---|---|---|
| `sprint-testing` | `.session/sprint-testing/sprint-<N>/` | fleet in the same checkout, one worker per issue |
| `shift-left-testing` | its dated batch scope | same checkout, one worker per story |
| `test-automation` | its per-module / per-package scope | one worktree per worker, one worker per module |
| `framework-development` | its wave scope | same checkout with file ownership, or one worktree per wave |
| `regression-testing` | its dated run scope | one worktree per failure cluster |

Detail: `references/topologies.md`. The scope directory name is whatever that skill's own
session-management contract already declares — this seam never invents a new scope shape.

---

## 5 · Review checklist for a seam edit

- [ ] The launch file is written on BOTH paths, unconditionally.
- [ ] The prompt is identical on both paths, and it opens with `/<workflow-skill> <KEY> fleet worker`.
- [ ] The prompt carries the continuation sentence (no stopping until `worker_done`).
- [ ] Nothing in the flow detects fleet mode from an environment variable.
- [ ] Every line is self-contained and passes the shell syntax check.
- [ ] The whole prompt is single-quoted, with no `'` and no unescaped `"` inside it.
- [ ] The gated block is genuinely gated, and its failure mode is SILENCE.
- [ ] N=1 behaviour is unchanged.
- [ ] The workflow's own tokens and artifacts are still written; the mailbox is additive.
- [ ] Every orchestration action is `[ORCHESTRATION_TOOL]` pseudocode pointing here.
