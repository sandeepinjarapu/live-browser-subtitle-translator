(function () {
  const state = {
    subtitleRoot: null,
    lastText: "",
    observer: null,
    rootObserver: null,
    retryTimer: null,
    overlayHost: null,
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
        show("");
      }
      return;
    }

    if (text !== state.lastText) {
      state.lastText = text;
      log("subtitle", text);
      show(text);
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
