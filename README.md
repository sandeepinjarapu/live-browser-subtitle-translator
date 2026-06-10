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

### Run the local server

Two options:

1. Double-click [`start_local_server.command`](start_local_server.command)
2. Or run this in Terminal:

```bash
source .venv.nosync/bin/activate
export HF_HOME="$PWD/.hf-cache.nosync"
export HF_HUB_DISABLE_XET=1
export HF_HUB_ENABLE_HF_TRANSFER=0
python local_translate_server.py
```

## Gemma backend (Ollama)

The settings panel (click the status badge) can switch translation to a local Gemma model served by Ollama on `http://127.0.0.1:11434`, or to a hybrid mode that shows the LibreTranslate result instantly and swaps in Gemma's when ready.

Requirements:

1. Install the [Ollama](https://ollama.com) app and pull a model: `ollama pull gemma4:e2b-it-qat` (4.3 GB, fast) and/or `ollama pull gemma4:e4b` (9.6 GB, bigger).
2. Ollama must allow browser requests from Prime Video origins, or it answers 403 and the badge shows "Gemma offline":

```bash
launchctl setenv OLLAMA_ORIGINS "https://www.primevideo.com,https://*.primevideo.com,https://*.amazon.com,https://*.amazon.in"
# then restart the Ollama app
```

`launchctl setenv` does not survive a reboot. `start_local_server.command` sets it (and restarts Ollama if needed) on every start, so using the start script is enough.

### Current disk usage

- `.venv.nosync`: about `498 MB`
- `.hf-cache.nosync`: about `592 MB`

The heavy local folders (`.ollama-models.nosync`, `.hf-cache.nosync`, `.venv.nosync`) use a `.nosync` suffix so iCloud Drive skips them.
- total local translation footprint: about `1.1 GB`

## Notes

- Keep Prime Video subtitles enabled while testing.
- The extension reads the original subtitle line locally, hides the source line, and shows the translated overlay.
- If the server is not running, the overlay will fall back to the original text.
- A small status badge in the top-right corner shows whether the local translator is connected.
- The Telugu subtitle overlay is larger now for TV viewing distance.

## What success looks like

- The DevTools console prints the actual subtitle line
- The on-page debug box updates when the subtitle changes
