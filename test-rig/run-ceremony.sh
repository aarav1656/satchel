#!/usr/bin/env bash
# Real WebAuthn PRF ceremony against a CDP virtual authenticator, driven in the pinned deepsurge tab, plus live grant and
# revoke on the Monad testnet registry by the passkey-derived owner.
# Run 1: enrol, seal, (fund owner), fresh page load, open, unseal, second namespace, grant and revoke on Monad.
# Run 2: a different virtual authenticator tries the run 1 blob.
set -euo pipefail
cd "$(dirname "$0")"
PORT=5183
OUT="results/ceremony-$(date +%F).txt"
LOG1=/tmp/satchel-rig-run1.log LOG2=/tmp/satchel-rig-run2.log
(cd ../packages/sdk && bun run build >/dev/null)
bun build rig.ts --outdir dist --target browser >/dev/null
node serve.mjs "$PORT" & SERVER=$!
trap 'kill $SERVER ${CDP:-} 2>/dev/null || true' EXIT
sleep 1
rm -f /tmp/satchel-rig-url-load2
export VAUTH=1 PIN_FILE="$HOME/.cache/qa-tab-satchel"
mkdir -p /tmp/satchel-rig-shots

node cdp-drive.mjs "http://localhost:$PORT/?load=1" steps-run1.json /tmp/satchel-rig-shots 2>"$LOG1" >/dev/null & CDP=$!
OWNER=""
for _ in $(seq 1 90); do
  OWNER=$(grep -o 'OWNER address=0x[0-9a-fA-F]\{40\}' "$LOG1" | head -1 | cut -d= -f2 || true)
  [ -n "$OWNER" ] && break
  sleep 1
done
[ -n "$OWNER" ] || { echo "no owner address reached the page output" >&2; kill $CDP; exit 1; }
FUNDED=$(bun fund-owner.ts "$OWNER")
echo "http://localhost:$PORT/?load=2" > /tmp/satchel-rig-url-load2
wait $CDP
node cdp-drive.mjs "http://localhost:$PORT/?load=3" steps-run2.json /tmp/satchel-rig-shots 2>"$LOG2" >/dev/null

GRANT=$(grep -o 'GRANT id=[0-9]* epoch=[0-9]* tx=0x[0-9a-f]\{64\} nsHash=0x[0-9a-f]\{64\} owner=0x[0-9a-fA-F]\{40\}' "$LOG1" | head -1 || true)
REVOKE=$(grep -o 'REVOKE id=[0-9]* newEpoch=[0-9]* tx=0x[0-9a-f]\{64\}' "$LOG1" | head -1 || true)
{
  echo "satchel SDK ceremony, $(date -u +%FT%TZ), origin http://localhost:$PORT, virtual authenticator ctap2/internal, resident key, user verification, PRF"
  echo "sdk build: $(shasum -a 256 ../packages/sdk/dist/session.js | cut -c1-16)  rig bundle: $(shasum -a 256 dist/rig.js | cut -c1-16)"
  echo "registry: $(grep -o '"address": "[^"]*"' ../deployments/testnet.json) chain 10143 (deployments/testnet.json)"
  echo; echo "=== RUN 1 (authenticator A): enrol, seal, fund owner, fresh page load, open, unseal, second namespace, live grant and revoke ==="
  node format-results.mjs "$LOG1" | sed 's/^FP /FP /'
  echo "(between enrol and the fresh load, outside the page) $FUNDED"
  echo; echo "=== RUN 2 (authenticator B, new CDP session): open fails, enrol, try the run 1 blob ==="
  node format-results.mjs "$LOG2"
  echo; echo "=== INDEPENDENT ON-CHAIN READ (viem against the Monad testnet RPC, not the SDK) ==="
  if [ -n "$GRANT" ] && [ -n "$REVOKE" ]; then
    GID=$(echo "$GRANT" | sed 's/.* id=\([0-9]*\) .*/\1/'); GTX=$(echo "$GRANT" | sed 's/.* tx=\(0x[0-9a-f]*\) .*/\1/')
    NSH=$(echo "$GRANT" | sed 's/.* nsHash=\(0x[0-9a-f]*\) .*/\1/'); RTX=$(echo "$REVOKE" | sed 's/.* tx=\(0x[0-9a-f]*\)$/\1/')
    bun verify-onchain.ts "$OWNER" "$GID" "$GTX" "$RTX" "$NSH"
  else
    echo "FAIL the page never printed GRANT and REVOKE lines"
  fi
} | tee "$OUT"
