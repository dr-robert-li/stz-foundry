#!/usr/bin/env bash
# Provision the isolated stark-qa venv (D-07, D-08).
#
# Usage:
#   bash setup.sh              # create .venv if missing, install pins;
#                               # writes requirements.lock.txt only if it
#                               # doesn't exist yet, otherwise verifies the
#                               # installed set matches it and warns on drift
#   bash setup.sh --recreate   # force-recreate .venv even if it already exists
#   bash setup.sh --relock     # overwrite the committed lock with this run's
#                               # freeze (explicit, not a side effect)
#
# Uses `uv venv --python 3.11`, NOT a bare `python3.11 -m venv` — this dev
# machine has no bare python3.11 on PATH (python3 is 3.13.x, /usr/bin/python3
# is 3.12.x), while uv already has cpython-3.11.15 installed locally, so this
# resolves with zero network fetch (RESEARCH.md Pitfall 3).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/.venv"
LOCK="$HERE/requirements.lock.txt"
RECREATE=0
RELOCK=0
for arg in "$@"; do
  case "$arg" in
    --recreate) RECREATE=1 ;;
    --relock) RELOCK=1 ;;
  esac
done

if [ "$RECREATE" = "1" ] && [ -d "$VENV" ]; then
  rm -rf "$VENV"
fi

if [ ! -x "$VENV/bin/python" ]; then
  # --seed: `uv venv` is pip-less by default; this script's pip-based install
  # steps below need pip actually present in the venv.
  uv venv --python 3.11 --seed "$VENV"
fi

"$VENV/bin/pip" install -r "$HERE/requirements.txt"

# requirements.lock.txt is the audit record of what was actually installed
# when the spike's findings were produced — it must not be silently
# overwritten by a later `bash setup.sh` run (WR-04). Write it only on first
# bootstrap or when explicitly asked (--relock); otherwise diff this run's
# freeze against the committed lock and warn (not fail) on drift, so the
# operator sees it rather than the record quietly changing under them.
if [ ! -f "$LOCK" ] || [ "$RELOCK" = "1" ]; then
  "$VENV/bin/pip" freeze > "$LOCK"
else
  FROZEN="$("$VENV/bin/pip" freeze)"
  if [ "$FROZEN" != "$(cat "$LOCK")" ]; then
    echo "WARNING: installed packages drifted from committed requirements.lock.txt — review with 'bash setup.sh --relock' if intentional" >&2
  fi
fi

echo "python: $("$VENV/bin/python" --version)"
echo "stark-qa: $("$VENV/bin/python" -c 'import stark_qa; print(getattr(stark_qa, "__version__", "unknown"))')"
