# Preset: pr-delivery, built on the idea of the wake-on pr-review preset (~/.agents/skills/wake-on/presets/pr-review.sh); sourced by pr-watch.sh, never run directly.
PRESET_SUMMARY="One GitHub PR until it is merged or closed: state, review decision, merge state, auto-merge, head commit, every finished check, reviews, plain and inline comments (edits included). Ends itself on MERGED or CLOSED with one last event."
PRESET_PARAMS="REPO=owner/name PR=<number> [IGNORE=<login whose reviews and comments are skipped, default: none>] [INTERVAL=120]"

PR_FIELDS=state,reviewDecision,mergeStateStatus,autoMergeRequest,headRefOid,statusCheckRollup,mergeCommit,reviews

preset_init() {
  [ -n "${REPO:-}" ] && [ -n "${PR:-}" ] || { echo "pr-delivery needs REPO=owner/name and PR=<number>" >&2; return 1; }
  case "$PR" in *[!0-9]*) echo "pr-delivery: PR must be a number, got '$PR'" >&2; return 1;; esac
  IGNORE="${IGNORE:-}"
}

preset_snapshot() {
  local pr plain inline ms
  pr=$(gh pr view "$PR" --repo "$REPO" --json "$PR_FIELDS") || return 1
  plain=$(gh api "repos/$REPO/issues/$PR/comments" --paginate) || return 1
  inline=$(gh api "repos/$REPO/pulls/$PR/comments" --paginate) || return 1
  printf '%s\n' "$pr" > "$D/pr.json"
  printf '%s\n' "$plain" > "$D/plain.json"
  printf '%s\n' "$inline" > "$D/inline.json"
  ms=$(jq -r '.mergeStateStatus // "UNKNOWN"' "$D/pr.json") || return 1
  if [ "$ms" = "UNKNOWN" ]; then
    ms=$(cat "$D/merge-state" 2>/dev/null || echo UNKNOWN)
  else
    printf '%s\n' "$ms" > "$D/merge-state"
  fi
  jq -r --arg ignore "$IGNORE" --arg ms "$ms" '
    (.headRefOid[0:7]) as $head |
    "pr:" + .state,
    "decision:" + (if (.reviewDecision // "") == "" then "none" else .reviewDecision end),
    "merge:" + $ms,
    "auto:" + (if .autoMergeRequest == null then "off" else "on " + (.autoMergeRequest.mergeMethod // "unknown") end),
    "head:" + .headRefOid,
    (.statusCheckRollup // [] | .[]
      | if .__typename == "StatusContext"
        then (if .state == "PENDING" or .state == "EXPECTED" then empty else "check:" + .context + "@" + $head + "=" + .state end)
        else (if .status != "COMPLETED" then empty else "check:" + ((.workflowName // "") | if . == "" then "" else . + "/" end) + .name + "@" + $head + "=" + (.conclusion // "NONE") end)
        end),
    (.reviews // [] | .[] | select(.author.login != $ignore) | "review:" + .id + ":" + .state + ":" + .author.login)
  ' "$D/pr.json" || return 1
  jq -r --arg ignore "$IGNORE" '.[] | select(.user.login != $ignore) | "comment:\(.id):\(.user.login):\(.updated_at)"' "$D/plain.json" || return 1
  jq -r --arg ignore "$IGNORE" '.[] | select(.user.login != $ignore) | "inline:\(.id):\(.user.login):\(.updated_at)"' "$D/inline.json" || return 1
}

preset_describe() {
  local line rest id tail who st body final=0
  case "$(jq -r '.state' "$D/pr.json")" in MERGED|CLOSED) final=1 ;; esac
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in
      pr:*)       [ "$final" = 1 ] || emit "PR now: ${line#pr:}" ;;
      decision:*) emit "REVIEW DECISION ${line#decision:}" ;;
      merge:*)    [ "$final" = 1 ] || emit "MERGE STATE ${line#merge:}" ;;
      auto:*)     [ "$final" = 1 ] || emit "AUTO-MERGE ${line#auto:}" ;;
      head:*)     [ "$final" = 1 ] || emit "HEAD moved ${line#head:}" ;;
      check:*)    rest="${line#check:}"; st="${rest##*=}"; rest="${rest%=*}"; emit "CHECK ${rest%@*} $st on ${rest##*@}" ;;
      review:*)
        rest="${line#review:}"; id="${rest%%:*}"; tail="${rest#*:}"; st="${tail%%:*}"; who="${tail#*:}"
        body=$(jq -r --arg id "$id" '.reviews[] | select(.id == $id) | .body' "$D/pr.json" 2>/dev/null | oneline 600)
        emit "REVIEW $who $st | ${body:-<no text>}" ;;
      comment:*)
        rest="${line#comment:}"; id="${rest%%:*}"; tail="${rest#*:}"; who="${tail%%:*}"
        body=$(jq -r --argjson id "$id" '.[] | select(.id == $id) | .body' "$D/plain.json" 2>/dev/null | oneline 600)
        emit "PR COMMENT $who | ${body:-<unreadable>}" ;;
      inline:*)
        rest="${line#inline:}"; id="${rest%%:*}"; tail="${rest#*:}"; who="${tail%%:*}"
        body=$(jq -r --argjson id "$id" '.[] | select(.id == $id) | "[\(.path):\(.line // "-")] " + .body' "$D/inline.json" 2>/dev/null | oneline 600)
        emit "INLINE COMMENT $who | ${body:-<unreadable>}" ;;
    esac
  done <<< "${WAKE_ADDED:-}"
}

preset_terminal() {
  local oid
  case "$(jq -r '.state' "$D/pr.json")" in
    MERGED)
      oid=$(jq -r '.mergeCommit.oid // "unknown"' "$D/pr.json")
      echo "PR #$PR in $REPO is MERGED, merge commit $oid. The watcher stopped itself; nothing to re-arm." ;;
    CLOSED)
      echo "PR #$PR in $REPO is CLOSED without a merge. The watcher stopped itself; nothing to re-arm." ;;
    *) return 1 ;;
  esac
}
