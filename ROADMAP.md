# Product Roadmap

A live subtitle translator for streaming sites: reads the original subtitle from the page, translates it locally (private, free, offline-capable), and overlays the translation in real time.

This document is the single place where features are proposed, evaluated, and sequenced. Nothing gets built without landing here first.

## Where we are today (v0)

- Chrome extension (unpacked), Prime Video only, English → Telugu only.
- Three backends: LibreTranslate-style local server (fast), Ollama/Gemma (accurate, e2b/e4b selectable), and Hybrid (Libre instantly, Gemma swaps in).
- Streamed Gemma output, adaptive linger (90 ms/char, 2–5 s), per-model caching, settings panel (backend, model, size).
- Known limits: ~0.5 s translation lag on every line, DOM-scraping is fragile to player updates, manual setup (Ollama CORS, local server, model pulls), settings stored in page localStorage.

---

## v1 — Make what exists solid

| Feature | Why | Feasibility |
|---|---|---|
| Target-language setting (not hardcoded Telugu) | Cheapest unlock of a much larger audience; Gemma is already multilingual, the prompt just needs a variable. Libre backend needs a model per language pair. | Easy for Gemma; per-pair effort for Libre |
| Settings in `chrome.storage.sync` instead of localStorage | Survives site data clearing, syncs across devices, works across OTT domains | Easy |
| Onboarding flow (supersedes "setup doctor") | Install opens an options page, not the overlay: pick language → pick path ("just works" via hosted endpoint vs "private & free" local) → local path is a guided checklist with live ✅/❌ (extension polls localhost for Ollama/model/CORS/Libre) → live test translation → final step hands off to **"Try on this site"** (see v3): user opens their streaming site and runs the probe trial on real content. Setup isn't "done" until they've seen their own show translated. Overlay stays dormant until setup completes. Hosted endpoint decision: costs money + privacy questions, but gives a zero-setup path; recommend hosted Libre as default, local Gemma as the quality upgrade. | Medium; final step depends on the probe trial |
| Compatibility probe (diagnostic) | On any video page, report three findings: (a) readable subtitle text in the DOM? (b) original hideable cleanly? (c) normal `<video>` to sync against? Generalizes existing root-picking logic into a logger. Turns "does OTT X work?" into a 5-minute test; findings feed the v3 support matrix and decide which sites need the v2 prefetch route. | Easy |
| Scene-cut overlay clearing | Linger currently overstays on hard cuts; detect playback jumps via the `<video>` element and clear immediately | Medium |
| Translation quality pass | Glossary for recurring names/terms, strip stray quotes/preamble from model output, possibly send previous line as context for pronoun consistency | Easy–medium |
| Package for Chrome Web Store | Versioned releases instead of load-unpacked; required before anyone else can use it | Easy, plus review process |

## v2 — Subtitle prefetch (the big one)

**Idea:** streaming players download the full subtitle track (TTML/WebVTT) before playback. Intercept that file, translate the whole episode in the background, then display each translated line at the exact moment the original appears. Zero perceived latency; streaming/linger tricks become unnecessary.

**Feasibility — promising but the hard parts are real:**

- *Interception:* content scripts can't read other requests' bodies. Needs either a page-injected fetch/XHR hook or re-requesting the subtitle URL ourselves once spotted. Prime's TTML URLs are signed but re-fetchable from the same session. Per-OTT work.
- *Timing:* TTML carries begin/end timestamps; sync against `video.currentTime`. Solid.
- *Throughput:* a 40-min episode is ~500–800 lines; e2b at ~0.7 s/line ≈ 7–9 min for the full track. Translate in playback order so the overlay stays ahead of the viewer within the first minutes; cache to disk so rewatches are instant.
- *Risk:* DRM does not block this (subtitles aren't encrypted), but each OTT formats and delivers tracks differently, and ToS for intercepting traffic should be reviewed before publishing.

**Verdict: feasible, highest-value item on the list. Prototype on Prime first; keep DOM-scraping as the fallback path.**

## v3 — Multi-OTT support

Each service needs three things audited: (a) can we *find* the subtitle text (DOM selector or track file), (b) can we *hide* the original cleanly, (c) does playback happen in a normal `<video>` we can sync against.

| OTT | Expected difficulty | Notes |
|---|---|---|
| Prime Video | Partial (DOM) | Works for MX-Player-sourced shows; other titles render subtitles without readable DOM text (image/canvas suspected) — prefetch prototype target |
| Netflix | Medium | Subtitles render to a known DOM container; track files (TTML) fetched per language — good prefetch candidate |
| JioHotstar | **Supported** (probe-verified 2026-06) | Shaka Player; subtitles in `.shaka-text-container` — selector added to the extension |
| Zee5, SonyLIV, MX Player | Unknown, likely medium | Indian OTTs vary; several use standard HLS/DASH with WebVTT; any Shaka-based player is now covered |
| Apple TV+ (web) | Hard | Heavy canvas/custom rendering in places; Safari-first audience |
| aha, SUNNXT, Eros Now, Lionsgate Play | Unknown | Audit pass needed |

**Entry point: "Try on this site" probe trial.** Doubles as the final step of the v1 onboarding flow — build order is therefore: probe (v1) → probe trial → onboarding's last step wires to it. Click the extension on any OTT → it requests optional host permission for that site, injects, runs the v1 probe, and if subtitle-like text is found, attempts the full live pipeline (detect → translate → hide → overlay), reporting what worked. Probe (v1 diagnostic) and trial (v3 runtime) in one flow. Requires: optional host permissions in the manifest, and de-Prime-ing the noise filters (`isNoise`/`narrowText` contain Prime-specific strings).

Each successful trial graduates into a supported site in the matrix below; publish the matrix in the README.

## v4 — Browser coverage

- **Chrome/Edge/Brave:** already work (Chromium MV3).
- **Firefox:** WebExtensions API is near-identical; main work is manifest tweaks and testing. Medium-easy.
- **Safari:** requires packaging as a Safari Web Extension via an Xcode wrapper app, plus Apple developer account. Doable but a separate distribution channel; decide only if Apple TV+/Mac users matter.

## Explicit decisions to make (not features yet)

**Extension vs native app.** Recommendation: stay an extension. The product's whole trick is sitting inside the page where the subtitles are; a native app would have to capture the screen or audio instead, losing the ground-truth text that makes quality high and latency low. The Ollama/Libre servers already live outside the browser, so heavy compute isn't constrained by the extension form. Revisit only if OTTs systematically block extensions.

**Live audio translation (Google Live Translate or local Whisper).** Recommendation: park it. Speech-to-text stacks a second error-prone, latency-adding model in front of translation, and we already have perfect source text for any content *with* subtitles. Its real use case is content with **no subtitle track at all** — that's a different product (and Google's cloud route also gives up the privacy/offline story). Keep on the long-term list; don't let it compete with v2 for attention.

## Parking lot (unreviewed ideas)

- Dual-subtitle mode (original + translation simultaneously) for language learners
- Export translated subtitles as an `.srt` file
- Shared community cache of translated tracks (privacy questions)
- Auto language detection of source subtitles (non-English originals)
- Latency/quality telemetry overlay for tuning sessions

---

*Process: review items here → promote to a version section with feasibility noted → build → mark done in "Where we are today".*
