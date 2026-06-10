#!/bin/bash
cd "$(dirname "$0")"

# Allow the extension's browser-origin requests to reach Ollama (Gemma backend).
# launchctl setenv does not survive reboots, so set it on every start.
launchctl setenv OLLAMA_ORIGINS "https://www.primevideo.com,https://*.primevideo.com,https://*.amazon.com,https://*.amazon.in"
# Models live in a .nosync folder so iCloud does not upload/evict them.
launchctl setenv OLLAMA_MODELS "$PWD/.ollama-models.nosync"
if curl -s --max-time 2 -o /dev/null -H "Origin: https://www.primevideo.com" --fail http://127.0.0.1:11434/api/tags; then
  echo "Ollama is up and accepts Prime Video origins."
else
  echo "Restarting Ollama to pick up OLLAMA_ORIGINS..."
  pkill -f Ollama.app 2>/dev/null
  sleep 2
  open -a Ollama 2>/dev/null || echo "Ollama app not found - install it for the Gemma backend."
fi
source .venv.nosync/bin/activate
export HF_HOME="$PWD/.hf-cache.nosync"
export HF_HUB_DISABLE_XET=1
export HF_HUB_ENABLE_HF_TRANSFER=0
python local_translate_server.py
