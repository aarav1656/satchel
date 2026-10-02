# DESIGN.md · satchel

Binding for every UI change in `apps/web` and every file in `brand/`. System: `mintlify` (slug in `~/.config/design-md/designs/mintlify.md`), chosen 2026-10-02 in `gtm/satchel/DESIGN.md` section 5. The product is read by developers, so the chrome is docs chrome: a three column layout (sidebar, prose, table of contents), Inter for prose, Geist Mono for code, one green.

Source of the full token set: the frontmatter of the mintlify file. This file lists what satchel uses and what it changes.

## Tokens

All tokens live in `apps/web/app/theme.css` as CSS variables. Components read variables and never hold a literal colour, size or font.

| Role | Variable | Value |
|---|---|---|
| canvas | `--canvas` | `#ffffff` |
| surface | `--surface` | `#f7f7f7` |
| soft surface | `--surface-soft` | `#fafafa` |
| code surface | `--code` | `#1c1c1e` |
| hairline | `--hairline` | `#e5e5e5` |
| soft hairline | `--hairline-soft` | `#ededed` |
| dark hairline | `--hairline-dark` | `#1f1f1f` |
| ink | `--ink` | `#0a0a0a` |
| charcoal | `--charcoal` | `#1c1c1e` |
| steel | `--steel` | `#5a5a5c` |
| stone | `--stone` | `#888888` |
| on dark | `--on-dark` / `--on-dark-muted` | `#ffffff` / `#b3b3b3` |
| accent (only) | `--accent` | `#00d4a4`, fills and rules only. Text sitting on it is `#0a0a0a` |
| accent deep | `--accent-deep` | `#00b48a`, hover for fills |
| error | `--error` | `#d45656` |
| warn | `--warn` | `#c37d0d` |
| radius | `--r-xs` / `--r-sm` / `--r-md` / `--r-lg` / `--r-full` | 4 / 6 / 8 / 12 / 9999 px, buttons use full |
| spacing | `--s-1` to `--s-9` | 4, 8, 12, 16, 20, 24, 32, 40, 64 px |
| fonts | `--font-sans`, `--font-mono` | Inter (variable, weights 400 500 600), Geist Mono (400 500), loaded by the `@fontsource-variable` packages so the faces are served from the site itself; fallback `ui-sans-serif, system-ui` and `ui-monospace, Menlo` |

Type scale: body 16/1.5, small 14/1.5, caption 13/1.4, code 14/1.5, inline code 13/1.3 weight 500, h1 36/1.2 weight 600 letter-spacing -0.5px, h2 28/1.25, h3 22/1.3, h4 18/1.4.

Motion: 120 ms ease-out for state, 160 ms linear for the rail fill, 280 ms ease-in-out for the cut. Every motion has a `prefers-reduced-motion` branch that jumps to the end state. No ease-in, no transition on `all`, no `scale(0)`.

## Components bound from the system

- Primary button: ink fill, white text, full radius, `10px 20px`, 14px weight 500. Pressed: charcoal.
- Secondary button: transparent, 1px hairline border, full radius.
- Accent button (dark surfaces only): `--accent` fill, ink text.
- Card: canvas, 1px hairline, 12px radius, 24px padding. No shadow.
- Code block: `--code` fill, on-dark text, 8px radius, a header row with the file name and a copy button. No tabs, no framework switcher.
- Inline code: surface fill, 1px hairline, 4px radius, Geist Mono 13 weight 500.
- Property row (the API reference): 1px soft hairline under each row, name in mono, type in a surface badge, description in steel.
- Sidebar item: steel text, 6px radius; active item surface fill and ink text. Section header: 11px uppercase 0.5px tracking.
- Text input: 40px, 8px radius, 1px hairline; focus is a 2px accent border.

## What changes from the source system, and why

- No sky-gradient hero, no cloud art, no testimonial orange. The first screen of the site is the quickstart: a developer scores whether the interface is clean and the docs are clear, not the landing page.
- The green is never text. `#00d4a4` on white fails contrast, so links are ink with an underline, and green appears only as the key rail, the equal-fingerprint rule and the accent button on dark.
- Dark appears only in code blocks, the derivation view and the storage scan, where it reads as a terminal.
- Heading sizes drop from 72 and 56 px to 36 px. A docs page whose first line is a wrapping headline is not a quickstart.
- The sky and dark hero bands, pricing cards, logo wall and promo banner components are not used. There is no marketing page.
- Fonts ship as Inter and Geist Mono under their open licences. No other company's marks or binaries ship.

## The noun: the key rail

One passkey on the left, many namespaces to the right, the grants on them at the far end. One SVG per rail, every label real DOM text so a judge or a test can read each fingerprint.

- Left: one filled ink circle, 14 px, labelled `passkey` and the first 8 characters of the credential id. It is the only node that costs a prompt.
- From it, one hairline per namespace fans right to a chip in Geist Mono: `memory/assistant  e2  4f9a1c07`, namespace, epoch, fingerprint. A new namespace draws a new line out of the same circle in 160 ms linear; no node is added on the left.
- At the right end of a namespace line sit grantee nodes: an open circle labelled with the app name, joined by an accent line.
- Revoke is a motion with a result: the accent line to the app is cut with a 6 px gap in 280 ms ease-in-out, the chip epoch ticks from `e1` to `e2`, and every record sealed after the cut is drawn as a lock sitting in the gap. The picture says: this app's reads end here, earlier ones still open.
- On `/proof` the rail renders twice for the cross-device row, fingerprints set at 20 px mono, with a thin accent rule under them when equal and a thin error rule when different.
- A wrong-namespace attempt draws a short error-coloured stub leaving the chip toward the asked-for label and stopping before the node, with the error code beside it.

The rail carries the argument: one origin on the left, many outputs on the right, no second prompt anywhere on it.

## Routes

Docs (static pages): `/` quickstart, `/concepts/*`, `/guides/*`, `/reference/api`, `/reference/errors`. Demo: `/pip` (vault), `/pip/share` (grants), `/fern` (the reading app). Evidence: `/proof`.

## Anti-slop list for this product

- No multi-colour or any gradient text, no gradients anywhere.
- No floating tag pills above cards. Epoch and namespace sit inside chips on the rail, in the line they describe.
- No ghost corner numbers. Counted steps are a table with real step labels.
- No placeholder icons as avatars. Apps are named text and an open circle on the rail.
- No giant wrapping hero. The docs landing is the quickstart at a 36 px heading; the demo has no hero.
- No "No data" or "No items" empty states. Every empty state says what to do next and shows a real example.
- No unreadable green text: the accent is never a text colour.
- No `transition: all`, no `ease-in`, no `scale(0)`, no `h-screen`.
- No em or en dashes in any source or copy.
- No mock data: every number on a page is read from the SDK, the chain or the browser.
- A check that can fail: the storage scan flags a value that is not ciphertext or a public id, and `NAMESPACE_MISMATCH` comes from a real wrong-namespace call.

## Gate

`uicraft read` is recorded in `apps/web/.uicraft-read.json`; `uicraft gate --cwd apps/web` exits 0 on this tree and exits 1 when one banned pattern is added (results in `apps/web/results/`).
