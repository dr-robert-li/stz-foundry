#!/usr/bin/env bash
# Sole sanctioned launcher for detached probe/tournament scripts in this
# experiment directory (re-derived, not sourced, from the shape this
# project's prior detached-study launchers already proved — copied in
# shape only, per this plan's own instruction; this is its own copy, with
# its own pid filename below).
# Usage: bash _launch-probe.sh <script.ts> <state-file> <log-file>
# Guarantees, learned from two prior dual-writer incidents in this project's
# history: after launch it scans /proc and ASSERTS exactly one node process
# runs the script — killing everything it started if the assertion fails —
# and records the VERIFIED node pid, never $!.
set -u
SCRIPT=$1; STATE=$2; LOG=$3
cd "$(dirname "$0")"
# Scan matches on exe == …/node AND script name in cmdline: a cmdline-only
# pattern also catches the invoking shell (whose own cmdline quotes the
# script name) — the self-match trap. exe, not comm: node 24 names its main
# thread "MainThread", so comm is useless here.
scan() {
  for d in /proc/[0-9]*; do
    case "$(readlink "$d/exe" 2>/dev/null)" in */node) ;; *) continue;; esac
    match=0
    while IFS= read -r -d '' arg; do
      case "$arg" in "$SCRIPT"|*/"$SCRIPT") match=1;; esac
    done 2>/dev/null < "$d/cmdline"
    [ "$match" -eq 1 ] && echo "${d#/proc/}"
  done
}
# mkdir is atomic at the filesystem level — closes the TOCTOU window
# between the pre-launch scan and the launch itself: two near-simultaneous
# invocations can no longer both observe an empty scan() and both proceed.
# Held only across check-and-launch; the post-launch scan below remains a
# defense-in-depth backstop, not the primary guarantee. A killed launcher
# (SIGKILL) leaves the lock dir behind — the refusal message below names
# the path so an operator can remove it manually.
LOCKDIR="$(basename "$SCRIPT").launch.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "REFUSED: launch lock held ($LOCKDIR) — another invocation is mid-launch, or a prior one was killed before cleanup (remove the dir if no launch is in progress)"
  exit 1
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT

existing=$(scan)
if [ -n "$existing" ]; then echo "REFUSED: $SCRIPT already running (pid $existing)"; exit 1; fi
TOURNEY_STATE="$STATE" nohup ../../node_modules/.bin/tsx "$SCRIPT" > "$LOG" 2>&1 &
sleep 4
pids=$(scan)
pids=$(echo $pids)   # normalize to space-separated — the ppid match below relies on it
# tsx's CLI is itself a node script that spawns a child node runner, so one
# healthy launch is a parent+child PAIR of matching pids. Assert one instance
# TREE: exactly one matched pid whose parent is not itself matched (the root).
roots=""; leaf=""
for p in $pids; do
  pp=$(awk '{print $4}' "/proc/$p/stat" 2>/dev/null)
  case " $pids " in
    *" $pp "*) leaf=$p;;
    *) roots="$roots $p";;
  esac
done
count=$(echo $roots | wc -w)
if [ "$count" -ne 1 ]; then
  echo "ASSERTION FAILED: $count instance roots for $SCRIPT (want 1): matched pids: $pids — killing all"
  for p in $pids; do kill "$p" 2>/dev/null; done
  exit 1
fi
node_pid=${leaf:-$(echo $roots)}
echo "node=$node_pid" > ceiling-probe.pid
echo "launched OK: node=$node_pid (verified sole instance tree: pids $pids)"
