#!/usr/bin/env bash
# Developer flow from the packed tarball: npm pack, install into an empty project, typecheck a consumer file, then run the
# whole derive, seal, grant, revoke, regrant flow against the Monad testnet registry.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/.." && pwd)
WORK=${WORK:-/tmp/satchel-devflow}; DAY=$(date +%F); OUT=${OUT:-$HERE/results/devflow-$DAY.txt}
mkdir -p "$HERE/results" "$HERE/.state"; rm -rf "$WORK"; mkdir -p "$WORK"
(cd "$ROOT/packages/sdk" && npm run build >/dev/null && npm pack --pack-destination "$WORK" 2>&1 | tail -16) > "$WORK/pack.txt"
TGZ=$(ls "$WORK"/satchel-sdk-*.tgz)
{
  echo "satchel developer flow, $(date -u +%FT%TZ), node $(node -v), tarball $(basename "$TGZ") sha256 $(shasum -a 256 "$TGZ" | cut -c1-16)"
  echo "--- npm pack"; cat "$WORK/pack.txt"
  cd "$WORK"
  cat > package.json <<'J'
{ "name": "devflow-consumer", "private": true, "type": "module" }
J
  echo "--- npm install (tarball, mera 0.2.0, typescript)"
  npm install --no-audit --no-fund "$TGZ" @category-labs/mera@0.2.0 typescript@5 2>&1 | tail -3
  ls node_modules/satchel-sdk/dist/index.js node_modules/satchel-sdk/LICENSE
  echo "--- typecheck consumer file against the shipped .d.ts"
  cp "$HERE/types.ts" .
  npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck types.ts && echo "tsc exit 0"
  cp "$HERE/flow.mjs" .
  export DEPLOYMENT="$ROOT/deployments/testnet.json" PRF_DIR="$HERE/.state"
  OWNER=$(node flow.mjs owner)
  BAL=$(cast balance "$OWNER" --rpc-url "$(jq -r .rpc "$DEPLOYMENT")" --ether)
  echo "--- owner $OWNER balance $BAL MON"
  if [ "$(echo "$BAL < 0.05" | bc)" = 1 ]; then
    (cd "$ROOT/apps/web" && bun scripts/fund-owner.ts "$OWNER" devflow "key kept in devflow/.state/.prf, recoverable")
  fi
  echo "--- flow"
  node flow.mjs run
} 2>&1 | tee "$OUT"
grep -q "^DEVFLOW PASS" "$OUT"
