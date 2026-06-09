#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
export HF_HOME="$PWD/.hf-cache"
export HF_HUB_DISABLE_XET=1
export HF_HUB_ENABLE_HF_TRANSFER=0
python local_translate_server.py
