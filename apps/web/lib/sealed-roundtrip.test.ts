import { test, expect } from "bun:test";
import { fromPrfOutput, ns, parseSealed } from "satchel-sdk";

test("SAT1 header and plaintext survive base64 re-encoding", async () => {
  const prf = crypto.getRandomValues(new Uint8Array(32));
  const s = await fromPrfOutput(prf, { rpId: "localhost" });
  const memory = ns("memory/assistant");
  const sealed = await s.seal(memory, { note: "exit 93800" });
  const b64 = btoa(String.fromCharCode(...sealed.toBytes()));
  const back = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const head = parseSealed(back);
  expect(head.epoch).toBe(1);
  const out = await s.unsealJson<{ note: string }>(memory, back);
  expect(out.note).toBe("exit 93800");
});
