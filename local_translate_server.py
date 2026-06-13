#!/usr/bin/env python3
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

MODEL_ID = os.environ.get("TRANSLATION_MODEL", "Helsinki-NLP/opus-mt-en-dra")
TARGET_TOKEN = os.environ.get("TRANSLATION_TARGET_TOKEN", ">>tel<<")
HOST = os.environ.get("TRANSLATE_HOST", "127.0.0.1")
PORT = int(os.environ.get("TRANSLATE_PORT", "5000"))
# Only the extension may call this server. Requests are proxied through the
# extension's service worker, which sends Origin: chrome-extension://<id>;
# browsers forbid pages from spoofing Origin, so an exact match is a real gate.
# (A pre-shared token would add nothing here and only matters once onboarding
# can deliver it out-of-band — see ASSUMPTIONS.md S2.)
ALLOWED_ORIGIN = os.environ.get(
    "TRANSLATE_ALLOWED_ORIGIN", "chrome-extension://kdhcjlpldolfkacabaegbhdbgjdpjgod"
)

_model_lock = threading.Lock()
_tokenizer = None
_model = None
_cache = {}


def load_model():
    global _tokenizer, _model
    with _model_lock:
        if _tokenizer is None or _model is None:
            _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
            _model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_ID)
            _model.eval()


def translate_text(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""

    cached = _cache.get(text)
    if cached is not None:
        return cached

    load_model()
    prompt = f"{TARGET_TOKEN} {text}"
    inputs = _tokenizer(prompt, return_tensors="pt", truncation=True)

    with torch.inference_mode():
      generated = _model.generate(
          **inputs,
          max_new_tokens=128,
          num_beams=4,
      )

    translated = _tokenizer.decode(generated[0], skip_special_tokens=True).strip()
    _cache[text] = translated
    return translated


class Handler(BaseHTTPRequestHandler):
    def _origin_ok(self) -> bool:
        # Block only when an Origin is present and wrong. Browsers always attach
        # Origin on cross-origin requests (even no-cors), so a malicious page is
        # rejected; an Origin-less request is the extension's own service-worker
        # GET (e.g. /health), which Chrome sends without an Origin header.
        origin = self.headers.get("Origin")
        return origin is None or origin == ALLOWED_ORIGIN

    def _cors(self):
        # Reflect only the one allowed origin — never "*".
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        # Deny the preflight for any other origin — the browser then never
        # sends the real request.
        if not self._origin_ok():
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if not self._origin_ok():
            self._send_json(403, {"error": "forbidden"})
            return
        if self.path == "/health":
            self._send_json(200, {"ok": True, "model": MODEL_ID})
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if not self._origin_ok():
            self._send_json(403, {"error": "forbidden"})
            return
        if self.path != "/translate":
            self._send_json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid json"})
            return

        text = payload.get("text", "")
        try:
            translated = translate_text(text)
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})
            return

        self._send_json(200, {"text": text, "translated": translated})

    def log_message(self, format, *args):
        return


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Translation server listening on http://{HOST}:{PORT}")
    print(f"Model: {MODEL_ID}")
    server.serve_forever()


if __name__ == "__main__":
    main()
