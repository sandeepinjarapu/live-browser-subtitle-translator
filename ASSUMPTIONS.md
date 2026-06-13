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

## Security posture (interim assessment 2026-06-13)

The repo crossed from "local script" into "security-sensitive local agent." The one durable rule, true regardless of distribution: **the local model is a privileged resource, and any web page that can shape its prompts or call its endpoints is part of the threat model.** Findings below are accurate (each verified against the cited line); the *severity* depends on the distribution stage. "Personal" = single-user, load-unpacked, localhost-only (today). "Release" = anyone installs it (Web Store, gated on ToS review).

| # | Finding | Evidence | Personal severity | Release severity |
|---|---|---|---|---|
| S1 | `OLLAMA_ORIGINS` includes `chrome-extension://*` → any installed extension can drive local Ollama | [plist:11](launchd/com.subtitle-translator.ollama-env.plist:11) | **FIXED 2026-06-13** — pinned to the extension ID *only* (the OTT web origins were vestigial: all backend traffic is proxied through the SW, which sends the extension origin, [background.js:1-3](background.js:1)). Verified: extension allowed, web + foreign-extension origins rejected | Done |
| S2 | Libre server: wildcard CORS + unauthenticated `/translate` → any visited site can use the local translator as an inference endpoint | [local_translate_server.py](local_translate_server.py) | **FIXED 2026-06-13** — server blocks any request whose `Origin` is *present and ≠* the extension origin (403 + denied preflight), and reflects only that origin in CORS, never `*`. `Origin`-less requests are allowed because Chrome sends the extension SW's `GET /health` without an `Origin` (its `POST /translate` does carry it); browsers always attach `Origin` on cross-origin *page* requests (even no-cors), so a malicious site is still rejected. Closes the stated "any visited site" threat. (Local non-browser tools can omit `Origin` → still the deferred token's job.) A pre-shared token (defense vs *local non-browser* processes, which can forge `Origin`) is **deferred to onboarding** — a static load-unpacked extension has no out-of-band channel to receive a per-install secret, so a token now would be redundant or forgeable | Done (token → onboarding) |
| S3 | Forged `lst-track` via `postMessage("*")` → page can poison parser/cache/prefetch | [pagehook.js:43](pagehook.js:43),[content.js:489](content.js:489) | Low (hostile page already controls the DOM; nonce is hygiene) | High — nonce/MessageChannel before release |
| S4 | Page `localStorage` drives backend/model/settings | [content.js:30-42](content.js:30) | Low (blast radius = which local model runs) | Medium — fold into `chrome.storage` migration |
| S5 | Server resource exposure: unbounded cache, trusts Content-Length, body cap after materialization | [local_translate_server.py:18](local_translate_server.py:18),[pagehook.js:81](pagehook.js:81) | Low (own machine) | Medium |
| S6 | `http://*/*` optional permission; broad Amazon/OTT static matches | [manifest.json:7](manifest.json:7),[:29](manifest.json:29) | Low | Medium — shrinks the Web Store review surface |

**Prompt injection — contained by design, do NOT build a detector.** Model output ([content.js:1274](content.js:1274)) is rendered as overlay text only — never executed, no shell/file/tool/agent access. A malicious subtitle produces *text*, not actions. Detection is brittle and real subtitles legitimately contain commands/URLs → false positives without security. Correct posture: treat subtitles as hostile *data*, keep the model *capability-free*, cap resources (length/cue/context), don't filter content.

**Tripwire (re-evaluate everything above if this trips):** the prompt-injection calculus *inverts* the moment the model gains any capability — file access, tools, shell, clipboard, "summarize my files," API keys, output used as config/code. None on the roadmap today. If one appears, prompt injection escalates from "borrows compute" to "real," and a tool-permission layer (allowlist + user confirmation + sandboxing) becomes mandatory.

**Sequencing:** S1 + S2 **done 2026-06-13** (origin-pinned on both backends; verified). S3/S4/S5/S6 are a pre-release checklist that naturally rides along with the v1 settings work and Web Store packaging (already ToS-gated) — they are not present-tense fires for personal use. The S2 pre-shared **token is an onboarding deliverable** (needs a paste UX to reach a load-unpacked extension); when built, surface it in the same flow.

**Token defers to onboarding (why):** origin enforcement closes the browser threat completely because pages can't forge `Origin`. A token only adds defense against a local *non-browser* process — but that attacker can forge `Origin` too, so the token must be a real pre-shared secret delivered out-of-band (user paste). No secure channel exists until onboarding, so the token lands there, not now.

## Process

- Every "Try on this site" field test: read the probe line, update this ledger if it confirms or violates an entry.
- Before building the onboarding flow: walk every **untested** row and decide test-or-accept.
- When adding a feature, ask per pipeline stage (detect → capture → parse → time-align → translate → render → persist): *what does this stage assume about its input, and which row covers it?* If none does, add a row.
