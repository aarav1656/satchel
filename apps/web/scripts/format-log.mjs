// node scripts/format-log.mjs <driver stderr log>: one readable line per step, in order.
import fs from "node:fs";
for (const raw of fs.readFileSync(process.argv[2], "utf8").split("\n")) {
  if (!raw.startsWith("STEP ")) continue;
  const s = JSON.parse(raw.slice(5));
  const tag = s.FAIL ? "FAIL " : "";
  if (s.navigate) console.log(`--- navigate ${s.navigate}`);
  else if (s.click) console.log(`${tag}> click "${s.click}" ok=${s.ok}`);
  else if (s.click_sel) console.log(`${tag}> click ${s.click_sel} ok=${s.ok}`);
  else if (s.set_text) console.log(`> type "${s.set_text}"`);
  else if (s.wait_file) console.log(`(outside the page) waited for ${s.wait_file}`);
  else if (s.assert) console.log(`${tag}ASSERT ${s.assert} ${s.FAIL ? "failed" : "ok"}`);
  else if (s.poll) console.log(`${tag}wait ok: ${s.poll}${typeof s.value === "string" && s.value.length > 1 && s.value !== "true" ? ` => ${s.value.replace(/\n/g, " | ")}` : ""}`);
  else if (typeof s.value === "string") console.log(s.value.replace(/\n/g, " | "));
}
