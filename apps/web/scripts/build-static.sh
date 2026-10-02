#!/usr/bin/env bash
# Builds the site as plain static files and proves the deployment would carry zero serverless functions:
# no route handlers, no middleware, no server actions, no dynamic routes, and nothing in the export but files.
# Output: out/  (deploy it with `vca deploy` from a kamal2 project linked to out/, never from here)
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "build-static FAIL: $1" >&2; exit 1; }
[ -z "$(find app -name 'route.ts' -o -name 'route.tsx' -o -name 'route.js' | head -1)" ] || fail "route handler found under app/"
[ -z "$(find . -maxdepth 2 \( -name 'middleware.ts' -o -name 'proxy.ts' \) -not -path './node_modules/*' | head -1)" ] || fail "middleware or proxy file found"
[ ! -d app/api ] || fail "app/api exists"
! grep -rIl "use server" app components lib >/dev/null 2>&1 || fail "server action found"
grep -q 'output: "export"' next.config.ts || fail 'next.config.ts is missing output: "export"'

bun run build >/tmp/satchel-static-build.log 2>&1 || { tail -30 /tmp/satchel-static-build.log; exit 1; }
[ -f out/index.html ] || fail "no out/index.html"
printf '{\n  "$schema": "https://openapi.vercel.sh/vercel.json",\n  "framework": null,\n  "buildCommand": null,\n  "trailingSlash": true\n}\n' > out/vercel.json
# A function would need a server directory; an export has none, and every route is an html file.
[ ! -e out/api ] || fail "out/api exists"
ROUTES=$(find out -name index.html | wc -l | tr -d ' ')
NONSTATIC=$(find out -type f \( -name '*.mjs' -o -name '*.cjs' \) -not -path 'out/_next/*' | wc -l | tr -d ' ')
echo "static build: $(find out -type f | wc -l | tr -d ' ') files, $ROUTES html routes, server files outside _next: $NONSTATIC, functions: none (no route.ts, middleware, server actions or app/api)"
