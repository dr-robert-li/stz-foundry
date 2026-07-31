#!/bin/bash
# MEMORY WATCHDOG — DGX Spark has 121GB unified memory and NO memory
# protection: an overcommit does not get a clean OOM kill, it can wedge the
# box and take every long-running experiment with it.
#
# Ollama keeps a model resident for ~5 minutes after its last call, so a
# sequential sweep can silently STACK models: this was observed live with
# qwen3.6 (29GB) + nemotron3 (26GB) both resident, and would have reached
# ~106GB of models alone once gpt-oss:20b and gemma4:31b landed.
#
# Policy: one PROTECTED model (the running tournament's candidate model) plus
# at most one judge model. Anything above the ceiling gets the non-protected
# models unloaded, largest first, and the event logged.
set -uo pipefail

CEILING_GB="${WATCHDOG_CEILING_GB:-109}"
PROTECT="${WATCHDOG_PROTECT:-qwen3.6:latest}"
LOG="${WATCHDOG_LOG:-$(dirname "$0")/memory-watchdog.log}"
INTERVAL="${WATCHDOG_INTERVAL:-20}"

log() { echo "[$(date -Is)] $*" | tee -a "$LOG"; }

log "watchdog start — ceiling ${CEILING_GB}GB, protecting ${PROTECT}, every ${INTERVAL}s"

while true; do
  used_gb=$(free -g | awk '/^Mem:/ {print $3}')

  if [ "$used_gb" -ge "$CEILING_GB" ]; then
    log "BREACH: ${used_gb}GB >= ${CEILING_GB}GB — unloading non-protected models"
    # Largest first: reclaim the most memory per unload.
    ollama ps 2>/dev/null | tail -n +2 | sort -k3 -hr | awk '{print $1}' | while read -r m; do
      [ -z "$m" ] && continue
      [ "$m" = "$PROTECT" ] && continue
      log "  unloading $m"
      ollama stop "$m" >/dev/null 2>&1
      sleep 3
      now=$(free -g | awk '/^Mem:/ {print $3}')
      [ "$now" -lt "$CEILING_GB" ] && break
    done
    after=$(free -g | awk '/^Mem:/ {print $3}')
    log "  after unload: ${after}GB"
    if [ "$after" -ge "$CEILING_GB" ]; then
      # Protected model alone is over the ceiling — do NOT touch it (that
      # would kill the tournament); surface loudly instead. Halt-and-surface,
      # never silently degrade the thing being measured.
      log "  STILL OVER CEILING with only protected models — human attention needed"
    fi
  fi

  # Early warning: more than one judge model resident means the sweep is not
  # being sequential, which is how the ceiling gets reached in the first place.
  resident=$(ollama ps 2>/dev/null | tail -n +2 | grep -vc "^$" || true)
  if [ "${resident:-0}" -gt 2 ]; then
    log "WARN: ${resident} models resident (${used_gb}GB) — sweep should be sequential"
  fi

  sleep "$INTERVAL"
done
