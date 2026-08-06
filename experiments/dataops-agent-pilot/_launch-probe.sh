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
existing=$(for d in /proc/[0-9]*; do c=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null) || continue; case "$c" in *node*"$SCRIPT"*) echo "${d#/proc/}";; esac; done)
if [ -n "$existing" ]; then echo "REFUSED: $SCRIPT already running (pid $existing)"; exit 1; fi
TOURNEY_STATE="$STATE" nohup ../../node_modules/.bin/tsx "$SCRIPT" > "$LOG" 2>&1 &
sleep 4
pids=$(for d in /proc/[0-9]*; do c=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null) || continue; case "$c" in *node*"$SCRIPT"*) echo "${d#/proc/}";; esac; done)
count=$(echo "$pids" | grep -c .)
if [ "$count" -ne 1 ]; then
  echo "ASSERTION FAILED: $count node processes for $SCRIPT (want 1): $pids — killing all"
  for p in $pids; do kill "$p" 2>/dev/null; done
  exit 1
fi
echo "node=$pids" > grid-probe.pid
echo "launched OK: node=$pids (verified sole instance)"
