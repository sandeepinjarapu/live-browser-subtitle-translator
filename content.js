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
  };

  const box = document.createElement("div");
  box.id = "prime-subtitle-overlay";
  box.style.cssText = [
    "position: fixed",
    "left: 50%",
    "bottom: 7%",
    "transform: translateX(-50%)",
    "z-index: 2147483647",
    "max-width: min(82vw, 920px)",
    "padding: 14px 18px",
    "border-radius: 12px",
    "background: rgba(0, 0, 0, 0.82)",
    "color: #fff",
    "font: 600 22px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "text-align: center",
    "white-space: pre-wrap",
    "pointer-events: none",
    "text-shadow: 0 1px 2px rgba(0,0,0,0.7)",
    "display: none",
  ].join(";");

  function ensureOverlayHost() {
    if (state.overlayHost && document.contains(state.overlayHost)) return state.overlayHost;
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
    document.documentElement.appendChild(host);
    host.appendChild(box);
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

  document.addEventListener("fullscreenchange", refresh);
  window.addEventListener("resize", scheduleRead);

  const fullscreenWatcher = new MutationObserver(() => {
    const fsRoot = getFullscreenRoot();
    if (fsRoot && state.overlayHost && !document.contains(state.overlayHost)) {
      document.documentElement.appendChild(state.overlayHost);
      state.overlayHost.appendChild(box);
    }
  });
  fullscreenWatcher.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  refresh();
  setInterval(() => {
    if (!state.subtitleRoot || !document.contains(state.subtitleRoot)) {
      refresh();
    }
  }, 1500);
})();
