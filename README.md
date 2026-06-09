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

## What success looks like

- The DevTools console prints the actual subtitle line
- The on-page debug box updates when the subtitle changes

