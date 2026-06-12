# Assumptions ledger

Silent assumptions the pipeline makes, with their evidence base. Review before designing anything user-facing (probe, onboarding, support matrix). Update when a field test confirms or violates one.

Statuses: **verified** (held across sites, with the list), **violated** (date, site, fix), **untested** (no evidence either way — a latent risk).

## The channel taxonomy (the frame everything below lives in)

A browser page can carry subtitle text through exactly four channels:

1. **Native TextTracks** (`video.textTracks`) — the W3C-standard path
2. **Rendered DOM** — player paints captions as styled elements
3. **Network** — track files observable in fetch/XHR responses
4. **Pixels** — burned into the video or drawn to canvas (we cannot read this)

The probe (content.js `probeChannels`, 0.5.32) reports the first three on every site; "none found" implies CC off or channel 4.

## Ledger

| # | Assumption | Status | Evidence / notes |
|---|---|---|---|
| 1 | Subtitle text is only reachable via DOM scraping or network interception | **Violated** 2026-06-12, SonyLIV: full episode sat in a hidden native TextTrack (364 cues). Fixed 0.5.31 (native harvest). Root cause: generalized from 4 launch OTTs, all of which bypass the standard channel |
| 2 | Caption containers carry recognizable class names | **Violated twice**: MX Player 2026-06 (video.js `.vjs-text-track-display` not in vocabulary; fixed 0.5.28), SonyLIV 2026-06 (de-prefixed `.text-track-wrapper`; fixed 0.5.30). Mitigated structurally by behavioral cue-text discovery (0.5.29) — but that needs a captured track (see #3) |
| 3 | (Gap, not assumption) Unknown player + no capturable track = blind | **Known gap**. Behavioral root discovery requires cues; a site with neither recognized classes nor a sniffable/native track has no tier 3. Probe now at least reports this state |
| 4 | Source subtitles are English | **Untested / latent**. `isTranslatableEnglish` is a Latin-ratio heuristic; the lexicon prompt assumes an English script; calibration matches English text. A Hindi/Tamil-subtitled title silently translates nothing. Probe logs a warning when root text is non-Latin |
| 5 | Episode identity == URL | **Untested at the edge**. `resetPrefetch` fires on href change only; a same-URL source swap (quality change, audio-language switch that swaps the manifest) could leak cue state. Timeline-jump recalibration partially covers it |
| 6 | The one relevant `<video>` is the show | **Partially verified**. Prime's dummy `<video>` elements are filtered (rect heuristic). PiP, hover-previews, and inline trailers untested |
| 7 | Range-windowed track URLs are re-fetchable in full with a plain GET | **Verified on Prime only**. Other Range-windowed sites may sign requests differently |
| 8 | ≥100 cues == full track (prefetch gate) | **Verified** across 6 sites as a *conservative* gate. Known tradeoff: short films with <100 cues but a complete track stay on the live path. yt-json/timedtext use a ≥10 gate because those responses are complete by construction; native tracks rely on the 100 gate |
| 9 | Player DOM caption text exactly equals track cue text (calibration anchors) | **Verified** on Prime/Netflix/Hotstar (YouTube bypasses via trustCueClock). Breaks if a player uppercases/restyles text — calibration would never lock, live path keeps driving (graceful, but loses zero-lag) |
| 10 | Translations cacheable 24h keyed by URL path + language + model | **Verified**. Assumes the track URL path is stable per episode within a day; native tracks use a synthetic per-page-path key (0.5.31) |
| 11 | UI noise is enumerable by regex | **Repeatedly violated**, by design ongoing: each player family contributes toasts/menus (track-selection toasts 0.5.27). Filters are generic + per-adapter; expect additions per new family |
| 12 | "Captions off" is detectable | **Partial**. Exact signal on YouTube (CC button); elsewhere a 20s heuristic + cue-schedule consultation (0.5.13). Cannot distinguish CC-off from burned-in (#13) |
| 14 | A caption-classed element with text is the caption container | **Violated** 2026-06-12, SUNNXT (Shaka): the player's CC toggle button (`shaka-caption-button`, text "closed_caption") outscored the real container — control bars are full of caption-classed *controls*. Fixed 0.5.34: interactive elements (`button`, `[role=button]`) excluded from root candidacy; CC-status labels added to generic noise. *Process note:* first diagnosed remotely as browser-rendered native cues (0.5.33) — wrong; the user's probe line (`native[none] dom[shaka-caption-button] net[none]`) corrected it. The probe paid for itself on day one. The 0.5.33 `video::cue` hiding and ≥10-cue native gate stay as channel-1 defenses, currently unexercised in the field. Fix field-verified on SUNNXT 2026-06-12 |
| 13 | Burned-in subtitles are out of scope | **Accepted limitation** (channel 4). OCR-or-nothing; affects Apple TV+ in places. Probe reports "no channel found" — onboarding must set this expectation honestly |

## Process

- Every "Try on this site" field test: read the probe line, update this ledger if it confirms or violates an entry.
- Before building the onboarding flow: walk every **untested** row and decide test-or-accept.
- When adding a feature, ask per pipeline stage (detect → capture → parse → time-align → translate → render → persist): *what does this stage assume about its input, and which row covers it?* If none does, add a row.
