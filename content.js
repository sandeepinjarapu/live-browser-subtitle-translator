(function () {
  const state = {
    subtitleRoot: null,
    lastText: "",
    lastTranslatedText: "",
    lastNodeSignature: "",
    hiddenNode: null,
    observer: null,
    rootObserver: null,
    retryTimer: null,
    overlayHost: null,
    translationCache: new Map(),
    activeRequestId: 0,
    subtitleSize: 36,
    settingsOpen: false,
  };

  const box = document.createElement("div");
  box.id = "prime-subtitle-overlay";
  box.style.cssText = [
    "position: fixed",
    "left: 50%",
    "bottom: 7%",
    "transform: translateX(-50%)",
    "z-index: 2147483647",
    "max-width: min(88vw, 1040px)",
    "padding: 14px 18px",
    "border-radius: 12px",
    "background: rgba(0, 0, 0, 0.82)",
    "color: #fff",
    `font: 600 ${state.subtitleSize}px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    "text-align: center",
    "white-space: pre-wrap",
    "pointer-events: none",
    "text-shadow: 0 1px 2px rgba(0,0,0,0.7)",
    "display: none",
  ].join(";");

  const statusBadge = document.createElement("div");
  statusBadge.id = "prime-subtitle-status";
  statusBadge.style.cssText = [
    "position: fixed",
    "right: 14px",
    "top: 14px",
    "z-index: 2147483647",
    "padding: 6px 10px",
    "border-radius: 999px",
    "font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "letter-spacing: 0.02em",
    "background: rgba(0,0,0,0.72)",
    "color: #fff",
    "pointer-events: auto",
    "opacity: 0.88",
  ].join(";");
  statusBadge.textContent = "Translator: checking...";

  const settingsPanel = document.createElement("div");
  settingsPanel.id = "prime-subtitle-settings";
  settingsPanel.style.cssText = [
    "position: fixed",
    "right: 14px",
    "top: 52px",
    "z-index: 2147483647",
    "min-width: 250px",
    "padding: 12px 14px",
    "border-radius: 14px",
    "background: rgba(0,0,0,0.84)",
    "color: #fff",
    "font: 600 13px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "pointer-events: auto",
    "display: none",
    "box-shadow: 0 12px 30px rgba(0,0,0,0.35)",
  ].join(";");
  settingsPanel.innerHTML = `
    <div style="margin-bottom: 10px; font-size: 13px;">Subtitle size: <span id="prime-subtitle-size-value"></span>px</div>
    <input id="prime-subtitle-size-slider" type="range" min="20" max="48" step="1" style="width: 100%;">
    <div style="margin-top: 10px; font-size: 12px; opacity: 0.8;">Click the badge to close.</div>
  `;

  function ensureOverlayHost() {
    const mountRoot = document.fullscreenElement || document.documentElement;
    if (state.overlayHost && document.contains(state.overlayHost)) {
      if (state.overlayHost.parentElement !== mountRoot) {
        mountRoot.appendChild(state.overlayHost);
      }
      return state.overlayHost;
    }
    const host = document.createElement("div");
    host.id = "prime-subtitle-overlay-host";
    host.style.cssText = [
      "position: fixed",
      "left: 0",
      "top: 0",
      "width: 100vw",
      "height: 100vh",
      "z-index: 2147483647",
      "pointer-events: none",
      "overflow: visible",
    ].join(";");
    mountRoot.appendChild(host);
    host.appendChild(box);
    host.appendChild(statusBadge);
    host.appendChild(settingsPanel);
    state.overlayHost = host;
    return host;
  }

  ensureOverlayHost();

  function log(...args) {
    console.log("[Prime Subtitle Light]", ...args);
  }

  function show(text) {
    if (!text) {
      box.style.display = "none";
      box.textContent = "";
      return;
    }
    box.textContent = text;
    box.style.display = "block";
  }

  function applySubtitleSize(size) {
    const next = Math.min(48, Math.max(20, Number(size) || 36));
    state.subtitleSize = next;
    box.style.font = `600 ${next}px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    const valueEl = settingsPanel.querySelector("#prime-subtitle-size-value");
    const sliderEl = settingsPanel.querySelector("#prime-subtitle-size-slider");
    if (valueEl) valueEl.textContent = String(next);
    if (sliderEl && Number(sliderEl.value) !== next) sliderEl.value = String(next);
  }

  function toggleSettings(open) {
    state.settingsOpen = typeof open === "boolean" ? open : !state.settingsOpen;
    settingsPanel.style.display = state.settingsOpen ? "block" : "none";
  }

  function setStatus(text, ok) {
    statusBadge.textContent = text;
    statusBadge.style.background = ok ? "rgba(22, 120, 42, 0.82)" : "rgba(90, 20, 20, 0.82)";
  }

  async function translateToTelugu(text) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return "";

    if (state.translationCache.has(normalized)) {
      return state.translationCache.get(normalized);
    }

    const response = await fetch("http://127.0.0.1:5000/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: normalized }),
    });

    if (!response.ok) {
      throw new Error(`translation server returned ${response.status}`);
    }

    const data = await response.json();
    const translated = (data && data.translated ? String(data.translated) : "").trim();
    if (translated) {
      state.translationCache.set(normalized, translated);
    }
    return translated;
  }

  async function pingTranslator() {
    try {
      const res = await fetch("http://127.0.0.1:5000/health", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("Translator: connected", true);
    } catch {
      setStatus("Translator: offline", false);
    }
  }

  function candidateRoots() {
    return [
      document.querySelector(".atvwebplayersdk-caption"),
      document.querySelector(".atvwebplayersdk-captions-container"),
      document.querySelector(".atvwebplayersdk-captions-text"),
      document.querySelector(".atvwebplayersdk-player-container"),
      document.querySelector('[aria-label="Web Player"]'),
      document.querySelector(".dv-player-fullscreen"),
      document.querySelector('[data-testid*="caption"]'),
      document.querySelector('[class*="caption"]'),
      document.querySelector('[class*="subtitle"]'),
      document.querySelector('[class*="subtitles"]'),
    ].filter(Boolean);
  }

  function pickRoot() {
    const roots = candidateRoots();
    if (!roots.length) return null;

    let best = null;
    let bestScore = -1;
    for (const el of roots) {
      const text = (el.innerText || "").trim();
      const score =
        (text.length > 0 ? 5 : 0) +
        (el.querySelectorAll("*").length > 0 ? 2 : 0) +
        (el.getBoundingClientRect().top > window.innerHeight * 0.4 ? 2 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function isNoise(text) {
    return (
      !text ||
      text.length < 2 ||
      /^[0-9]+(:[0-9]{2})?(\s*\/\s*[0-9]{1,2}:[0-9]{2})?$/.test(text) ||
      /next episode/i.test(text) ||
      /uses about/i.test(text) ||
      /quality/i.test(text) ||
      /^(crime|episode|season)\s+\d+/i.test(text)
    );
  }

  function narrowText(text) {
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^(x-ray|all|more like this|details|cast|episodes?)$/i.test(line))
      .filter((line) => !/^[0-9]{1,2}:[0-9]{2}\s*\/\s*[0-9]{1,2}:[0-9]{2}$/.test(line))
      .filter((line) => !/^next episode$/i.test(line))
      .filter((line) => !/^crime\s+\d+/i.test(line))
      .filter((line) => !/^made in india:/i.test(line))
      .filter((line) => !/^season\s+\d+,\s*ep\.\s*\d+/i.test(line))
      .filter((line) => !/^the watch project$/i.test(line));
    if (lines.length === 0) return "";
    return lines.join("\n");
  }

  function nodePath(el) {
    const parts = [];
    let cur = el;
    while (cur && parts.length < 8) {
      let part = cur.tagName ? cur.tagName.toLowerCase() : "";
      if (cur.id) part += `#${cur.id}`;
      if (cur.className && typeof cur.className === "string") {
        const cls = cur.className.trim().split(/\s+/).slice(0, 3).join(".");
        if (cls) part += `.${cls}`;
      }
      if (part) parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function hideNode(node) {
    if (!node) return;
    if (state.hiddenNode && state.hiddenNode !== node) {
      state.hiddenNode.style.opacity = "";
      state.hiddenNode.style.textShadow = "";
    }
    state.hiddenNode = node;
    node.style.opacity = "0";
    node.style.textShadow = "none";
  }

  function findSubtitleNode(root, text) {
    if (!root || !text) return null;
    const normTarget = text.replace(/\s+/g, " ").trim();
    const nodes = [...root.querySelectorAll("div, span, p")];
    let best = null;
    let bestScore = -Infinity;
    for (const el of nodes) {
      const raw = (el.innerText || "").trim();
      if (!raw) continue;
      const norm = raw.replace(/\s+/g, " ").trim();
      if (!norm.includes(normTarget) && !normTarget.includes(norm)) continue;
      const rect = el.getBoundingClientRect();
      const score =
        norm.length * 2 +
        Math.max(0, rect.width) * 0.2 +
        Math.max(0, rect.height) * 0.5 +
        (rect.top > window.innerHeight * 0.45 ? 80 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function findSmallestMatchingDescendant(root, text) {
    if (!root || !text) return null;
    const normTarget = text.replace(/\s+/g, " ").trim();
    const nodes = [...root.querySelectorAll("div, span, p")];
    let best = null;
    let bestScore = Infinity;
    for (const el of nodes) {
      const raw = (el.innerText || "").trim();
      if (!raw) continue;
      const norm = raw.replace(/\s+/g, " ").trim();
      if (!norm.includes(normTarget) && !normTarget.includes(norm)) continue;
      const rect = el.getBoundingClientRect();
      const area = Math.max(1, rect.width * rect.height);
      const depthPenalty = nodePath(el).split(" > ").length * 25;
      const score = area + depthPenalty;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function extractText(root) {
    if (!root) return "";
    const text = narrowText((root.innerText || "").trim().replace(/\s+\n/g, "\n"));
    if (isNoise(text)) return "";
    return text;
  }

  function getFullscreenRoot() {
    return (
      document.fullscreenElement ||
      document.querySelector(".dv-player-fullscreen") ||
      document.querySelector(".atvwebplayersdk-player-container") ||
      document.querySelector('[aria-label="Web Player"]') ||
      document.body
    );
  }

  function refresh() {
    const root = pickRoot();
    if (!root) {
      show("");
      return;
    }

    if (root !== state.subtitleRoot) {
      state.subtitleRoot = root;
      if (state.observer) state.observer.disconnect();
      state.observer = new MutationObserver(scheduleRead);
      state.observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      log("watching root", root);
    }

    read();
  }

  function read() {
    const text = extractText(state.subtitleRoot);
    if (!text) {
      if (state.lastText) {
        state.lastText = "";
        state.lastTranslatedText = "";
        state.lastNodeSignature = "";
        show("");
      }
      return;
    }

    if (text !== state.lastText) {
      state.lastText = text;
      log("subtitle", text);
      const requestId = ++state.activeRequestId;
      show("…");
      translateToTelugu(text)
        .then((translated) => {
          if (requestId !== state.activeRequestId) return;
          const output = translated || text;
          state.lastTranslatedText = output;
          show(output);
          log("translation", output);
        })
        .catch((error) => {
          if (requestId !== state.activeRequestId) return;
          state.lastTranslatedText = text;
          show(text);
          log("translationError", String(error));
        });
      const subtitleNode = findSmallestMatchingDescendant(state.subtitleRoot, text) || findSubtitleNode(state.subtitleRoot, text);
      if (subtitleNode) {
        const signature = nodePath(subtitleNode);
        if (signature !== state.lastNodeSignature) {
          state.lastNodeSignature = signature;
          log("node", signature);
          log("nodeText", (subtitleNode.innerText || "").trim());
        }
        if (subtitleNode.tagName === "SPAN" && /caption/i.test(subtitleNode.className || "")) {
          hideNode(subtitleNode);
        }
      }
    }
  }

  function scheduleRead() {
    clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(read, 75);
  }

  state.rootObserver = new MutationObserver(() => {
    if (!state.subtitleRoot || !document.contains(state.subtitleRoot)) {
      refresh();
    }
  });
  state.rootObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  document.addEventListener("fullscreenchange", () => {
  ensureOverlayHost();
  applySubtitleSize(state.subtitleSize);

  statusBadge.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSettings();
  });

  const slider = settingsPanel.querySelector("#prime-subtitle-size-slider");
  const sizeValue = settingsPanel.querySelector("#prime-subtitle-size-value");
  if (slider && sizeValue) {
    slider.value = String(state.subtitleSize);
    sizeValue.textContent = String(state.subtitleSize);
    slider.addEventListener("input", (event) => {
      applySubtitleSize(event.target.value);
    });
  }
    refresh();
  });
  window.addEventListener("resize", scheduleRead);

  refresh();
  pingTranslator();
  setInterval(pingTranslator, 5000);
  setInterval(() => {
    if (!state.subtitleRoot || !document.contains(state.subtitleRoot)) {
      refresh();
    }
  }, 1500);
})();
