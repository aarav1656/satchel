#!/usr/bin/env bash
# Real WebAuthn PRF ceremonies through Curb's web/src/lib/passkey/keys.ts, in the pinned deepsurge tab, against a virtual
# platform authenticator with PRF. Four runs, each on its own authenticator (cdp-tab.mjs adds a fresh one per run):
#   1 patched module on passkey A: create, signIn, main's signIn on the same passkey, owner and trading unlock by both, fresh load.
#   2 patched module on passkey B: a different passkey.
#   3 mutant (second PRF output discarded) on passkey C: the control that shows the prompt counter can go red.
#   4 unpatched main on passkey D: create, signIn, then the patch reads the passkey main made.
# Nothing is sent to any chain and no key is printed: the page reports addresses and the count of navigator.credentials calls.
set -euo pipefail
cd "$(dirname "$0")"
CURB=/tmp/curb
CDP=$HOME/.claude/scratch/cdp-tab.mjs
PORT=5197
LOGS=/tmp/curb-run
OUT=../results/ceremony.log
export VAUTH=1 PIN_FILE="$HOME/.cache/qa-tab-satchel-curb"
for i in 1 2 3 4 5 6; do CDP_PORT=$(timeout 12 bhn deepsurge status 2>/dev/null | sed -nE "s/.*[[:space:]]([0-9]{4,5})[[:space:]]+RUNNING.*/\1/p" | head -1) && [ -n "$CDP_PORT" ] && break; sleep 3; done
[ -n "${CDP_PORT:-}" ] || { echo "deepsurge port not found" >&2; exit 1; }
export CDP_PORT
mkdir -p dist $LOGS
[ -e node_modules ] || ln -s $CURB/web/node_modules node_modules

PATCHED=$CURB/web/src/lib/passkey/keys.ts
git -C $CURB show main:web/src/lib/passkey/keys.ts > legacy-keys.ts
# mutant: the patch with the second PRF output thrown away, so every account setup falls back to a second prompt
sed 's/sink.prf = bytes32(prf?.results?.second);/sink.prf = undefined;/' $PATCHED > keys-mutant.ts
[ "$(grep -c 'sink.prf = undefined;' keys-mutant.ts)" = 2 ] || { echo "mutation did not apply twice" >&2; exit 1; }

bundle() { # $1 variant, $2 @keys target, $3 @cross target
  printf '{"compilerOptions":{"baseUrl":".","paths":{"@keys":["%s"],"@cross":["%s"]}}}' "$2" "$3" > tsconfig.build.json
  bun build harness.ts --outfile "dist/harness-$1.js" --target browser --tsconfig-override tsconfig.build.json >/dev/null
}
bundle patched "$PATCHED" "$PWD/legacy-keys.ts"
bundle mutant "$PWD/keys-mutant.ts" "$PWD/legacy-keys.ts"
bundle legacy "$PWD/legacy-keys.ts" "$PATCHED"

node serve.mjs $PORT & SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -f keys-mutant.ts' EXIT
sleep 1
echo "http://localhost:$PORT/?b=patched&load=2" > /tmp/curb-harness-url-load2
drive() { node $CDP "http://localhost:$PORT/?b=$2&load=1" steps-$1.json $LOGS 2>$LOGS/$1.log >/dev/null; }
drive run1 patched
drive run2 patched
drive run3 mutant
drive run4 legacy

{
  echo "curb keys.ts harness, $(date -u +%FT%TZ), origin http://localhost:$PORT, virtual authenticator ctap2/internal, resident key, user verification, PRF"
  echo "patched module: $PATCHED git blob $(git -C $CURB rev-parse HEAD:web/src/lib/passkey/keys.ts 2>/dev/null) committed on branch $(git -C $CURB branch --show-current)"
  echo "unpatched module: main:web/src/lib/passkey/keys.ts git blob $(git -C $CURB rev-parse main:web/src/lib/passkey/keys.ts)"
  echo; echo "=== RUN 1 (passkey A, patched module) ==="; node format.mjs $LOGS/run1.log
  echo; echo "=== RUN 2 (passkey B, patched module, a different passkey) ==="; node format.mjs $LOGS/run2.log
  echo; echo "=== RUN 3 (control, passkey C, mutant: second PRF output discarded) ==="; node format.mjs $LOGS/run3.log
  echo; echo "=== RUN 4 (baseline, passkey D, unpatched main creates and signs in, then the patch reads that passkey) ==="; node format.mjs $LOGS/run4.log
} | tee $OUT
