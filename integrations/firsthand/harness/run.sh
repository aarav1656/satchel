#!/usr/bin/env bash
# Real WebAuthn PRF ceremony through Firsthand's packages/sdk/src/webauthn/satchel.ts, in the pinned deepsurge tab
# (cdp-tab.mjs, VAUTH=1: virtual authenticator with PRF). No chain, no transactions.
# Run 1: two passkeys; Firsthand's own unlock; satchel-sdk beside it (naive); the adapter over WebAuthnPrfSource and
# over Mera; Mera with its default salt (control); a fresh page load; the second passkey.
# Run 2: a mutant adapter whose key tree is built from the wrong root, to show the equality check can go red.
set -euo pipefail
cd "$(dirname "$0")"
HARNESS_DIR=$PWD
FH="${FIRSTHAND_ROOT:-/tmp/firsthand}" SDK="${FIRSTHAND_ROOT:-/tmp/firsthand}/packages/sdk"
if [ ! -f "$SDK/package.json" ] || [ ! -f "$SDK/src/webauthn/satchel.ts" ]; then
  echo "ERROR: FIRSTHAND_ROOT=$FH must be a patched Firsthand checkout with packages/sdk/package.json and src/webauthn/satchel.ts" >&2
  exit 1
fi
CDP="$HOME/.claude/scratch/cdp-tab.mjs"
PORT=5192 OUT=../results/ceremony.log
LOG1=/tmp/firsthand-run1.log LOG2=/tmp/firsthand-run2.log
MUT=$SDK/src/webauthn/satchel-mutant.ts
MUTANT_STEPS=$(mktemp /tmp/satchel-firsthand-mutant-steps.XXXXXX.json)
FIRSTHAND_STEPS=$(mktemp /tmp/satchel-firsthand-steps.XXXXXX.json)
PNPM_STORE=$(mktemp -d /tmp/satchel-firsthand-pnpm.XXXXXX)
redact_logs() { for f in "$LOG1" "$LOG2"; do [ ! -f "$f" ] || sed -E -i '' 's/(principal|deposit|k_ns\([^)]*\)|k_nonce\([^)]*\)|fingerprint\(firsthand\/ns\/0\))=[^ ;]+/\1=[redacted]/g' "$f"; done; }
cleanup() { redact_logs; kill ${SERVER:-} 2>/dev/null || true; rm -f "$MUT" tsconfig.build.json "$MUTANT_STEPS" "$FIRSTHAND_STEPS"; rm -rf "$PNPM_STORE"; }
trap cleanup EXIT
export CDP_PORT=${CDP_PORT:-9396} VAUTH=1 PIN_FILE="$HOME/.cache/qa-tab-satchel-firsthand"

REGISTRY_META=$(npm_config_registry=https://registry.npmjs.org npm view satchel-sdk@0.1.0 version dist.tarball dist.integrity --json)
REGISTRY_VERSION=$(node -e 'console.log(JSON.parse(process.argv[1]).version)' "$REGISTRY_META")
REGISTRY_URL=$(node -e 'console.log(JSON.parse(process.argv[1])["dist.tarball"])' "$REGISTRY_META")
REGISTRY_INTEGRITY=$(node -e 'console.log(JSON.parse(process.argv[1])["dist.integrity"])' "$REGISTRY_META")
node -e 'const p=JSON.parse(process.argv[1]); if(p.version!=="0.1.0"||p["dist.tarball"]!=="https://registry.npmjs.org/satchel-sdk/-/satchel-sdk-0.1.0.tgz"||!p["dist.integrity"]?.startsWith("sha512-")) process.exit(1)' "$REGISTRY_META"
rg -F "resolution: {integrity: $REGISTRY_INTEGRITY}" "$FH/pnpm-lock.yaml" >/dev/null || { echo "ERROR: Firsthand lock integrity does not match npm registry metadata" >&2; exit 1; }
echo "=== CLEAN REGISTRY INSTALL: satchel-sdk@0.1.0 ==="
cd "$FH"
npm_config_registry=https://registry.npmjs.org pnpm --registry=https://registry.npmjs.org --store-dir "$PNPM_STORE" --config.engine-strict=false install --force --filter @firsthand/sdk... --frozen-lockfile
node -e 'const m=JSON.parse(process.argv[1]),p=require("./packages/sdk/node_modules/satchel-sdk/package.json"); if(p.version!==m.version||m.version!=="0.1.0") process.exit(1); console.log(`PASS installed satchel-sdk@${p.version}; lock integrity matches npm registry`)' "$REGISTRY_META"
pnpm --config.engine-strict=false --filter @firsthand/sdk... build
pnpm --config.engine-strict=false --filter @firsthand/sdk typecheck
echo "PASS registry install, @firsthand/sdk build, and strict typecheck"
cd "$HARNESS_DIR"

sed 's/const keys = KeyTree.fromPrf(prf);/const keys = KeyTree.fromPrf(new Uint8Array(root));/' $SDK/src/webauthn/satchel.ts > $MUT
cmp -s $SDK/src/webauthn/satchel.ts $MUT && { echo "mutation did not apply" >&2; exit 1; }
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

node -e 'const fs=require("fs"), focus=s=>s.flatMap(x=>x.tclick?[{activate:true},x]:[x]); fs.writeFileSync(process.argv[3],JSON.stringify(focus(JSON.parse(fs.readFileSync(process.argv[1],"utf8"))),null,2)+"\n"); fs.writeFileSync(process.argv[4],JSON.stringify(focus(JSON.parse(fs.readFileSync(process.argv[2],"utf8"))),null,2)+"\n")' steps-run1.json steps-mutant.json "$FIRSTHAND_STEPS" "$MUTANT_STEPS"
node $CDP "http://localhost:$PORT/" "$FIRSTHAND_STEPS" /tmp 2>$LOG1 >/dev/null
node $CDP "http://localhost:$PORT/?b=mutant" "$MUTANT_STEPS" /tmp 2>$LOG2 >/dev/null
sed -E -i '' 's/(principal|deposit|k_ns\([^)]*\)|k_nonce\([^)]*\)|fingerprint\(firsthand\/ns\/0\))=[^ ;]+/\1=[redacted]/g' "$LOG1" "$LOG2"
rg -q 'EQUAL adapter tree vs Firsthand.*equal=true' "$LOG1"
rg -q 'EQUAL mera-ceremony tree vs Firsthand.*equal=true' "$LOG1"
rg -q 'REOPEN-B.*code=WRONG_PASSKEY' "$LOG1"
rg -q 'MUTANT adapter.*mutant tree vs Firsthand.*equal=false' "$LOG2"
echo "PASS browser assertions: adapter/Mera parity, wrong-passkey refusal, mutant mismatch"

{
  echo "firsthand satchel adapter harness, $(date -u +%FT%TZ), origin http://localhost:$PORT, virtual authenticator ctap2/internal, resident key, user verification, PRF, no chain"
  echo "adapter: $FH packages/sdk/src/webauthn/satchel.ts git blob $(git -C $FH hash-object packages/sdk/src/webauthn/satchel.ts), based on upstream main $(git -C $FH rev-parse --short main)"
  echo "unmodified: WebAuthnPrfSource.ts blob $(git -C $FH rev-parse HEAD:packages/sdk/src/webauthn/WebAuthnPrfSource.ts), KeyTree (packages/crypto/src/kdf/keytree.ts) blob $(git -C $FH rev-parse HEAD:packages/crypto/src/kdf/keytree.ts)"
  echo "npm_config_registry=https://registry.npmjs.org npm view satchel-sdk@0.1.0 version dist.tarball dist.integrity --json"
  echo "registry metadata: version=$REGISTRY_VERSION resolved=$REGISTRY_URL integrity=$REGISTRY_INTEGRITY"
  echo "satchel-sdk source: https://registry.npmjs.org/satchel-sdk/-/satchel-sdk-0.1.0.tgz (satchel-sdk@$(node -p "require('$SDK/node_modules/satchel-sdk/package.json').version"))"
  echo "PASS consumer build and typecheck: pnpm --store-dir fresh-temp-store --config.engine-strict=false --filter @firsthand/sdk... build; pnpm --store-dir fresh-temp-store --config.engine-strict=false --filter @firsthand/sdk typecheck"
  echo; echo "=== RUN 1: two passkeys, Firsthand's own unlock, satchel beside it, the adapter two ways, a control, a fresh load ==="
  node format-results.mjs "$LOG1" | sed -E 's/(principal|deposit|k_ns\([^)]*\)|k_nonce\([^)]*\)|fingerprint\(firsthand\/ns\/0\))=[^ ;]+/\1=[redacted]/g'
  echo; echo "=== RUN 2 (mutant): the adapter's key tree built from the satchel root instead of the PRF output ==="
  node format-results.mjs "$LOG2" | sed -E 's/(principal|deposit|k_ns\([^)]*\)|k_nonce\([^)]*\)|fingerprint\(firsthand\/ns\/0\))=[^ ;]+/\1=[redacted]/g'
} | tee $OUT
