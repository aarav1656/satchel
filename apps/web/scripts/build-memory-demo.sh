#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export NEXT_PUBLIC_NOTE_BUS="${NEXT_PUBLIC_NOTE_BUS:-http://127.0.0.1:5193}"
export NEXT_PUBLIC_SEALER_ORIGIN="${NEXT_PUBLIC_SEALER_ORIGIN:-http://127.0.0.1:5190}"
exec bun run build
