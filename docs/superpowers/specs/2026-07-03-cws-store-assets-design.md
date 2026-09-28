# Chrome Web Store Assets — Design

**Date:** 2026-07-03
**Goal:** Make the Chrome Web Store listing for Chess.com Analyzer more attractive with a complete, professional set of store images.

## Scope

Produce 7 PNG assets, English copy, ready to upload to the CWS Developer Dashboard:

| ID | Size (exact) | CWS slot |
|----|-------------|----------|
| S1–S5 | 1280×800 | Screenshots (max 5) |
| T1 | 440×280 | Small promo tile |
| T2 | 1400×560 | Marquee promo tile |

Out of scope: store description text, localized (FR) asset set, icon redesign.

## Visual system

One shared look across all 7 assets so the listing reads as a coherent brand:

- **Background:** dark gradient, anthracite → deep chess green (harmonizes with chess.com's dark UI and the extension's green arrows `#32CD32`).
- **Typography:** bold sans-serif headline (benefit-oriented), small muted subline when needed.
- **Screenshot treatment:** real captures inset with rounded corners (~12px), soft drop shadow, slight scale so the frame background is visible around them.
- **No fake UI:** every screenshot region shown is a genuine capture of the extension running on chess.com.

## Asset contents

- **S1 (hero):** board with the 3 arrows + eval labels on a clean opening position. Headline: *"See the top 3 moves — live on your board"*.
- **S2:** extension popup (eval bars + move list) composed next to a board capture. Headline: *"Instant Stockfish evaluation at a glance"*.
- **S3:** popup settings side (Depth & Lines sliders). Headline: *"Tune engine depth and number of lines"*.
- **S4:** mid-game position (Ruy Lopez) with arrows. Headline: *"Works on live games and analysis"*.
- **S5:** privacy/local card: extension icon + 3 bullet points. Headline: *"Runs 100% locally — no account, no data leaves your browser"*.
- **T1 (440×280):** icon128 + extension name + mini board visual with one green arrow.
- **T2 (1400×560):** name + tagline *"Stockfish analysis, right on Chess.com"* on the left, large board capture bleeding off the right edge.

## Production pipeline

1. **Raw captures** — agent-browser driving Chrome for Testing (`C:/Users/Zero/cft/chrome-win64/chrome.exe`) with the extension loaded from `dist/`, isolated profile:
   - open `chess.com/analysis`, dismiss the cookie-consent banner first (it polluted earlier captures),
   - set positions via the board's `game.move()` API, wait for arrows, screenshot;
   - popup captured by opening `chrome-extension://<id>/popup.html` in a tab with a popup-sized viewport (~360×600). The extension ID is read at runtime (unpacked IDs are machine-specific).
2. **Framing** — one local HTML file per asset from a shared template (inline CSS, captures embedded as data URIs so the pages are self-contained). agent-browser sets the viewport to the exact target size and screenshots → pixel-exact PNGs.
3. **Delivery** — final PNGs in `store-assets/`, HTML sources in `store-assets/src/`, both committed to git.

## Verification

- Each output PNG is dimension-checked programmatically (must equal 1280×800 / 440×280 / 1400×560 exactly — the dashboard rejects other sizes).
- Visual review of each PNG (Read tool) before delivery: no cookie banner, no dev artifacts, arrows visible, text legible.

## Risks / notes

- Assets show chess.com's board UI. Standard practice for site-specific extensions; flagged to the owner and accepted.
- chess.com DOM/theme may change; the HTML sources in `store-assets/src/` let us re-frame future captures cheaply.
