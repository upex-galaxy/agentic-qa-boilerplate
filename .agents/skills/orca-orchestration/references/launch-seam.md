# The Launch Seam — How a Workflow Skill Hands Work to a Fleet

> Loaded by: any workflow skill that distributes work (`sprint-testing`, `test-automation`,
> `shift-left-testing`, `framework-development`, `regression-testing`), and by whoever edits one.
> This is the CONTRACT between a skill that owns the WHAT and this skill, which owns the HOW.
> It is the only place where a workflow skill is allowed to mention orchestration at all, and even
> there it mentions it silently.

---

## 1 · The one seam, and the byte-identical payload

Every workflow skill that distributes work writes a **launch file** — `launch.txt` inside its own
session scope, N lines, each one self-contained and ready to paste. It writes that file **always**,
whether or not any runtime exists.

With a runtime, the launcher receives **the same line, byte for byte**. Identical payloads make it
structurally impossible for the two paths to diverge. A paraphrased line — "basically the same
command, adapted" — is precisely the failure mode this rule exists to prevent, because the path
nobody exercises today is the one that breaks silently in three weeks.

| Responsibility | Without a runtime (the contract) | With a runtime (the shortcut) |
|---|---|---|
| Launch | the human opens N terminals and pastes N lines | `[ORCHESTRATION_TOOL] launch: one terminal per line, title = the work key, command = the line verbatim` |
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

1. **Hand the launch lines to the launcher** instead of asking the human to paste them.
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
| paraphrase a launch line for the launcher | see §1 |

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
- [ ] The line handed to the launcher is byte-identical to the line in the file.
- [ ] Every line is self-contained and passes the shell syntax check.
- [ ] The whole prompt is single-quoted, with no `'` and no unescaped `"` inside it.
- [ ] The gated block is genuinely gated, and its failure mode is SILENCE.
- [ ] N=1 behaviour is unchanged.
- [ ] The workflow's own tokens and artifacts are still written; the mailbox is additive.
- [ ] Every orchestration action is `[ORCHESTRATION_TOOL]` pseudocode pointing here.
