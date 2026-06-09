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

```bash
source .venv/bin/activate
export HF_HOME="$PWD/.hf-cache"
export HF_HUB_DISABLE_XET=1
export HF_HUB_ENABLE_HF_TRANSFER=0
python local_translate_server.py
```

### Current disk usage

- `.venv`: about `498 MB`
- `.hf-cache`: about `592 MB`
- total local translation footprint: about `1.1 GB`

## Notes

- Keep Prime Video subtitles enabled while testing.
- The extension reads the original subtitle line locally, hides the source line, and shows the translated overlay.
- If the server is not running, the overlay will fall back to the original text.

## What success looks like

- The DevTools console prints the actual subtitle line
- The on-page debug box updates when the subtitle changes
