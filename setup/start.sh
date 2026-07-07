#!/usr/bin/env bash
# macOS / Linux launcher. Examples:
#   bash setup/start.sh                 # desktop app
#   bash setup/start.sh cli -- run --url https://example.com --prompt "..."
#   bash setup/start.sh server
set -euo pipefail
cd "$(dirname "$0")/.."
exec node setup/start.mjs "$@"
