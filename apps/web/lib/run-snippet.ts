import * as sdk from "satchel-sdk";

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<Record<string, unknown>>;
const IMPORT = /^import \{([^}]*)\} from "satchel-sdk";\n/;

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Runs a snippet exactly as written. Its one `import { ... } from "satchel-sdk"` line is bound to the real SDK, and the
 * snippet's own top-level consts are returned after it finishes. `scope` binds names the snippet reads but does not define
 * (the button the person pressed). Nothing is rewritten, so what runs is what is shown.
 */
export async function runSnippet(
  source: string,
  returns: string[],
  scope: Record<string, unknown> = {},
): Promise<{ values: Record<string, unknown>; sha256: string }> {
  const m = IMPORT.exec(source);
  if (!m) throw new Error('snippet must start with import { ... } from "satchel-sdk";');
  const names = m[1]!.split(",").map((n) => n.trim()).filter(Boolean);
  for (const n of names) if (!(n in sdk)) throw new Error(`the snippet imports ${n}, which satchel-sdk does not export`);
  const body = `const { ${names.join(", ")} } = sdk;\n${source.slice(m[0].length)}\nreturn { ${returns.join(", ")} };`;
  const values = await new AsyncFunction("sdk", "location", ...Object.keys(scope), body)(sdk, location, ...Object.values(scope));
  return { values, sha256: await sha256Hex(source) };
}
