#!/usr/bin/env bash
# Real WebAuthn PRF ceremony through Firsthand's packages/sdk/src/webauthn/satchel.ts, in the pinned deepsurge tab
# (cdp-tab.mjs, VAUTH=1: virtual authenticator with PRF). No chain, no transactions.
# Run 1: two passkeys; Firsthand's own unlock; satchel-sdk beside it (naive); the adapter over WebAuthnPrfSource and
# over Mera; Mera with its default salt (control); a fresh page load; the second passkey.
# Run 2: a mutant adapter whose key tree is built from the wrong root, to show the equality check can go red.
set -euo pipefail
cd "$(dirname "$0")"
FH=/tmp/firsthand SDK=/tmp/firsthand/packages/sdk
CDP="$HOME/.claude/scratch/cdp-tab.mjs"
PORT=5192 OUT=../results/ceremony.log
LOG1=/tmp/firsthand-run1.log LOG2=/tmp/firsthand-run2.log
export CDP_PORT=${CDP_PORT:-9396} VAUTH=1 PIN_FILE="$HOME/.cache/qa-tab-satchel-firsthand"

MUT=$SDK/src/webauthn/satchel-mutant.ts
sed 's/const keys = KeyTree.fromPrf(prf);/const keys = KeyTree.fromPrf(new Uint8Array(root));/' $SDK/src/webauthn/satchel.ts > $MUT
cmp -s $SDK/src/webauthn/satchel.ts $MUT && { echo "mutation did not apply" >&2; exit 1; }
trap 'kill ${SERVER:-} 2>/dev/null || true; rm -f $MUT tsconfig.build.json' EXIT
bundle() { # $1 adapter file, $2 outfile
  cat > tsconfig.build.json <<J
{"compilerOptions":{"baseUrl":".","paths":{
"@fh/satchel":["$1"],
"@fh/prf":["$SDK/src/webauthn/WebAuthnPrfSource.ts"],
"@fh/core":["$FH/packages/core/dist/index.js"],
"@fh/crypto":["$FH/packages/crypto/dist/index.js"],
"@fh/satchel-sdk":["$SDK/node_modules/satchel-sdk/dist/index.js"],
"@fh/mera":["$SDK/node_modules/@category-labs/mera/dist/index.js"]}}}
J
  bun build harness.ts --outfile "dist/$2" --target browser --tsconfig-override tsconfig.build.json >/dev/null 2> >(grep -v "Internal error" >&2 || true)
}
bundle "$SDK/src/webauthn/satchel.ts" harness.js
bundle "$MUT" harness-mutant.js
# one copy of the satchel code in each bundle, or the adapter and the harness would talk to different modules
for f in dist/harness.js dist/harness-mutant.js; do echo "$f sealWith definitions: $(grep -c 'async function sealWith' $f)"; done

node serve.mjs $PORT & SERVER=$!
sleep 1
echo "http://localhost:$PORT/?load=2" > /tmp/firsthand-harness-url-reload

node $CDP "http://localhost:$PORT/" steps-run1.json /tmp 2>$LOG1 >/dev/null
node $CDP "http://localhost:$PORT/?b=mutant" steps-mutant.json /tmp 2>$LOG2 >/dev/null

{
  echo "firsthand satchel adapter harness, $(date -u +%FT%TZ), origin http://localhost:$PORT, virtual authenticator ctap2/internal, resident key, user verification, PRF, no chain"
  echo "adapter: $FH packages/sdk/src/webauthn/satchel.ts git blob $(git -C $FH rev-parse HEAD~1:packages/sdk/src/webauthn/satchel.ts) on branch $(git -C $FH branch --show-current), base $(git -C $FH rev-parse --short main)"
  echo "unmodified: WebAuthnPrfSource.ts blob $(git -C $FH rev-parse HEAD:packages/sdk/src/webauthn/WebAuthnPrfSource.ts), KeyTree (packages/crypto/src/kdf/keytree.ts) blob $(git -C $FH rev-parse HEAD:packages/crypto/src/kdf/keytree.ts)"
  echo "satchel-sdk tarball sha256 prefix: $(shasum -a 256 /tmp/satchel-pack-fh/satchel-sdk-0.1.0.tgz | cut -c1-16)"
  echo; echo "=== RUN 1: two passkeys, Firsthand's own unlock, satchel beside it, the adapter two ways, a control, a fresh load ==="
  node format-results.mjs $LOG1
  echo; echo "=== RUN 2 (mutant): the adapter's key tree built from the satchel root instead of the PRF output ==="
  node format-results.mjs $LOG2
} | tee $OUT
