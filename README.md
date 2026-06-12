# Live Subtitle Translator

Chrome extension that translates streaming subtitles in real time using **local, private AI** (Ollama/Gemma or a LibreTranslate-style server). No cloud, no accounts, no subtitle data leaving your machine.

It reads the original subtitle through whichever channel the site offers — intercepted track files, native `video.textTracks`, or the rendered caption DOM — hides the original, and overlays the translation. On sites where the full track is capturable, the whole episode is translated ahead of playback (**prefetch**: zero perceived lag); elsewhere a live DOM path follows the captions with ~0.5–1 s lag.

## Supported sites (field-tested)

| Site | Tier |
|---|---|
| Prime Video | Prefetch |
| Netflix | Prefetch |
| JioHotstar | Prefetch |
| YouTube | Prefetch |
| MX Player | Live path |
| Zee5 | Live path |
| SonyLIV | Live path / prefetch (native track) |
| SUNNXT | Live path |

Any other site: click the toolbar button (**Try on this site**) — it requests permission for that origin, injects the pipeline, and the built-in channel probe logs what the site offers (`channel probe: native[…] dom[…] net[…] → verdict` in DevTools). See [ROADMAP.md](ROADMAP.md) for the full matrix and [ASSUMPTIONS.md](ASSUMPTIONS.md) for the assumptions ledger behind it.

## Install (unpacked)

1. Open `chrome://extensions/`, enable Developer mode
2. Load unpacked → select this folder
3. Set up a local translation backend (below)
4. Open a supported site, play something with subtitles on — the badge in the top-right shows connection status; click it for settings (backend, model, language, style, size, show-original, on/off)

## Local translation backends

Both run as login services (LaunchAgents) — nothing to start manually. One-time install:

```bash
./start_local_server.command
```

- **LibreTranslate-style server** on `127.0.0.1:5000` (`Helsinki-NLP/opus-mt-en-dra`, Telugu, fast)
- **Ollama/Gemma** on `127.0.0.1:11434` — `ollama pull gemma4:e2b-it-qat` (4.3 GB, fast) and/or `gemma4:e4b` (9.6 GB, better). The `ollama-env` LaunchAgent sets `OLLAMA_ORIGINS` so the extension and OTT origins are allowed; without it Ollama answers 403 ("Gemma offline")
- **Hybrid** shows the Libre result instantly and swaps in Gemma's when ready

Runtime lives in `~/.subtitle-translator/` (venv ~0.5 GB, HF cache ~0.6 GB, Ollama models ~13 GB) — outside Documents/iCloud because launchd agents can't read Documents. Agent definitions in [`launchd/`](launchd); logs in `/tmp/subtitle-translator-*.log`.

## How it works (short version)

- A MAIN-world hook sniffs fetch/XHR **bodies by format** (VTT, TTML, TTML-in-fMP4, YouTube timedtext) — no per-site URLs
- Native `video.textTracks` cues are harvested directly when a site populates them
- A cue clock schedules translated lines against `video.currentTime`, self-calibrating against the player's own captions where needed
- A translate-ahead pump works through the episode in playback order; translations cache to disk for 24 h
- The live DOM path (generic root scoring over player caption containers, with behavioral cue-text discovery as fallback) drives sites where no track is capturable, and is the fallback everywhere else

Status: personal project, not on the Web Store. Telugu-first (Gemma backend supports other languages).
