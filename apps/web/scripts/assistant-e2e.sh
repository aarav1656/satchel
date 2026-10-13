#!/usr/bin/env bash
# The assistant loop on a served export (default) or a deployed origin (ORIGIN=https://...): Pip, Fern, grant, revoke, reseal, regrant,
# with a virtual passkey authenticator in one pinned deepsurge tab, under the shared recording lock. The owner address is funded from
# outside the page once it is shown; every transaction is then read back from the chain with viem.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-5190}
DAY=$(date +%F)
LOG=${DRIVE_LOG:-/tmp/satchel-assistant-drive.log}
LABEL=${LABEL:+-$LABEL}
OUT=results/assistant$LABEL-$DAY.txt
CHAIN=results/assistant-onchain$LABEL-$DAY.txt
export VAUTH=1 PIN_FILE="${PIN_FILE:-$HOME/.cache/qa-tab-satchel-ai}" ORIGIN="${ORIGIN:-http://satchel.localhost:$PORT}"

if [[ "$ORIGIN" == http://*localhost* ]]; then
  [ -f out/index.html ] || { echo "no export in out/: run bun run build" >&2; exit 1; }
  if ! curl -sf "http://localhost:$PORT/" >/dev/null; then (bun scripts/serve.mjs "$PORT" >/tmp/satchel-serve.log 2>&1 &); sleep 2; fi
else
  curl -sf "$ORIGIN/pip/" >/dev/null || { echo "$ORIGIN is not answering" >&2; exit 1; }
fi
rm -f /tmp/satchel-assistant-funded

lockf -t 1800 /tmp/deepsurge-rec.lock bun scripts/drive.mjs "$ORIGIN/" scripts/steps-assistant.mjs /tmp 2>"$LOG" >/dev/null &
DRIVER=$!
trap 'kill $DRIVER 2>/dev/null || true' EXIT

OWNER=""
for _ in $(seq 1 1900); do
  if grep -q 'OWNER address=0x' "$LOG"; then OWNER=$(grep -o 'OWNER address=0x[0-9a-fA-F]\{40\}' "$LOG" | head -1 | cut -d= -f2 || true); break; fi
  sleep 1
done
[ -n "$OWNER" ] || { echo "the page never showed an owner address" >&2; tail -5 "$LOG"; exit 1; }
FUNDED=$(bun scripts/fund-owner.ts "$OWNER" assistant-e2e)
touch /tmp/satchel-assistant-funded
STATUS=0
wait $DRIVER || STATUS=$?

GRANT=$(grep -o 'GRANT id=[0-9]* tx=0x[0-9a-f]\{64\}' "$LOG" | head -1 || true)
REVOKE=$(grep -o 'REVOKE id=[0-9]* tx=0x[0-9a-f]\{64\}' "$LOG" | head -1 || true)
REGRANT_TX=$(grep -o 'REGRANT tx=0x[0-9a-f]\{64\}' "$LOG" | head -1 | sed 's/.*tx=//' || true)
PUB=$(grep -o 'CONNECT app=Fern pub=0x[0-9a-f]\{130\}' "$LOG" | head -1 | sed 's/.*pub=//' || true)
{
  echo "satchel assistant loop, $(date -u +%FT%TZ), origin $ORIGIN, virtual authenticator ctap2/internal with PRF, pinned deepsurge tab, chat: ${LLM:-stand-in}"
  echo "registry: $(grep -o '"address": "[^"]*"' ../../deployments/testnet.json) chain 10143; driver exit status: $STATUS"
  echo "(after the page showed the owner, outside the page) $FUNDED"
  echo
  node scripts/format-log.mjs "$LOG"
} | tee "$OUT"

if [ -n "$GRANT" ] && [ -n "$REVOKE" ] && [ -n "$PUB" ] && [ -n "$REGRANT_TX" ]; then
  GID=${GRANT#GRANT id=}; GID=${GID%% *}; GTX=${GRANT##*tx=}; RTX=${REVOKE##*tx=}
  { echo "independent on-chain read, viem against the Monad testnet RPC, not the SDK, owner $OWNER"; bun scripts/verify-assistant-onchain.ts "$OWNER" "$GID" "$GTX" "$RTX" "$PUB" "$REGRANT_TX"; } | tee "$CHAIN" || STATUS=1
else
  echo "FAIL the page never printed GRANT, REVOKE, REGRANT and CONNECT lines" | tee "$CHAIN"; STATUS=1
fi
exit $STATUS
