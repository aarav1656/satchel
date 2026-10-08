#!/usr/bin/env bash
# What a first developer does: copy the registry install line and the Node quickstart off the docs page into an empty directory and run them.
# ORIGIN defaults to the live site. The text is cut out of the served HTML, not read from the source tree. The site-hosted
# compatibility tarball is checked separately and must answer 200, but it is not the copied install command.
set -euo pipefail
ORIGIN=${ORIGIN:-https://satchel-keys.vercel.app}
HERE=$(cd "$(dirname "$0")" && pwd); OUT=${OUT:-$HERE/results/quickstart-$(date +%F).txt}
D=$(mktemp -d /tmp/satchel-quickstart.XXXXXX); cd "$D"
curl -s "$ORIGIN/" -o home.html
node - <<'JS' > copied.txt
const fs = require("fs");
const html = fs.readFileSync("home.html", "utf8");
const dec = (s) => s.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const grab = (id) => { const m = html.match(new RegExp(`data-snippet="${id}">[\\s\\S]*?<pre><code>([\\s\\S]*?)</code></pre>`)); if (!m) { console.error(`no ${id} block on the page`); process.exit(1); } return dec(m[1]); };
fs.writeFileSync("install.sh", grab("install") + "\n");
fs.writeFileSync("quickstart.mjs", grab("node-quickstart") + "\n");
console.log("copied install line and quickstart from the page");
JS
{
  echo "satchel Node quickstart, $(date -u +%FT%TZ), origin $ORIGIN, node $(node -v), empty dir $D"
  cat copied.txt; echo "--- install line as copied"; cat install.sh
  if grep -q '\.tgz' install.sh; then
    TGZ=$(grep -o 'https://[^ ]*\.tgz' install.sh); echo "--- curl -I $TGZ"; curl -sI "$TGZ" | sed -n '1p;/[Cc]ontent-type/p;/[Cc]ontent-length/p'
    test "$(curl -s -o /dev/null -w '%{http_code}' "$TGZ")" = 200
  else
    echo "--- install line is the registry line, no tarball URL required"
    grep -q 'satchel-sdk@' install.sh
    grep -q '@category-labs/mera@0.2.0' install.sh
  fi
  TARBALL_PATH=$(grep -o '/satchel-sdk-[^"]*\.tgz' home.html | head -1 || true)
  if [ -n "${TARBALL_PATH:-}" ]; then
    TARBALL_URL="${ORIGIN%/}${TARBALL_PATH}"; echo "--- curl -I $TARBALL_URL (compatibility tarball)"; curl -sI "$TARBALL_URL" | sed -n '1p;/[Cc]ontent-type/p;/[Cc]ontent-length/p'
    test "$(curl -s -o /dev/null -w '%{http_code}' "$TARBALL_URL")" = 200
  else
    echo "--- no fallback tarball link on the page"
  fi
  echo '{"name":"qs","private":true,"type":"module"}' > package.json
  bash install.sh 2>&1 | grep -v "npm warn" | tail -3
  echo "--- node quickstart.mjs"; node quickstart.mjs | tee run.out
  test "$(cat run.out)" = '{"likes":"metric units"}'; echo "QUICKSTART PASS"
} 2>&1 | tee "$OUT"
grep -q "^QUICKSTART PASS" "$OUT"
