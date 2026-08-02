#!/usr/bin/env bash
# Aggressive resource sampler for the v3 grid probe under OLLAMA_NUM_PARALLEL
# stairstepping. Every 15s: memory availability, swap, load, ollama residency,
# and cumulative ollama completions. Emits WARN/CRIT lines the Monitor greps.
#
# Thresholds sit UNDER the 109GB watchdog ceiling on purpose: the sampler
# warns while the watchdog still has room to act, so a stairstep up in
# parallelism gets called back down BEFORE the watchdog has to kill anything.
#   avail < 30GB -> WARN (stop stairstepping up)
#   avail < 20GB -> CRIT (step back down now)
#
# Usage: nohup bash _resource-sampler.sh > v3-resource.log 2>&1 &
set -u
INTERVAL="${SAMPLE_INTERVAL:-15}"
while true; do
  ts=$(date '+%H:%M:%S')
  # /proc/meminfo is authoritative on unified-memory DGX: GPU and system draw
  # from the same pool, so MemAvailable is THE headroom number.
  avail_gb=$(awk '/MemAvailable/ {printf "%.1f", $2/1048576}' /proc/meminfo)
  swap_used_gb=$(awk '/SwapTotal/ {t=$2} /SwapFree/ {f=$2} END {printf "%.1f", (t-f)/1048576}' /proc/meminfo)
  load=$(cut -d' ' -f1 /proc/loadavg)
  resident=$(ollama ps 2>/dev/null | awk 'NR==2 {print $3 $4}')
  level="ok"
  awk -v a="$avail_gb" 'BEGIN {exit !(a < 20)}' && level="CRIT"
  [ "$level" = "ok" ] && awk -v a="$avail_gb" 'BEGIN {exit !(a < 30)}' && level="WARN"
  echo "[$ts] $level avail=${avail_gb}GB swap=${swap_used_gb}GB load=$load resident=${resident:-none}"
  sleep "$INTERVAL"
done
