# DESIGN.md · satchel

Binding for every UI change in `apps/web` and every file in `brand/`. System: **Hallmark catalog theme Midnight** (atmospheric genre, dark paper band, cool hue 258, one seal-green accent), macrostructure **Map / Diagram**: the home page is one spatial diagram of Pip, the grant and Fern, and the docs share its tokens. Tokens live in `apps/web/app/theme.css`; components read variables and hold no colour, size or font literal.

## The argument the design carries

Sealed against open, the grant as a visible line between two apps, and the revoke as a moment you can see.

- **Sealed** is a shut envelope, full width of its card, with a round seal on the flap that carries the epoch (`e1`) and the first and last bytes of the ciphertext printed on its front in Geist Mono (`0x53415431…14e125`, `SAT1` is the header every sealed record starts with).
- **Open** is the same envelope with the flap folded back and a paper letter standing out of it, the plaintext on the letter in the display face, the envelope washed in the seal green. Pip's envelopes are always open, because Pip holds the key. Fern's are shut until its grant reads them.
- **The grant** is a line from Pip's passkey port to Fern's port. Dashed grey while there is no grant, solid green once Pip allows it, with small pulses running toward Fern while it reads.
- **The revoke** is three things at once: the line is cut at both ends and capped in red, the folder epoch on Pip rolls from 1 to 2 and every envelope carries new ciphertext bytes, and Fern's envelopes shut with a red seal and read `GRANT_REVOKED`, its own grant epoch struck through.
- The home stage is a four step explainer: the steps on the left drive the stage on the right, and a device with no grant plays the loop on its own. A device that holds a real grant rests on the step that matches it. The memories in the stage are labelled as samples. A strip under the stage, `read from this browser`, carries the real status of Pip and Fern from this browser's own storage, and the `data-state` of the line comes from the same storage.
- Below it, the registry's recorded grant, revoke and regrant for the same two apps, as a vertical ledger: a green dot per grant, a red one for the revoke, block and transaction link on every row.

## Tokens

| Role | Variable | Value |
|---|---|---|
| canvas | `--canvas` | `oklch(15.5% 0.022 258)` |
| soft surface | `--surface-soft` | `oklch(17.8% 0.023 258)` |
| surface | `--surface` | `oklch(20% 0.025 258)` |
| raised surface | `--surface-raised` | `oklch(24.5% 0.028 258)` |
| code surface | `--code` | `oklch(12.5% 0.02 258)` |
| hairlines | `--hairline` / `--hairline-soft` / `--hairline-dark` | `oklch(31%)` / `oklch(25.5%)` / `oklch(27.5%)` at chroma 0.03, hue 258 |
| top edge | `--edge` | white at 7%, an inset 1px highlight on every raised surface |
| ink (headings) | `--ink` | `oklch(96% 0.006 250)` |
| text (body) | `--text` | `oklch(86% 0.012 255)` |
| muted | `--steel` / `--stone` | `oklch(73% 0.02 256)` / `oklch(62% 0.022 256)` |
| accent (the seal) | `--accent` | `oklch(85% 0.16 165)`, fills, rules and small marks. Text sitting on it is `--accent-ink`. Accent text appears only in small mono marks: the cable chip, the log lead and the active step number |
| accent states | `--accent-deep`, `--accent-soft`, `--accent-wash`, `--accent-line` | hover fill, code strings, 11% wash, 45% rule |
| error | `--error`, `--error-soft`, `--error-wash`, `--error-line` | `oklch(71% 0.19 22)` and its washes. Red means revoked or failed and nothing else |
| warn | `--warn` | `oklch(81% 0.14 82)` |
| envelope | `--env-back`, `--env-front`, `--env-flap`, `--env-paper`, `--env-ink` | the five parts of the drawn envelope |
| radius | `--r-xs` to `--r-xl`, `--r-full` | 4 / 6 / 8 / 12 / 18 / 9999 px. Buttons and nav pills are full, cards 12, the stage 18 |
| spacing | `--s-1` to `--s-10` | 4, 8, 12, 16, 20, 24, 32, 40, 64, 96 px |
| fonts | `--font-display`, `--font-sans`, `--font-mono` | Bricolage Grotesque Variable, Instrument Sans Variable, Geist Mono Variable. The first two are shipped from `apps/web/app/fonts/` (latin subset, SIL OFL), Geist Mono from the `@fontsource-variable` package. No Inter anywhere |

Type scale: home h1 `clamp(40px, 5.4vw, 72px)` at 0.98 line height and -0.04em tracking, weight 600, balanced to two lines. Docs h1 40, h2 28, h3 22, h4 18, all Bricolage 600 at -0.02em. Body 16/1.55 Instrument Sans in `--text`. Small 14, mono 13, mono micro 11 to 12. Numbers are tabular everywhere.

Motion: 120 ms ease-out for state, 160 ms linear for the rail fill, 280 ms ease-in-out for the cut, 360 ms for the flap and the epoch roll, 520 ms for the cable draw, `--t-dwell` 4200 ms per step of the loop. Only transform and opacity move. Every motion has a `prefers-reduced-motion` branch that jumps to the end state and stops the loop. No transition on `all`, no `scale(0)`.

## Components bound from the system

- **Primary button**: `--ink` fill, `--canvas` text, full radius, `10px 20px`, 14px weight 600. Hover fills with the accent. Pressed `scale(0.97)`. Secondary: transparent with a hairline. Danger: red outline that fills on hover. Accent button for the one place a green action is wanted.
- **Card**: `--surface`, 1px hairline, 12px radius, 24px padding, the top edge highlight. No drop shadow. The home stage alone carries a deep soft shadow.
- **Envelope**: CSS-built, 80px tall and the full width of its card, five parts (back, letter, front with a V cut, flap, seal). The ciphertext sits bottom left and a state slot bottom right (`e1`, `no key`, `not read yet`, `GRANT_REVOKED`). States: open (green wash, flap folded back, letter risen 34px), shut (flap closed, seal showing), revoked (red wash, red seal). Only transform and opacity move.
- **Code block**: `--code` fill, hairline border, a header row with the file name and a copy button, strings in `--accent-soft`, keywords weight 600 in `--ink`.
- **Inline code**: raised fill, 1px hairline, 4px radius, Geist Mono 13 weight 500.
- **Property row, table**: soft hairlines, header row on `--surface`, row hover on `--surface`, code cells never wrap.
- **Sidebar item**: steel text, a 2px accent rule and a `--surface` fill on the current page. Section headers are 11px mono caps at 0.08em.
- **Top nav**: pill links, the current one on `--surface-raised`.
- **Input**: 44px, `--code` fill, 8px radius, 1px hairline; focus is a 1px accent border and ring.
- **Key rail** (Pip, Fern and Proof): unchanged geometry, recoloured. The passkey node is the seal green, chips sit on `--surface-raised`.

## Routes

`/` the product (hero, the stage with its four steps, the registry ledger). `/pip`, `/pip/share`, `/fern` the two apps. `/docs`, `/concepts/*`, `/guides/*`, `/reference/*` the docs in the same dark theme. `/proof` the evidence.

## Anti-slop list for this product

- No colour gradients and no gradient text. The only texture is a 3.5% blueprint grid inside the stage.
- No floating tag pills above cards. Epoch and namespace sit in the line they describe.
- No ghost corner numbers. The step numbers are mono labels in the row they number.
- No icon avatars, and no small envelope icons: the envelope is the object, drawn at card width. Apps are a name in the display face and a dot: filled for the app that holds the key, ringed for the one that reads through a grant.
- No stat grid. The only numbers on the home page are the block, grant id and epoch of a recorded transaction.
- No three equal feature cards. The home page is a headline, a four step list beside one diagram, and a ledger.
- No `transition: all`, no `ease-in` on UI, no `scale(0)`, no `h-screen`.
- No em or en dashes in any source or copy.
- Every number on a page is read from the SDK, the chain or the browser.

## Gate

`uicraft read` is recorded in `apps/web/.uicraft-read.json`; `uicraft gate --cwd apps/web` exits 0 on this tree. `bun run build` in `apps/web` runs `check-built.mjs` after the export.
