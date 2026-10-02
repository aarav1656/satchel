import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..", "..", "integrations");

/** Links to an integration page only when its files exist at build time, so the guide never points at nothing. */
export function integration(name: string): { href: string; files: string[] } | undefined {
  const dir = path.join(ROOT, name);
  if (!fs.existsSync(dir)) return undefined;
  const files = fs.readdirSync(dir).filter((f) => /\.(md|diff|patch)$/i.test(f));
  if (files.length === 0) return undefined;
  const readme = files.find((f) => /^readme\.md$/i.test(f)) ?? files[0]!;
  return { href: `/evidence/integrations/${name}/${readme}`, files };
}
