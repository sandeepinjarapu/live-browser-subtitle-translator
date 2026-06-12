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
| Translation quality pass — **SHIPPED (0.4.0–0.4.4)** | Two-line previous context (context-aware caching; A/B-verified it resolves verb ellipsis across speaker turns), recurring-name glossary, auto-caption filler/tag stripping, pause-cut prefix merging, and style profiles (Auto from YT category / Formal / Casual; music mode shows original lyrics untranslated). **Deferred:** surface what Auto detected (badge/panel showing "Auto → formal (Education)") so mis-detection is distinguishable from model limits; add content-type profiles (explainer = casual register + English tech terms; documentary auto-mapping) only when a watched genre demonstrably fails both existing profiles. | Done |
| Package for Chrome Web Store | Versioned releases instead of load-unpacked; required before anyone else can use it | Easy, plus review process |

## v2 — Subtitle prefetch — **SHIPPED (0.5.0–0.5.26, prefetch branch, merged 2026-06)**

**Idea:** streaming players download the full subtitle track (TTML/WebVTT) before playback. Intercept that file, translate the whole episode in the background, then display each translated line at the exact moment the original appears. Zero perceived latency.

**What got built (field-tested on Prime, Netflix, YouTube, JioHotstar):**

- *Interception:* MAIN-world `pagehook.js` (document_start) wraps fetch/XHR and sniffs response **bodies by format, not URLs/sites** — five kinds: vtt, ttml-text, ttml-mp4 (TTML inside stpp fMP4), yt-json (timedtext json3), timedtext-xml. Prime's Range-windowed track URL re-fetched with a plain GET returns the full episode (the "signed but re-fetchable" bet held). Netflix/Hotstar/YouTube deliver complete files unprompted — zero special-casing for Netflix and Hotstar.
- *Timing:* cue clock (200 ms scheduler vs `video.currentTime`) **self-calibrates** against the player's own DOM captions (median-of-5 offsets, ≥12-char anchors, one sample per caption at first sighting, full re-lock on timeline jumps from ads/source swaps). YouTube trusts the cue clock natively (`trustCueClock`) and gates around ads (`adActive`).
- *Throughput:* translate-ahead pump in playback order with wrap-around (whole episode always finishes, ~4 min wall for a 45-min episode at concurrency 2), focused-window-only to protect the single local GPU, per-cue retry caps, English-original stopgap until each translation lands.
- *Quality (prefetch-only unlocks):* **episode lexicon pre-pass** — one Gemma call over a script sample commits keep-English terms and name spellings for every prompt (A/B-verified register improvement); speaker-turn line breaks preserved end-to-end; per-speaker-line translation.
- *Persistence:* translations + lexicon cached to `chrome.storage.local` for 24h, keyed by track/language/model; settings changes flush and re-key; SPA navigation tears down all prefetch state.
- *Hint regimes:* the "captions off?" badge consults the cue schedule (silence per the track is not suspicious), suppresses during re-lock and ads.

**Lesson of the branch:** nearly every field bug was a *state-lifetime* bug — prefetch introduced long-lived state (two clocks, two episodes, disk caches, multi-window contention) the live path never had.

**Economics confirmed:** sequential local pump is optimal for one GPU; a server flips to parallel/batch + shared cache — this is the architecture for the TV-product path. ToS review of track interception still required before any distribution.

**Deferred:** segmented-HLS sites (cues trail playhead → "prefetch-lite"; upgrade is fetching the subtitle playlist ourselves, per-site); "gentle mode" concurrency-1 thermal option; detached-DevTools focus pauses the pump (known quirk).

## v3 — Multi-OTT support

Each service needs three things audited: (a) can we *find* the subtitle text (DOM selector or track file), (b) can we *hide* the original cleanly, (c) does playback happen in a normal `<video>` we can sync against.

| OTT | Expected difficulty | Notes |
|---|---|---|
| Prime Video | **Prefetch** (verified 2026-06) | ttml-mp4 (stpp fMP4) over Range windows; full-track plain-GET re-fetch; DOM-calibrated cue clock. Live path remains the fallback tier |
| Netflix | **Prefetch** (verified 2026-06) | Single ttml-text file covering the whole title; zero site-specific code — the generic pipeline classified and handled it. Live `.player-timedtext` adapter remains the fallback |
| JioHotstar | **Prefetch** (verified 2026-06) | Single full WebVTT; entity decoding; calibration locked at −0.40 s. Shaka `.shaka-text-container` live path remains the fallback |
| YouTube | **Prefetch** (verified 2026-06) | timedtext json3/XML; trusted cue clock (offset 0), ad gating, ASR cleanup. Rolling live path (yt-exploration) remains the fallback for CC-never-enabled videos |
| MX Player | **Live path** (verified 2026-06) | video.js (`.vjs-text-track-display` — recognized 0.5.28; covers the whole video.js family). Segmented HLS VTT delivery → full prefetch stays off by design; first candidate for prefetch-lite. Track-selection toasts filtered (0.5.27); behavioral cue-text root discovery added as the generic fallback (0.5.29) |
| Zee5, SonyLIV | Unknown, likely medium | Indian OTTs vary; several use standard HLS/DASH with WebVTT; Shaka and video.js players are now covered; JW Player (`.jw-captions`) is the next likely family |
| Apple TV+ (web) | Hard | Heavy canvas/custom rendering in places; Safari-first audience |
| aha, SUNNXT, Eros Now, Lionsgate Play | Unknown | Audit pass needed |

**Entry point: "Try on this site" probe trial — SHIPPED (v0.3.0).** Toolbar button requests per-origin permission, injects the pipeline immediately and on future visits (dynamic content-script registration); noise filters split into generic + per-adapter. Doubles as the final step of the v1 onboarding flow. Click the extension on any OTT → it requests optional host permission for that site, injects, runs the v1 probe, and if subtitle-like text is found, attempts the full live pipeline (detect → translate → hide → overlay), reporting what worked. Probe (v1 diagnostic) and trial (v3 runtime) in one flow. Requires: optional host permissions in the manifest, and de-Prime-ing the noise filters (`isNoise`/`narrowText` contain Prime-specific strings).

Each successful trial graduates into a supported site in the matrix below; publish the matrix in the README.

## v4 — Browser coverage

- **Chrome/Edge/Brave:** already work (Chromium MV3).
- **Firefox:** WebExtensions API is near-identical; main work is manifest tweaks and testing. Medium-easy.
- **Safari:** requires packaging as a Safari Web Extension via an Xcode wrapper app, plus Apple developer account. Doable but a separate distribution channel; decide only if Apple TV+/Mac users matter.

## Explicit decisions to make (not features yet)

**Extension vs native app.** Recommendation: stay an extension. The product's whole trick is sitting inside the page where the subtitles are; a native app would have to capture the screen or audio instead, losing the ground-truth text that makes quality high and latency low. The Ollama/Libre servers already live outside the browser, so heavy compute isn't constrained by the extension form. Revisit only if OTTs systematically block extensions.

**Live audio translation (Google Live Translate or local Whisper).** Recommendation: park it. Speech-to-text stacks a second error-prone, latency-adding model in front of translation, and we already have perfect source text for any content *with* subtitles. Its real use case is content with **no subtitle track at all** — that's a different product (and Google's cloud route also gives up the privacy/offline story). Keep on the long-term list; don't let it compete with v2 for attention.

## Parking lot (unreviewed ideas)

- ~~Dual-subtitle mode (original + translation simultaneously)~~ — SHIPPED as the "Original: shown" setting (0.3.22), alongside a translator on/off toggle; both sync across tabs. A "subtitles are off" badge hint also shipped (0.3.23–0.3.25): exact per-adapter signal where available (YouTube CC button), 20s playing-time heuristic elsewhere.
- Export translated subtitles as an `.srt` file
- Shared community cache of translated tracks (privacy questions)
- Auto language detection of source subtitles (non-English originals)
- Latency/quality telemetry overlay for tuning sessions

---

*Process: review items here → promote to a version section with feasibility noted → build → mark done in "Where we are today".*
