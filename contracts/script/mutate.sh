#!/usr/bin/env bash
# Mutation run: copies the project to a temp dir outside the repo, applies one mutant at a time, expects red.
set -u
SRC="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d /tmp/satchel-mut.XXXXXX)"
cp -R "$SRC/src" "$SRC/test" "$SRC/foundry.toml" "$TMP/"
ln -s "$SRC/lib" "$TMP/lib"
F="$TMP/src/SatchelRegistry.sol"
cp "$F" "$TMP/orig.sol"
declare -a NAMES=(
  "M1 delete owner check in revoke"
  "M2 delete active check in revoke"
  "M3 revoke does not bump epoch"
  "M4 rotate does not bump epoch"
  "M5 delete namespace check in revoke"
  "M6 rotate resets epoch to 2 once it passes 3"
)
declare -a PATTERNS=(
  '/if (g.owner != msg.sender) revert NotGrantOwner();/d'
  '/if (!g.active) revert GrantInactive();/d'
  '/newEpoch = epochOf(msg.sender, nsHash) + 1;/{x;s/^/x/;/^x$/{x;s/+ 1/+ 0/;b};x;}'
  ''
  '/if (g.nsHash != nsHash) revert NamespaceMismatch();/d'
  ''
)
red=0; total=0
for i in 0 1 2 3 4 5; do
  cp "$TMP/orig.sol" "$F"
  case $i in
    2) python3 - "$F" <<'PY'
import sys,re
p=sys.argv[1];s=open(p).read()
a="g.active = false;\n        newEpoch = epochOf(msg.sender, nsHash) + 1;\n        _epoch[msg.sender][nsHash] = newEpoch;"
b="g.active = false;\n        newEpoch = epochOf(msg.sender, nsHash);\n        _epoch[msg.sender][nsHash] = newEpoch;"
assert a in s; open(p,'w').write(s.replace(a,b))
PY
    ;;
    3) python3 - "$F" <<'PY'
import sys
p=sys.argv[1];s=open(p).read()
a="function rotate(bytes32 nsHash) external returns (uint64 newEpoch) {\n        newEpoch = epochOf(msg.sender, nsHash) + 1;"
b="function rotate(bytes32 nsHash) external returns (uint64 newEpoch) {\n        newEpoch = epochOf(msg.sender, nsHash);"
assert a in s; open(p,'w').write(s.replace(a,b))
PY
    ;;
    5) python3 - "$F" <<'PY'
import sys
p=sys.argv[1];s=open(p).read()
a="function rotate(bytes32 nsHash) external returns (uint64 newEpoch) {\n        newEpoch = epochOf(msg.sender, nsHash) + 1;"
b="function rotate(bytes32 nsHash) external returns (uint64 newEpoch) {\n        newEpoch = epochOf(msg.sender, nsHash) + 1;\n        if (newEpoch > 3) newEpoch = 2;"
assert a in s; open(p,'w').write(s.replace(a,b))
PY
    ;;
    *) sed -i '' "${PATTERNS[$i]}" "$F" ;;
  esac
  if cmp -s "$F" "$TMP/orig.sol"; then echo "MUTANT ${NAMES[$i]}: NOT APPLIED"; continue; fi
  total=$((total+1))
  echo "=== ${NAMES[$i]} ==="
  diff "$TMP/orig.sol" "$F" | grep '^[<>]'
  out="$(cd "$TMP" && forge test --root "$TMP" 2>&1)"
  echo "$out" | grep -E '^\[FAIL|invariant_.*FAIL|FAIL:|Suite result|tests passed' | sort -u
  if echo "$out" | grep -q 'FAIL'; then echo "RESULT: red (killed)"; red=$((red+1)); else echo "RESULT: green (SURVIVED)"; fi
done
echo "killed $red of $total"
rm -rf "$TMP"
[ "$red" -eq "$total" ]
