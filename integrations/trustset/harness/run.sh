#!/usr/bin/env bash
# Real WebAuthn PRF ceremony through trustset's patched web/src/lib/sealed.ts, in the pinned deepsurge tab, against
# trustset's own SealedNotes and KillSwitch on a local anvil. Run 1: authenticator A (old-format note by the unpatched
# module, three satchel notes, open all in one session, fresh load, open again). Run 2: authenticator B tries them.
# Run 3: a mutant of sealed.ts that does not keep the session, to show the prompt counter can go red.
set -euo pipefail
cd "$(dirname "$0")"
TS=/tmp/trustset
RIG=./test-rig
RPC_PORT=8561 PORT=5191 ART=/tmp/ts-out
OUT=../results/ceremony.log
LOG1=/tmp/trustset-run1.log LOG2=/tmp/trustset-run2.log LOG3=/tmp/trustset-run3.log LOG4=/tmp/trustset-run4.log
export VAUTH=1 PIN_FILE="$HOME/.cache/qa-tab-satchel"

git -C $TS show main:web/src/lib/sealed.ts > legacy-sealed.ts
SEALED=$TS/web/src/lib/sealed.ts
# mutant: the same file with the session cache removed, so every seal and open prompts again
sed 's/const s = session ??= open({ rpId: location.hostname });/const s = open({ rpId: location.hostname });/' $SEALED > sealed-mutant.ts
cmp -s $SEALED sealed-mutant.ts && { echo "mutation did not apply" >&2; exit 1; }
bundle() { # $1 entry alias target, $2 outfile
  printf '{"compilerOptions":{"baseUrl":".","paths":{"@sealed":["%s"]}}}' "$1" > tsconfig.build.json
  bun build harness.ts --outfile "dist/$2" --target browser --tsconfig-override tsconfig.build.json >/dev/null
}
bundle "$SEALED" harness.js
bundle "$PWD/sealed-mutant.ts" harness-mutant.js

anvil --port $RPC_PORT --silent & ANVIL=$!
node serve.mjs $PORT & SERVER=$!
trap 'kill $ANVIL $SERVER ${CDP:-} 2>/dev/null || true; rm -f sealed-mutant.ts' EXIT
sleep 2
rm -f /tmp/trustset-harness-url-load2; echo "http://localhost:$PORT/?load=2" > /tmp/trustset-harness-url-load2
mkdir -p /tmp/trustset-shots

SETUP=$(node setup.mjs "http://127.0.0.1:$RPC_PORT" $ART)
node $RIG/cdp-drive.mjs "http://localhost:$PORT/?load=1" steps-run1.json /tmp/trustset-shots 2>$LOG1 >/dev/null
node $RIG/cdp-drive.mjs "http://localhost:$PORT/?load=3" steps-run2.json /tmp/trustset-shots 2>$LOG2 >/dev/null
SETUP3=$(node setup.mjs "http://127.0.0.1:$RPC_PORT" $ART)
node $RIG/cdp-drive.mjs "http://localhost:$PORT/?b=mutant" steps-mutant.json /tmp/trustset-shots 2>$LOG3 >/dev/null
SETUP4=$(node setup.mjs "http://127.0.0.1:$RPC_PORT" $ART)
node $RIG/cdp-drive.mjs "http://localhost:$PORT/?load=4" steps-legacy.json /tmp/trustset-shots 2>$LOG4 >/dev/null

{
  echo "trustset sealed.ts harness, $(date -u +%FT%TZ), origin http://localhost:$PORT, virtual authenticator ctap2/internal, resident key, user verification, PRF"
  echo "patched module: $TS/web/src/lib/sealed.ts git blob $(git -C $TS rev-parse HEAD:web/src/lib/sealed.ts) on branch $(git -C $TS branch --show-current)"
  echo "unpatched module: main:web/src/lib/sealed.ts git blob $(git -C $TS rev-parse main:web/src/lib/sealed.ts)"
  echo "sdk tarball: $(shasum -a 256 /tmp/satchel-pack/satchel-sdk-0.1.0.tgz | cut -c1-16)  contracts: trustset src/SealedNotes.sol + KillSwitch.sol on anvil"
  echo "$SETUP"
  echo; echo "=== RUN 1 (authenticator A): old-format note by the unpatched module, seal 3, open 3 in one session, fresh load, open 3 again, open the old note ==="
  node $RIG/format-results.mjs $LOG1
  echo; echo "=== RUN 2 (authenticator B, new CDP session): a different passkey tries the same notes ==="
  node $RIG/format-results.mjs $LOG2
  echo; echo "=== RUN 3 (control, fresh chain, authenticator C): mutant sealed.ts with the session cache removed ==="
  echo "$SETUP3"
  node $RIG/format-results.mjs $LOG3
  echo; echo "=== RUN 4 (baseline, fresh chain, authenticator D): the unpatched module seals and opens the same three notes ==="
  echo "$SETUP4"
  node $RIG/format-results.mjs $LOG4
} | tee $OUT
