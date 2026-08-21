#!/usr/bin/env bash
# Provision the isolated stark-qa venv (D-07, D-08).
#
# Usage:
#   bash setup.sh              # create .venv if missing, install pins, freeze lock
#   bash setup.sh --recreate   # force-recreate .venv even if it already exists
#
# Uses `uv venv --python 3.11`, NOT a bare `python3.11 -m venv` — this dev
# machine has no bare python3.11 on PATH (python3 is 3.13.x, /usr/bin/python3
# is 3.12.x), while uv already has cpython-3.11.15 installed locally, so this
# resolves with zero network fetch (RESEARCH.md Pitfall 3).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/.venv"
RECREATE=0
[ "${1:-}" = "--recreate" ] && RECREATE=1

if [ "$RECREATE" = "1" ] && [ -d "$VENV" ]; then
  rm -rf "$VENV"
fi

if [ ! -x "$VENV/bin/python" ]; then
  # --seed: `uv venv` is pip-less by default; this script's pip-based install
  # steps below need pip actually present in the venv.
  uv venv --python 3.11 --seed "$VENV"
fi

"$VENV/bin/pip" install -r "$HERE/requirements.txt"
"$VENV/bin/pip" freeze > "$HERE/requirements.lock.txt"

echo "python: $("$VENV/bin/python" --version)"
echo "stark-qa: $("$VENV/bin/python" -c 'import stark_qa; print(getattr(stark_qa, "__version__", "unknown"))')"
