#!/usr/bin/env bash
# Vendored from the wake-on skill (~/.agents/skills/wake-on/scripts/wake-on.sh, MIT); this copy adds terminal events and keeps its own state root.
set -u
export LC_ALL=C
set -o pipefail

WATCH_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
PRESETS="$(dirname "$WATCH_SCRIPT")/presets"
ROOT="${EDD_WATCH_HOME:-$HOME/.edd-watch}/instances"
STALE_AFTER=900

usage() {
  cat <<'EOF'
pr-watch: watch a pull request with plain gh calls and wake the session on every change.
  presets                                list presets and their parameters
  start <preset> <name> [KEY=VAL ...]    create a watch and start its watcher (restarts a dead one)
  wake <name> [name ...]                 block until a listed watch has new events
  status [name ...]                      watcher health, last poll age, events logged and consumed
  log <name> [n]                         last n events (default 20), without consuming them
  stop <name>                            stop a watcher before its preset ends it
wake exits 0 with events, 2 when a watcher died or stopped polling, 3 when every listed watch has ended.
Environment: EDD_WATCH_HOME (state root, default ~/.edd-watch), EDD_WATCH_TEST_DROP=1 (fake first event).
EOF
}

die() { echo "pr-watch: $*" >&2; exit 64; }

use_instance() {
  case "$1" in ''|*[!A-Za-z0-9._-]*) die "invalid name '$1' (letters, digits, . _ - only)";; esac
  D="$ROOT/$1"; NAME="$1"
  META="$D/meta.env"; SEEN="$D/seen.txt"; EVENTS="$D/events.log"; OFFSET="$D/offset"
  PIDF="$D/pid"; BEAT="$D/heartbeat"; DLOG="$D/daemon.log"; ENDED="$D/ended"
}
now()   { date '+%Y-%m-%d %H:%M:%S'; }
note()  { printf '%s %s\n' "$(now)" "$1" >> "$DLOG"; }
emit()  { printf 'EVENT %s %s\n' "$(now)" "$1" >> "$EVENTS"; }
oneline() { tr '\n\r' '  ' | head -c "${1:-500}"; }
alive() { [ -s "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; }
interval_of() { cat "$D/interval" 2>/dev/null || echo 120; }
stale_limit() {
  local lim=$(( 2 * $(interval_of) + 60 ))
  [ "$lim" -lt "$STALE_AFTER" ] && lim=$STALE_AFTER
  echo "$lim"
}
beat_age() {
  # GNU form first: GNU stat reads -f as "file system status" and prints to stdout before it fails.
  local m; m=$(stat -c %Y "$BEAT" 2>/dev/null || stat -f %m "$BEAT" 2>/dev/null) || { echo 999999; return; }
  echo $(( $(date +%s) - m ))
}
unread() {
  local off total
  off=$(cat "$OFFSET" 2>/dev/null || echo 0)
  total=$(wc -l < "$EVENTS" | tr -d ' ')
  [ "$total" -gt "$off" ]
}

preset_describe() {
  local l
  while IFS= read -r l; do [ -n "$l" ] && emit "ADDED $l"; done <<< "${WAKE_ADDED:-}"
  while IFS= read -r l; do [ -n "$l" ] && emit "REMOVED $l"; done <<< "${WAKE_REMOVED:-}"
}
preset_terminal() { return 1; }

normalize() { sed '/^$/d' | sort -u; }

end_watch() {
  emit "WATCH ENDED: $1"
  printf '%s\n' "$1" > "$ENDED"
  note "ended: $1"
  rm -f "$PIDF"
  exit 0
}

run_watcher() {
  use_instance "$1"
  [ -f "$META" ] || die "no such watch: $1"
  # shellcheck disable=SC1090
  . "$META"
  # shellcheck disable=SC1090
  . "$PRESETS/$PRESET.sh" || { note "cannot load preset $PRESET"; exit 2; }
  preset_init || { note "preset_init failed, see daemon.out"; exit 2; }
  INTERVAL="${INTERVAL:-120}"
  echo "$INTERVAL" > "$D/interval"
  if alive; then echo "already running, pid $(cat "$PIDF")"; exit 0; fi
  echo $$ > "$PIDF"
  trap 'emit "WATCH STOPPED on request"; rm -f "$PIDF"; exit 0' TERM INT

  local out snap reason
  if [ ! -f "$SEEN" ]; then
    out=$(preset_snapshot) || { note "first poll failed, nothing is watched"; rm -f "$PIDF"; exit 2; }
    printf '%s\n' "$out" | normalize > "$SEEN"
    note "started with a fresh baseline"
  else
    note "restarted: comparing with the saved baseline, changes made while it was down are reported"
  fi
  if [ "${EDD_WATCH_TEST_DROP:-0}" = "1" ]; then tail -n +2 "$SEEN" > "$SEEN.tmp"; mv "$SEEN.tmp" "$SEEN"; fi

  local fails=0 warned=0 added removed
  while :; do
    touch "$BEAT"
    if out=$(preset_snapshot); then
      snap=$(printf '%s\n' "$out" | normalize)
      if [ "$warned" = "1" ]; then emit "WATCH RECOVERED: polling works again, watching continues"; warned=0; fi
      fails=0
      added=$(comm -13 "$SEEN" <(printf '%s\n' "$snap" | sed '/^$/d'))
      removed=$(comm -23 "$SEEN" <(printf '%s\n' "$snap" | sed '/^$/d'))
      if [ -n "$added" ] || [ -n "$removed" ]; then
        WAKE_ADDED="$added" WAKE_REMOVED="$removed" preset_describe
        printf '%s\n' "$snap" | sed '/^$/d' > "$SEEN"
      fi
      if reason=$(WAKE_SNAPSHOT="$snap" preset_terminal); then end_watch "$reason"; fi
    else
      fails=$((fails + 1))
      if [ "$fails" -ge 10 ] && [ "$warned" = "0" ]; then
        emit "WATCH WARNING: $fails polls failed in a row (login, network or the command itself). Still retrying."
        warned=1
      fi
    fi
    sleep "$INTERVAL" &
    wait $!
  done
}

cmd_presets() {
  local f
  for f in "$PRESETS"/*.sh; do
    ( . "$f"; printf '%s\n  %s\n  params: %s\n\n' "$(basename "$f" .sh)" "$PRESET_SUMMARY" "$PRESET_PARAMS" )
  done
}

cmd_start() {
  [ $# -ge 2 ] || die "usage: start <preset> <name> [KEY=VAL ...]"
  local preset="$1" name="$2"; shift 2
  use_instance "$name"
  [ -f "$PRESETS/$preset.sh" ] || die "unknown preset '$preset' (run: presets)"
  if [ -f "$ENDED" ]; then
    echo "watch '$name' already ended: $(cat "$ENDED") Start a new watch under another name." >&2
    return 1
  fi
  local kv key val
  for kv in "$@"; do
    key="${kv%%=*}"
    case "$kv" in *=*) ;; *) die "parameter '$kv' must look like KEY=VALUE";; esac
    case "$key" in ''|[!A-Z]*|*[!A-Z0-9_]*) die "parameter key '$key' must be UPPERCASE letters, digits and _";; esac
  done
  mkdir -p "$D"
  if [ -f "$META" ]; then
    # shellcheck disable=SC1090
    ( . "$META"; [ "$PRESET" = "$preset" ] ) || die "watch '$name' already exists with another preset"
    for kv in "$@"; do
      key="${kv%%=*}"; val="${kv#*=}"
      grep -qxF "$(printf '%s=%q' "$key" "$val")" "$META" || die "watch '$name' already exists with $key set differently; use another name"
    done
    if alive; then echo "watch '$name' already running, pid $(cat "$PIDF")"; return 0; fi
    echo "watch '$name' exists but its watcher is dead: restarting with the saved parameters"
  else
    printf 'PRESET=%q\n' "$preset" > "$META"
    for kv in "$@"; do
      key="${kv%%=*}"; val="${kv#*=}"
      printf '%s=%q\n' "$key" "$val" >> "$META"
    done
  fi
  touch "$EVENTS"
  nohup bash "$WATCH_SCRIPT" _run "$name" >> "$D/daemon.out" 2>&1 &
  disown 2>/dev/null || true
  local i=0
  while [ $i -lt 40 ]; do
    if [ -f "$ENDED" ]; then
      echo "watch '$name' ended on its first poll: $(cat "$ENDED")"
      return 0
    fi
    if alive && [ -f "$SEEN" ] && [ -f "$BEAT" ]; then
      echo "watch '$name' started, pid $(cat "$PIDF")"; echo "baseline:"; sed 's/^/  /' "$SEEN"
      return 0
    fi
    sleep 0.5; i=$((i + 1))
  done
  echo "watch '$name' did NOT start. daemon.log / daemon.out say why:" >&2
  tail -n 5 "$DLOG" "$D/daemon.out" 2>/dev/null >&2
  return 1
}

cmd_wake() {
  [ $# -ge 1 ] || die "usage: wake <name> [name ...]"
  local n got stale recheck ended_all off total
  for n in "$@"; do use_instance "$n"; [ -f "$META" ] || die "no such watch: $n"; done
  while :; do
    got=0
    for n in "$@"; do
      use_instance "$n"
      off=$(cat "$OFFSET" 2>/dev/null || echo 0)
      total=$(wc -l < "$EVENTS" | tr -d ' ')
      if [ "$total" -gt "$off" ]; then
        sed -n "$((off + 1)),${total}p" "$EVENTS" | sed "s/^/[$n] /"
        echo "$total" > "$OFFSET"; got=1
      fi
    done
    [ "$got" = "1" ] && exit 0
    stale=0; recheck=0; ended_all=1
    for n in "$@"; do
      use_instance "$n"
      [ -f "$ENDED" ] && continue
      ended_all=0
      if ! alive; then
        [ -f "$ENDED" ] && continue 2
        echo "[$n] WATCH DEAD: no watcher process. Nothing is watching. Restart: bash $WATCH_SCRIPT start <preset> $n"
        exit 2
      fi
      if [ "$(beat_age)" -gt "$(stale_limit)" ]; then
        stale=1
        [ $(( $(interval_of) + 20 )) -gt "$recheck" ] && recheck=$(( $(interval_of) + 20 ))
      fi
    done
    if [ "$ended_all" = "1" ]; then
      for n in "$@"; do use_instance "$n"; unread && continue 2; done
      for n in "$@"; do use_instance "$n"; echo "[$n] WATCH ENDED: $(cat "$ENDED") Nothing left to wake on."; done
      exit 3
    fi
    if [ "$stale" = "1" ]; then
      sleep "$recheck"
      for n in "$@"; do
        use_instance "$n"
        [ -f "$ENDED" ] && continue
        if [ "$(beat_age)" -gt "$(stale_limit)" ]; then
          echo "[$n] WATCH STALE: process alive but no poll for $(beat_age)s (limit $(stale_limit)s). See $DLOG"; exit 2
        fi
      done
    fi
    sleep 10
  done
}

cmd_status() {
  local names=("$@") n
  if [ ${#names[@]} -eq 0 ]; then
    names=(); for n in "$ROOT"/*/; do [ -d "$n" ] && names+=("$(basename "$n")"); done
  fi
  [ ${#names[@]} -gt 0 ] || { echo "no watches yet"; return 0; }
  for n in "${names[@]}"; do
    use_instance "$n"; [ -f "$META" ] || { echo "$n: no such watch"; continue; }
    if [ -f "$ENDED" ]; then
      printf '%s: ENDED (%s), ' "$n" "$(cat "$ENDED")"
    elif alive; then
      printf '%s: ALIVE pid %s, polls every %ss, last poll %ss ago, ' "$n" "$(cat "$PIDF")" "$(interval_of)" "$(beat_age)"
    else
      printf '%s: NOT RUNNING, ' "$n"
    fi
    printf 'preset %s, events %s, consumed %s\n' "$( . "$META"; echo "$PRESET")" "$(wc -l < "$EVENTS" | tr -d ' ')" "$(cat "$OFFSET" 2>/dev/null || echo 0)"
  done
}

cmd_log() {
  [ $# -ge 1 ] || die "usage: log <name> [n]"
  use_instance "$1"; [ -f "$META" ] || die "no such watch: $1"
  tail -n "${2:-20}" "$EVENTS"
}

cmd_stop() {
  [ $# -ge 1 ] || die "usage: stop <name>"
  use_instance "$1"; [ -f "$META" ] || die "no such watch: $1"
  if alive; then
    local p; p=$(cat "$PIDF")
    printf '%s\n' "stopped on request with the stop command." > "$ENDED"
    kill "$p" 2>/dev/null; pkill -P "$p" 2>/dev/null
    local i=0
    while alive && [ $i -lt 10 ]; do sleep 0.5; i=$((i + 1)); done
    if alive; then echo "still alive after 5s, pid $p"; else echo "watch '$1' stopped"; fi
  else
    echo "watch '$1' was not running"
  fi
}

case "${1:-}" in
  presets) cmd_presets ;;
  start)   shift; cmd_start "$@" ;;
  wake)    shift; cmd_wake "$@" ;;
  status)  shift; cmd_status "$@" ;;
  log)     shift; cmd_log "$@" ;;
  stop)    shift; cmd_stop "$@" ;;
  _run)    shift; run_watcher "$@" ;;
  *) usage; exit 64 ;;
esac
