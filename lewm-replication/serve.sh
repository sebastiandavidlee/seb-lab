#!/usr/bin/env bash
# serve.sh — one-line local server for the LeWorldModel demo site.
# Usage:   ./serve.sh           # serves on :8000
#          ./serve.sh 8080      # serves on :8080
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
PORT="${1:-8000}"
echo "Serving LeWM site at http://localhost:${PORT}"
exec python3 -m http.server "${PORT}"
