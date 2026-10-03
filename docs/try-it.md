# Try satchel in three steps

You need a browser with a passkey that supports PRF (iCloud Keychain, Google Password Manager, Windows Hello, 1Password, Proton Pass, YubiKey 5) and Node 20 or newer for step 2.

## 1. Seal a record with your own passkey (1 minute)

Open https://satchel-keys.vercel.app and press **Create a passkey**, then accept the prompt.

You get a console block under the code:

```
sealed  ns=memory/assistant  epoch=1  97 B  fp=...  (1 prompt)
unsealed  {"likes":"metric units"}
ran the code above verbatim, sha256 ...
```

Reload the page and press **Run the code above**: same `fp`, one prompt. The fingerprint is the same on every device that holds this passkey.

## 2. Install it and run the same thing in Node (1 minute)

In an empty directory:

```sh
npm i https://satchel-keys.vercel.app/satchel-sdk-0.1.0.tgz @category-labs/mera@0.2.0
```

Save the Node quickstart from the home page (section "The same in Node") as `quickstart.mjs` and run `node quickstart.mjs`. You get:

```
{"likes":"metric units"}
```

## 3. Hand a second app a read grant and take it back (3 minutes, needs testnet MON)

1. Open https://satchel-keys.vercel.app/pip, press **Create my vault**, save two memories.
2. Open https://satchel-keys.vercel.app/fern. It cannot see anything yet. Press **Connect to your memory**, then **Allow** in Pip. If the owner has no MON, Pip shows its address and the exact shortfall: send about 0.05 MON from https://faucet.monad.xyz, press **Check balance**, then **Allow** again. The grant is a Monad testnet transaction. Fern rebuilds it from the transaction hash alone and reads both memories.
3. In Pip's sharing page (`/pip/share`) press **Revoke Fern**. Back in Pip save one more memory: Fern shows the first two open and the new one locked with `GRANT_REVOKED`. In Fern press **Ask Pip for a new grant**, press **Allow** in Pip, then **Return to Fern**: Fern opens all three.

What you have after step 3: a grant and a revoke you can read on the Monad testnet explorer, registry `0xd6c895f5c9254dc6eaafc335fff0930fd7012e6d`.

## Using it in your own app

`import { openOrEnrol, ns } from "satchel-sdk"` and the quickstart is the whole integration: one file, one passkey prompt per visit, any number of namespaces. The API reference is at https://satchel-keys.vercel.app/reference/api/ and the two-app guide at https://satchel-keys.vercel.app/guides/two-apps/.
