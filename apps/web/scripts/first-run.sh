#!/usr/bin/env bash
# The first-run scenarios against ORIGIN (default the local static server), one pinned deepsurge tab, a virtual authenticator with PRF.
# Real input for a, b, c; the synthetic element.click() run is recorded beside them. Logs: results/first-run-<label>-<scenario>.txt
set -uo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-5190}
LABEL=${1:-local}
export VAUTH=1 PIN_FILE="${PIN_FILE:-$HOME/.cache/qa-tab-satchel}" ORIGIN="${ORIGIN:-http://satchel.localhost:$PORT}"
if [ "$LABEL" = local ]; then
  [ -f out/index.html ] || { echo "no export in out/" >&2; exit 1; }
  curl -sf "http://localhost:$PORT/" >/dev/null || (bun scripts/serve.mjs "$PORT" >/tmp/satchel-serve.log 2>&1 &) ; sleep 1
fi
ALL=0
for SC in ${SCENARIOS:-a b c synthetic}; do
  RAW=/tmp/satchel-first-run-$LABEL-$SC.log
  SCENARIO=$SC bun scripts/drive.mjs "$ORIGIN/" scripts/steps-first-run.mjs /tmp 2>"$RAW" >/dev/null
  STATUS=$?
  OUT=results/first-run-$LABEL-$SC.txt
  { echo "satchel first-run scenario $SC, $(date -u +%FT%TZ), origin $ORIGIN, driver exit status $STATUS (0 = every assert and poll held)"; echo; node scripts/format-log.mjs "$RAW"; } | tee "$OUT"
  [ "$SC" = synthetic ] || [ "$STATUS" = 0 ] || ALL=1
  echo
done
exit $ALL
