#!/usr/bin/env bash
# Real WebAuthn PRF ceremony through trustset's patched web/src/lib/sealed.ts, in the pinned deepsurge tab, against
# trustset's own SealedNotes and KillSwitch on a local anvil. Run 1: authenticator A (old-format note by the unpatched
# module, three satchel notes, open all in one session, fresh load, open again). Run 2: authenticator B tries them.
# Run 3: a mutant of sealed.ts that does not keep the session, to show the prompt counter can go red.
set -euo pipefail
cd "$(dirname "$0")"
HARNESS_DIR=$PWD
TRUSTSET_ROOT="${TRUSTSET_ROOT:-/tmp/trustset}"

if [ ! -f "$TRUSTSET_ROOT/web/package.json" ]; then
  echo "ERROR: TRUSTSET_ROOT=$TRUSTSET_ROOT is missing web/package.json" >&2
  exit 1
fi
if [ ! -f "$TRUSTSET_ROOT/web/package-lock.json" ] || [ ! -f "$TRUSTSET_ROOT/web/src/lib/sealed.ts" ]; then
  echo "ERROR: TRUSTSET_ROOT=$TRUSTSET_ROOT needs package-lock.json and the patched web/src/lib/sealed.ts" >&2
  exit 1
fi

TS="$TRUSTSET_ROOT"
NPM_CACHE=$(mktemp -d /tmp/satchel-trustset-npm.XXXXXX)
cleanup() { kill ${ANVIL:-} ${SERVER:-} 2>/dev/null || true; rm -f "$HARNESS_DIR/sealed-mutant.ts"; rm -rf "$NPM_CACHE"; }
trap cleanup EXIT
RIG=$(cd ../../../test-rig && pwd)
RPC_PORT=8561 PORT=5191 ART=/tmp/ts-out
OUT=../results/ceremony.log
LOG1=/tmp/trustset-run1.log LOG2=/tmp/trustset-run2.log LOG3=/tmp/trustset-run3.log LOG4=/tmp/trustset-run4.log
export VAUTH=1 PIN_FILE="$HOME/.cache/qa-tab-satchel-trustset"

REGISTRY_META=$(npm_config_registry=https://registry.npmjs.org npm view satchel-sdk@0.1.0 version dist.tarball dist.integrity --json)
node -e 'const p=JSON.parse(process.argv[1]); if(p.version!=="0.1.0"||p["dist.tarball"]!=="https://registry.npmjs.org/satchel-sdk/-/satchel-sdk-0.1.0.tgz"||!p["dist.integrity"]?.startsWith("sha512-")) process.exit(1)' "$REGISTRY_META"
echo "=== CLEAN REGISTRY INSTALL: satchel-sdk@0.1.0 ==="
cd "$TS/web"
npm_config_registry=https://registry.npmjs.org npm ci --cache "$NPM_CACHE" --prefer-online
node -e 'const m=JSON.parse(process.argv[1]),l=require("./package-lock.json").packages["node_modules/satchel-sdk"],i=require("./node_modules/satchel-sdk/package.json"); if(!l||l.version!==m.version||l.resolved!==m["dist.tarball"]||l.integrity!==m["dist.integrity"]||i.version!==m.version) process.exit(1); console.log(`PASS satchel-sdk@${l.version} resolved=${l.resolved} integrity=${l.integrity}`)' "$REGISTRY_META"
if rg -n '"resolved": "file:|/tmp/satchel-pack' package-lock.json package.json; then
  echo "ERROR: consumer lock contains a local package source" >&2
  exit 1
fi
printf 'Command: npm_config_registry=https://registry.npmjs.org npm view satchel-sdk@0.1.0 version dist.tarball dist.integrity --json\nRegistry URL: %s\nRegistry version: %s\nRegistry integrity: %s\n' \
  "$(node -e 'console.log(JSON.parse(process.argv[1])["dist.tarball"])' "$REGISTRY_META")" \
  "$(node -e 'console.log(JSON.parse(process.argv[1]).version)' "$REGISTRY_META")" \
  "$(node -e 'console.log(JSON.parse(process.argv[1])["dist.integrity"])' "$REGISTRY_META")" \
  > "$HARNESS_DIR/../results/registry-resolution.txt"
npm run typecheck
echo "PASS consumer typecheck: npm run typecheck"
npm run build
echo "PASS consumer build: npm run build"
cd "$HARNESS_DIR"

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

echo "=== BUILD TRUSTSET CONTRACT ARTIFACTS FOR LOCAL ANVIL ==="
forge build --root "$TS" --out "$ART"

anvil --port $RPC_PORT --silent & ANVIL=$!
node serve.mjs $PORT & SERVER=$!
sleep 2
rm -f /tmp/trustset-harness-url-load2; echo "http://localhost:$PORT/?load=2" > /tmp/trustset-harness-url-load2

SETUP=$(node setup.mjs "http://127.0.0.1:$RPC_PORT" $ART)
node $RIG/cdp-drive.mjs "http://localhost:$PORT/?load=1" steps-run1.json /tmp/ts-browser-output 2>$LOG1 >/dev/null
node $RIG/cdp-drive.mjs "http://localhost:$PORT/?load=3" steps-run2.json /tmp/ts-browser-output 2>$LOG2 >/dev/null
SETUP3=$(node setup.mjs "http://127.0.0.1:$RPC_PORT" $ART)
node $RIG/cdp-drive.mjs "http://localhost:$PORT/?b=mutant" steps-mutant.json /tmp/ts-browser-output 2>$LOG3 >/dev/null
SETUP4=$(node setup.mjs "http://127.0.0.1:$RPC_PORT" $ART)
node $RIG/cdp-drive.mjs "http://localhost:$PORT/?load=4" steps-legacy.json /tmp/ts-browser-output 2>$LOG4 >/dev/null
rg -q 'OPENOLD old-format note opened by patched openNote, match=true' "$LOG1"
rg -q 'OPEN3 opened 3 satchel notes, all match=true' "$LOG1"
rg -q 'NEGSAT code=WRONG_PASSKEY' "$LOG2"
rg -q 'SEAL3 sealed 3 notes.*prompts_since_seal3_start=1' "$LOG1"
rg -q 'SEAL3 sealed 3 notes.*prompts_since_seal3_start=3' "$LOG3"
rg -q 'OPEN3 opened 3 satchel notes, all match=true, prompts_since_session_start=6' "$LOG3"
rg -q 'LEGACY3 unpatched module.*all match=true' "$LOG4"
echo "PASS browser assertions: old-format open, seal/open, wrong-passkey refusal, session-cache negative control"

{
  echo "trustset sealed.ts harness, $(date -u +%FT%TZ), origin http://localhost:$PORT, virtual authenticator ctap2/internal, resident key, user verification, PRF"
echo "patched module: $TS/web/src/lib/sealed.ts git blob $(git -C $TS hash-object web/src/lib/sealed.ts), based on upstream main $(git -C $TS rev-parse --short main)"
  echo "unpatched module: main:web/src/lib/sealed.ts git blob $(git -C $TS rev-parse main:web/src/lib/sealed.ts)"
echo "sdk source: https://registry.npmjs.org/satchel-sdk/-/satchel-sdk-0.1.0.tgz (satchel-sdk@0.1.0)  contracts: trustset src/SealedNotes.sol + KillSwitch.sol on local anvil"
  echo "PASS clean registry install: npm ci --registry=https://registry.npmjs.org"
  echo "PASS consumer typecheck/build: npm run typecheck; npm run build"
  echo "PASS Trustset contract artifacts: forge build --root $TS --out $ART; deployed only to local Anvil"
  echo "npm_config_registry=https://registry.npmjs.org npm view satchel-sdk@0.1.0 version dist.tarball dist.integrity --json"
  node -e 'const p=JSON.parse(process.argv[1]); console.log(`registry metadata: version=${p.version} resolved=${p["dist.tarball"]} integrity=${p["dist.integrity"]}`)' "$REGISTRY_META"
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
