#!/usr/bin/env bash
# Sole sanctioned launcher for detached probe/tournament scripts.
# Usage: bash _launch-probe.sh <script.ts> <state-file> <log-file>
# Guarantees, learned from two dual-writer incidents (v3 grid 2026-08-03,
# v3.1 grid 2026-08-05): after launch it scans /proc and ASSERTS exactly one
# node process runs the script — killing everything it started if the
# assertion fails — and records the VERIFIED node pid, never $!.
set -u
SCRIPT=$1; STATE=$2; LOG=$3
cd "$(dirname "$0")"
# Scan matches on exe == …/node AND script name in cmdline: a cmdline-only
# pattern also catches the invoking shell (whose own cmdline quotes the
# script name) — the self-match trap the handoff warns about. exe, not comm:
# node 24 names its main thread "MainThread", so comm is useless here.
scan() {
  for d in /proc/[0-9]*; do
    case "$(readlink "$d/exe" 2>/dev/null)" in */node) ;; *) continue;; esac
    c=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null) || continue
    case "$c" in *"$SCRIPT"*) echo "${d#/proc/}";; esac
  done
}
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
echo "node=$node_pid" > dualfix-study.pid
echo "launched OK: node=$node_pid (verified sole instance tree: pids $pids)"
