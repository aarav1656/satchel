// node scripts/check-links.mjs [origin]: crawls every route of the served static export, checks each internal link answers 200
// and each #anchor exists in the target page. External links are listed, not fetched.
const origin = process.argv[2] ?? "http://localhost:5190";
const routes = ["/", "/concepts/passkey-and-prf/", "/concepts/namespaces/", "/concepts/envelopes/", "/concepts/grants-and-epochs/", "/guides/two-apps/", "/guides/migrate-from-per-note-vaults/", "/reference/api/", "/reference/errors/", "/pip/", "/pip/share/", "/fern/", "/proof/"];
const html = new Map();
const get = async (p) => {
  if (!html.has(p)) {
    const r = await fetch(origin + p);
    html.set(p, { status: r.status, body: r.status === 200 && (r.headers.get("content-type") ?? "").includes("html") ? await r.text() : "" });
  }
  return html.get(p);
};
let bad = 0, checked = 0;
const external = new Set();
for (const route of routes) {
  const page = await get(route);
  if (page.status !== 200) { console.log(`FAIL route ${route} ${page.status}`); bad++; continue; }
  for (const m of page.body.matchAll(/<a [^>]*href="([^"]+)"/g)) {
    const href = m[1].replace(/&amp;/g, "&");
    if (/^https?:\/\//.test(href)) { external.add(href); continue; }
    const [path, hash] = href.split("#");
    const target = path === "" ? route : path.split("?")[0];
    const t = await get(target);
    checked++;
    if (t.status !== 200) { console.log(`FAIL ${route} -> ${href} (${t.status})`); bad++; continue; }
    if (hash && t.body && !t.body.includes(`id="${hash}"`)) { console.log(`FAIL ${route} -> ${href} (no id="${hash}")`); bad++; }
  }
}
console.log(`${routes.length} routes, ${checked} internal links checked, ${bad} broken, ${external.size} external links not fetched`);
process.exit(bad ? 1 : 0);
