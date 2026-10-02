// node format-results.mjs <cdp-stderr-log>  prints each page's DOM lines once, in order, with navigation markers.
import fs from "node:fs";
const seen = new Set();
for (const raw of fs.readFileSync(process.argv[2], "utf8").split("\n")) {
  if (!raw.startsWith("STEP ")) continue;
  const step = JSON.parse(raw.slice(5));
  if (step?.goto) { seen.clear(); console.log(`--- fresh page load: ${step.goto}`); continue; }
  if (step?.click) { console.log(`> click "${step.click}" ok=${step.ok}`); continue; }
  if (typeof step?.value !== "string") continue;
  for (const line of step.value.replace(/^LOAD2 \S+ \| /, "").split("\n")) if (line && !seen.has(line)) { seen.add(line); console.log(line); }
}
