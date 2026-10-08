#!/usr/bin/env bash
# Developer flow from the published npm package: a clean `npm install satchel-sdk@0.1.0` from registry.npmjs.org into
# an empty consumer, prove the lock entry came from the registry tarball, typecheck a consumer file against the
# shipped .d.ts, then run the whole derive, seal, grant, revoke, regrant flow against the Monad testnet registry.
# This proves what a developer gets from npm, not what a local pack produces.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/.." && pwd)
DAY=$(date +%F); OUT=${OUT:-$HERE/results/devflow-$DAY.txt}

# The consumer dir. Default is a fresh mktemp; a supplied WORK must not already exist and must not be a broad path,
# so this script can never delete a user directory. It is kept after the run for evidence and reuse.
die() { echo "devflow: $*" >&2; exit 2; }
if [ -z "${WORK:-}" ]; then
  WORK=$(mktemp -d "${TMPDIR:-/tmp}/satchel-devflow.XXXXXXXX")
else
  case "$WORK" in
    /|/tmp|/usr|/etc|/var|/opt|~|"$HOME"|.) die "WORK must not be a broad path: $WORK" ;;
  esac
  [ -e "$WORK" ] && die "WORK already exists; refusing to reuse or delete it: $WORK"
  mkdir -p "$WORK"
fi

mkdir -p "$HERE/results" "$HERE/.state"
{
  echo "satchel developer flow (published package), $(date -u +%FT%TZ), node $(node -v), consumer $WORK"
  cd "$WORK"
  echo '{"name":"devflow-consumer","private":true,"type":"module"}' > package.json

  echo "--- npm install satchel-sdk@0.1.0 @category-labs/mera@0.2.0 typescript@5 from https://registry.npmjs.org"
  npm install --registry=https://registry.npmjs.org --no-audit --no-fund --save-exact \
    satchel-sdk@0.1.0 @category-labs/mera@0.2.0 typescript@5 2>&1 | tail -3
  ls node_modules/satchel-sdk/dist/index.js node_modules/satchel-sdk/LICENSE

  echo "--- prove the lock entry came from the registry tarball (not a local pack)"
  cp "$HERE/registry-source.mjs" .
  node registry-source.mjs "$WORK"

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