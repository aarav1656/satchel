# Try satchel in three steps

Start at https://satchel-keys.vercel.app: Pip and Fern are the product, and step 3 is the whole loop. Steps 1 and 2 are the developer path from the quickstart at https://satchel-keys.vercel.app/docs/.

You need a browser with a passkey that supports PRF (iCloud Keychain, Google Password Manager, Windows Hello, 1Password, Proton Pass, YubiKey 5) and Node 20 or newer for step 2.

## 1. Seal a record with your own passkey (1 minute)

Open https://satchel-keys.vercel.app/docs/ and press **Create a passkey**, then accept the prompt.

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
npm i satchel-sdk@0.1.0 @category-labs/mera@0.2.0
```

A compatibility tarball stays at https://satchel-keys.vercel.app/satchel-sdk-0.1.0.tgz for projects using the existing download URL.

Save the Node quickstart from the docs page (section "The same in Node") as `quickstart.mjs` and run `node quickstart.mjs`. You get:

```
{"likes":"metric units"}
```

## 3. Give a second AI app your memory, then watch it forget (3 minutes, needs testnet MON)

1. Open https://satchel-keys.vercel.app/pip/ and press **Create my vault**. Tell Pip two things that last: "I'm vegetarian." and "I fly out of BLR." The model picks out each fact with a tool call, Pip seals it with your passkey under `memory/trading-desk`, and **What Pip remembers** lists each memory with its epoch, size, fingerprint and ciphertext. Ask Pip "what should I eat on a flight?" and it answers from the sealed facts.
2. Open https://satchel-keys.vercel.app/fern/. It cannot see anything yet. Press **Connect to your memory**, then **Allow** in Pip. If the owner has no MON, Pip shows its address and the exact shortfall: send about 0.05 MON from https://faucet.monad.xyz, press **Check balance**, then **Allow** again. The grant is a Monad testnet transaction. Fern rebuilds it from the transaction hash alone, opens both memories with its own key, and "Plan my weekend." comes back built from them: vegetarian, out of BLR.
3. In Pip's sharing page (`/pip/share/`) press **Revoke Fern**. That is a second transaction: the folder moves to epoch 2 and Pip seals every memory again there. Back in Fern, ask again: its read comes back `GRANT_REVOKED` for every memory, and Fern answers without them. Press **Ask Pip for a new grant**, **Allow** in Pip, then **Return to Fern**: Fern opens both again at epoch 2.

What you have after step 3: a grant, a revoke and a regrant you can read on the Monad testnet explorer, registry `0xd6c895f5c9254dc6eaafc335fff0930fd7012e6d`, and a plaintext trail that never reached storage: the browser stores ciphertext only, and the page sends the model only the memories your own passkey just opened.

## Using it in your own app

`import { openOrEnrol, ns } from "satchel-sdk"` and the quickstart is the whole integration: one file, one passkey prompt per visit, any number of namespaces. The API reference is at https://satchel-keys.vercel.app/reference/api/ and the two-app guide at https://satchel-keys.vercel.app/guides/two-apps/.
