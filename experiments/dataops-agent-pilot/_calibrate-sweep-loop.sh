#!/bin/bash
# Poll until every judge candidate has landed and been scored.
#
# Safe to run alongside a live tournament: the calibration script itself
# unloads each judge before loading the next, and _memory-watchdog.sh enforces
# the 109GB ceiling independently. Never run this without the watchdog up —
# the box has no memory protection and a stack of resident models can wedge it.
set -uo pipefail
cd /home/robert_li/Desktop/projects/stz-foundry
LOG=experiments/dataops-agent-pilot/judge-calibration-sweep.log
DEADLINE=$(( $(date +%s) + ${SWEEP_MAX_SECONDS:-7200} ))

while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if ! pgrep -f "_memory-watchdog.sh" >/dev/null; then
    echo "[$(date -Is)] ABORT: memory watchdog is not running" >> "$LOG"
    exit 1
  fi
  ./node_modules/.bin/tsx experiments/dataops-agent-pilot/_calibrate-judge.ts --run >> "$LOG" 2>&1
  if ! tail -20 "$LOG" | grep -q "still not installed"; then
    echo "[$(date -Is)] ALL CANDIDATES SCORED" >> "$LOG"
    exit 0
  fi
  echo "[$(date -Is)] waiting for pending pulls…" >> "$LOG"
  sleep 300
done
echo "[$(date -Is)] deadline reached with candidates still pending" >> "$LOG"
