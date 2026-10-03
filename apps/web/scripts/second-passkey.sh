#!/usr/bin/env bash
# The second-passkey scenario against ORIGIN (default: the local static export), pinned tab, virtual authenticator with PRF.
set -uo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-5190}
LABEL=${LABEL:+-$LABEL}
export VAUTH=1 PIN_FILE="${PIN_FILE:-$HOME/.cache/qa-tab-satchel-web}" ORIGIN="${ORIGIN:-http://satchel.localhost:$PORT}"
if [[ "$ORIGIN" == http://*localhost* ]]; then
  [ -f out/index.html ] || { echo "no export in out/: run bun run build" >&2; exit 1; }
  curl -sf "http://localhost:$PORT/" >/dev/null || (bun scripts/serve.mjs "$PORT" >/tmp/satchel-serve.log 2>&1 &)
  sleep 2
fi
RAW=/tmp/satchel-second-passkey$LABEL.log
bun scripts/drive.mjs "$ORIGIN/" scripts/steps-second-passkey.mjs /tmp 2>"$RAW" >/dev/null; STATUS=$?
OUT=results/second-passkey$LABEL-$(date +%F).txt
{ echo "satchel second passkey, $(date -u +%FT%TZ), origin $ORIGIN, virtual authenticator ctap2/internal with PRF, driver exit status $STATUS (0 = every assert and poll held)"; echo; node scripts/format-log.mjs "$RAW"; } | tee "$OUT"
exit $STATUS
