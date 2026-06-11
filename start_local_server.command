#!/bin/bash
# One-time installer: registers both translation backends as login services
# (LaunchAgents), so nothing needs to be started manually after reboots.
# Safe to re-run; it refreshes the installed agents.
set -e
cd "$(dirname "$0")"

ST="$HOME/.subtitle-translator"
if [ ! -d "$ST/venv" ]; then
  echo "Expected runtime at $ST (venv, hf-cache, ollama-models)."
  echo "See README 'Run the local services' for first-time setup."
  exit 1
fi

cp local_translate_server.py "$ST/"
cp launchd/com.subtitle-translator.libre.plist launchd/com.subtitle-translator.ollama-env.plist ~/Library/LaunchAgents/

launchctl bootout "gui/$(id -u)/com.subtitle-translator.libre" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.subtitle-translator.ollama-env" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.subtitle-translator.libre.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.subtitle-translator.ollama-env.plist

echo "Installed. Both translators now start at login and recover on their own."
echo "Logs: /tmp/subtitle-translator-libre.log and /tmp/subtitle-translator-ollama-env.log"
