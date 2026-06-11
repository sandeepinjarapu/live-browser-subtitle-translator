# Prime Video Subtitle Probe

Minimal Chrome extension to verify that Prime Video subtitles are readable from the DOM.

## Load it in Chrome

1. Open `chrome://extensions/`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this folder

## What it does

- Watches Prime Video pages for subtitle-like text near the bottom of the player
- Logs the detected line to DevTools
- Shows a small debug box in the lower-left corner of the page

## Local Telugu translation

This project now uses a local translator on `http://127.0.0.1:5000` based on `Helsinki-NLP/opus-mt-en-dra`.

### Run the local services

Both backends run as login services (LaunchAgents) — nothing to start manually, and they survive reboots. One-time install (re-run after editing `local_translate_server.py` or the plists):

```bash
./start_local_server.command
```

Runtime lives in `~/.subtitle-translator/` (venv, HF cache, Ollama models) — outside Documents because macOS blocks launchd agents from reading Documents, and outside iCloud sync. The [`launchd/`](launchd) folder holds the two agent definitions: the Libre server (kept alive), and an agent that sets `OLLAMA_ORIGINS`/`OLLAMA_MODELS` at login and restarts Ollama if its CORS config is stale. Logs land in `/tmp/subtitle-translator-*.log`.

## Gemma backend (Ollama)

The settings panel (click the status badge) can switch translation to a local Gemma model served by Ollama on `http://127.0.0.1:11434`, or to a hybrid mode that shows the LibreTranslate result instantly and swaps in Gemma's when ready.

Requirements:

1. Install the [Ollama](https://ollama.com) app and pull a model: `ollama pull gemma4:e2b-it-qat` (4.3 GB, fast) and/or `ollama pull gemma4:e4b` (9.6 GB, bigger).
2. Ollama must allow requests from the extension and the streaming sites, or it answers 403 and the badge shows "Gemma offline". The `ollama-env` LaunchAgent handles this at every login (`chrome-extension://*` plus the supported OTT origins); no manual steps.

### Current disk usage (in `~/.subtitle-translator/`)

- `venv`: about `498 MB`
- `hf-cache`: about `592 MB`
- `ollama-models`: about `13 GB` (both Gemma models)

## Compatibility probe

To check whether another streaming site could be supported, play a video there **with subtitles on**, open DevTools → Console, paste the whole of [`probe.js`](probe.js), and keep watching for ~15 seconds. It prints a `PROBE VERDICT` saying whether subtitle text is readable (DOM or native text tracks), whether the original could be hidden, and whether the player is syncable. Share that block to decide support.

## Notes

- Keep Prime Video subtitles enabled while testing.
- The extension reads the original subtitle line locally, hides the source line, and shows the translated overlay.
- If the server is not running, the overlay will fall back to the original text.
- A small status badge in the top-right corner shows whether the local translator is connected.
- The Telugu subtitle overlay is larger now for TV viewing distance.

## What success looks like

- The DevTools console prints the actual subtitle line
- The on-page debug box updates when the subtitle changes
