import { createHmac, randomBytes } from "node:crypto";
import type { WebAuthnClient } from "@category-labs/mera";
import { SatchelError } from "../src/index.ts";
import type { Store } from "../src/index.ts";

/** A software authenticator behind Mera's WebAuthnClient seam: per-credential secret, PRF = HMAC(secret, salt). */
export function fakeAuthenticator(opts: { noPrf?: boolean; failWith?: string } = {}) {
  const creds = new Map<string, { rpId: string; secret: Buffer }>();
  const calls = { create: 0, get: 0 };
  const fail = () => {
    if (opts.failWith) throw Object.assign(new Error(opts.failWith), { name: opts.failWith });
  };
  const client: WebAuthnClient = {
    async createCredential(req) {
      calls.create++;
      fail();
      const id = randomBytes(16);
      const secret = randomBytes(32);
      creds.set(id.toString("base64url"), { rpId: req.rp.id ?? "", secret });
      return {
        credentialId: new Uint8Array(id),
        prfEnabled: !opts.noPrf,
        ...(opts.noPrf ? {} : { prfOutput: new Uint8Array(createHmac("sha256", secret).update(req.prfSalt).digest()) }),
      };
    },
    async getCredential(req) {
      calls.get++;
      fail();
      const want = req.allowCredential ? Buffer.from(req.allowCredential.credentialId).toString("base64url") : undefined;
      const hit = [...creds].find(([id, c]) => c.rpId === req.rpId && (want === undefined || id === want));
      if (!hit) throw Object.assign(new Error("no credential"), { name: "NotAllowedError" });
      return {
        credentialId: new Uint8Array(Buffer.from(hit[0], "base64url")),
        ...(opts.noPrf ? {} : { prfOutput: new Uint8Array(createHmac("sha256", hit[1].secret).update(req.prfSalt).digest()) }),
      };
    },
  };
  return { client, calls, creds };
}

export const memoryStore = (): Store & { map: Map<string, Uint8Array> } => {
  const map = new Map<string, Uint8Array>();
  return { map, get: async (k) => map.get(k), put: async (k, v) => void map.set(k, v) };
};

export async function codeOf(fn: () => unknown): Promise<string> {
  try {
    await fn();
    return "NO_THROW";
  } catch (e) {
    return e instanceof SatchelError ? e.code : `NOT_SATCHEL:${(e as Error).name}:${(e as Error).message}`;
  }
}

export const prfOf = (seed: string) => new Uint8Array(createHmac("sha256", "test-prf").update(seed).digest());
