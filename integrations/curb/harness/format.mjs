// node format.mjs <cdp-stderr-log>: prints each page's DOM lines once, in order, with navigation and click markers.
import fs from "node:fs";
const seen = new Set();
for (const raw of fs.readFileSync(process.argv[2], "utf8").split("\n")) {
  if (!raw.startsWith("STEP ")) continue;
  const step = JSON.parse(raw.slice(5));
  if (step?.goto) { seen.clear(); console.log(`--- fresh page load: ${step.goto}`); continue; }
  if (step?.tclick) { console.log(`> click "${step.tclick}" ok=${step.ok}`); continue; }
  if (typeof step?.value !== "string") continue;
  for (const l of step.value.replace(/^LOAD2 \S+ \| /, "").split("\n")) if (l && !seen.has(l)) { seen.add(l); console.log(l); }
}
