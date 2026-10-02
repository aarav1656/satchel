#!/usr/bin/env bash
# The real entry point: the static export served on localhost, one pinned deepsurge tab, a virtual authenticator with PRF.
# The quickstart Run button executes, Pip enrols and seals, Allow on the unfunded Pip owner shows OWNER_UNFUNDED, the owner is funded
# (0.1 MON from the satchel deployer, outside the page), Fern is granted and rebuilds the grant from the transaction hash, a Fern on
# another origin is refused, Pip revokes, Fern is locked out of new data, Pip regrants; then every receipt is read back from chain with viem.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-5190}
DAY=$(date +%F)
LOG=/tmp/satchel-web-drive.log
OUT=results/click-through-$DAY.txt
CHAIN=results/onchain-$DAY.txt
export VAUTH=1 PIN_FILE="${PIN_FILE:-$HOME/.cache/qa-tab-satchel}" ORIGIN="${ORIGIN:-http://satchel.localhost:$PORT}"

[ -f out/index.html ] || { echo "no export in out/: run bun run build" >&2; exit 1; }
if ! curl -sf "http://localhost:$PORT/" >/dev/null; then (bun scripts/serve.mjs "$PORT" >/tmp/satchel-serve.log 2>&1 &); sleep 2; fi
curl -sf "http://localhost:$PORT/pip/" >/dev/null || { echo "static server not answering on $PORT" >&2; exit 1; }
rm -f /tmp/satchel-web-funded

bun scripts/drive.mjs "$ORIGIN/" scripts/steps-click-through.mjs /tmp 2>"$LOG" >/dev/null &
DRIVER=$!
trap 'kill $DRIVER 2>/dev/null || true' EXIT

# The owner address is shown at enrol; fund it only after the page has shown OWNER_UNFUNDED, so the unfunded path is exercised first.
OWNER=""
for _ in $(seq 1 240); do
  if grep -q 'UNFUNDED .*OWNER_UNFUNDED' "$LOG"; then OWNER=$(grep -o 'OWNER address=0x[0-9a-fA-F]\{40\}' "$LOG" | head -1 | cut -d= -f2 || true); break; fi
  sleep 1
done
[ -n "$OWNER" ] || { echo "the page never showed OWNER_UNFUNDED, or no owner address reached it" >&2; tail -5 "$LOG"; exit 1; }
FUNDED=$(bun scripts/fund-owner.ts "$OWNER")
touch /tmp/satchel-web-funded
STATUS=0
wait $DRIVER || STATUS=$?

GRANT=$(grep -o 'GRANT id=[0-9]* tx=0x[0-9a-f]\{64\}' "$LOG" | head -1 || true)
REVOKE=$(grep -o 'REVOKE id=[0-9]* tx=0x[0-9a-f]\{64\}' "$LOG" | head -1 || true)
REGRANT_TX=$(grep -o 'REGRANT tx=0x[0-9a-f]\{64\}' "$LOG" | head -1 | sed 's/.*tx=//' || true)
REGRANT_ID=$(grep -o 'REGRANT tx=0x[0-9a-f]\{64\}.*' "$LOG" | head -1 | grep -o 'id=[0-9]* active=true' | head -1 | sed 's/id=\([0-9]*\) .*/\1/' || true)
PUB=$(grep -o 'CONNECT app=Fern pub=0x[0-9a-f]\{130\}' "$LOG" | head -1 | sed 's/.*pub=//' || true)
{
  echo "satchel web click-through, $(date -u +%FT%TZ), origin $ORIGIN, static export (out/), virtual authenticator ctap2/internal with PRF, pinned deepsurge tab"
  echo "registry: $(grep -o '"address": "[^"]*"' ../../deployments/testnet.json) chain 10143; driver exit status: $STATUS"
  echo "(after the page showed OWNER_UNFUNDED, outside the page) $FUNDED"
  echo
  node scripts/format-log.mjs "$LOG"
} | tee "$OUT"

if [ -n "$GRANT" ] && [ -n "$REVOKE" ] && [ -n "$PUB" ] && [ -n "$REGRANT_TX" ] && [ -n "$REGRANT_ID" ]; then
  GID=${GRANT#GRANT id=}; GID=${GID%% *}; GTX=${GRANT##*tx=}; RTX=${REVOKE##*tx=}
  { echo "independent on-chain read, viem against the Monad testnet RPC, not the SDK, owner $OWNER"; bun scripts/verify-onchain.ts "$OWNER" "$GID" "$GTX" "$RTX" "$PUB" "$REGRANT_ID" "$REGRANT_TX"; } | tee "$CHAIN" || STATUS=1
else
  echo "FAIL the page never printed GRANT, REVOKE, REGRANT and CONNECT lines" | tee "$CHAIN"; STATUS=1
fi
exit $STATUS
