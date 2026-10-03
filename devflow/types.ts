import { createGrantee, fromPrfOutput, ns, type Grant, type Satchel, SatchelError } from "satchel-sdk";
const s: Satchel = await fromPrfOutput(new Uint8Array(32), { rpId: "example.com" });
const g: Grant = await s.grant(ns("memory/assistant"), (await createGrantee()).publicKey, { label: "x" });
const e: SatchelError | undefined = undefined;
// @ts-expect-error a plain string is not a Namespace
s.seal("memory/assistant", "x");
export { g, e };
