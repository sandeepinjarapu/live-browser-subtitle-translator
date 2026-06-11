(function () {
  // Injected both by manifest matches and by the "Try on this site" action.
  if (window.__subtitleTranslatorLoaded) return;
  window.__subtitleTranslatorLoaded = true;

  const state = {
    subtitleRoot: null,
    lastText: "",
    lastTranslatedText: "",
    lastNodeSignature: "",
    hiddenNode: null,
    observer: null,
    rootObserver: null,
    retryTimer: null,
    clearTimer: null,
    overlayHost: null,
    translationCache: new Map(),
    activeRequestId: 0,
    subtitleSize: Number(localStorage.getItem("prime-subtitle-size")) || 36,
    translatorBackend: localStorage.getItem("prime-subtitle-backend") || "libre",
    gemmaModel: localStorage.getItem("prime-subtitle-gemma-model") || "gemma4:e2b-it-qat",
    targetLanguage: "Telugu",
    video: null,
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
    <div style="margin-bottom: 10px; font-size: 13px;">Translator backend:</div>
    <div id="prime-subtitle-backend-options" style="display: flex; gap: 8px; margin-bottom: 12px;">
      <button data-backend="libre" style="flex: 1; padding: 7px 10px; border: 0; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;">LibreTranslate</button>
      <button data-backend="gemma" style="flex: 1; padding: 7px 10px; border: 0; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;">Gemma backup</button>
      <button data-backend="hybrid" style="flex: 1; padding: 7px 10px; border: 0; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;">Hybrid</button>
    </div>
    <div style="margin-bottom: 10px; font-size: 13px;">Gemma model:</div>
    <div id="prime-subtitle-gemma-options" style="display: flex; gap: 8px; margin-bottom: 12px;">
      <button data-gemma-model="gemma4:e2b-it-qat" style="flex: 1; padding: 7px 10px; border: 0; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;">e2b (fast)</button>
      <button data-gemma-model="gemma4:e4b" style="flex: 1; padding: 7px 10px; border: 0; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;">e4b (big)</button>
    </div>
    <div style="margin-bottom: 10px; font-size: 13px;">Language (Gemma only; Libre is Telugu):</div>
    <select id="prime-subtitle-language" style="width: 100%; margin-bottom: 12px; padding: 6px; border-radius: 8px; border: 0; font: inherit; font-size: 12px; color: #111; background: #fff;">
      <option>Telugu</option>
      <option>Hindi</option>
      <option>Tamil</option>
      <option>Kannada</option>
      <option>Malayalam</option>
      <option>Bengali</option>
      <option>Marathi</option>
      <option>Spanish</option>
      <option>French</option>
      <option>German</option>
      <option>Japanese</option>
    </select>
    <div style="margin-bottom: 10px; font-size: 13px;">Subtitle size: <span id="prime-subtitle-size-value"></span>px</div>
    <input id="prime-subtitle-size-slider" type="range" min="20" max="60" step="1" style="width: 100%;">
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

  // Hide originals via stylesheet on known players: CSS applies to elements
  // created later too, so per-cue recreated caption nodes are born hidden —
  // unlike hideNode, which races the player. The overlay always shows text
  // (falling back to the original line if translation fails), so this is safe.
  const hideCss = document.createElement("style");
  hideCss.id = "prime-subtitle-hide-css";
  hideCss.textContent = [
    ".shaka-text-container,",
    ".atvwebplayersdk-captions-text,",
    ".ytp-caption-window-container,",
    ".atvwebplayersdk-caption {",
    "  opacity: 0 !important;",
    "}",
  ].join("\n");
  document.documentElement.appendChild(hideCss);

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
    const next = Math.min(60, Math.max(20, Number(size) || 36));
    state.subtitleSize = next;
    saveSetting("subtitleSize", next);
    box.style.font = `600 ${next}px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    const valueEl = settingsPanel.querySelector("#prime-subtitle-size-value");
    const sliderEl = settingsPanel.querySelector("#prime-subtitle-size-slider");
    if (valueEl) valueEl.textContent = String(next);
    if (sliderEl && Number(sliderEl.value) !== next) sliderEl.value = String(next);
  }

  function updateBackendButtons() {
    const buttons = settingsPanel.querySelectorAll("#prime-subtitle-backend-options button");
    buttons.forEach((button) => {
      const active = button.dataset.backend === state.translatorBackend;
      button.style.background = active ? "rgba(24, 119, 242, 0.95)" : "rgba(255,255,255,0.16)";
      button.style.color = "#fff";
      button.style.boxShadow = active ? "0 0 0 1px rgba(255,255,255,0.08) inset" : "none";
    });
    const modelButtons = settingsPanel.querySelectorAll("#prime-subtitle-gemma-options button");
    modelButtons.forEach((button) => {
      const active = button.dataset.gemmaModel === state.gemmaModel;
      button.style.background = active ? "rgba(24, 119, 242, 0.95)" : "rgba(255,255,255,0.16)";
      button.style.color = "#fff";
      button.style.boxShadow = active ? "0 0 0 1px rgba(255,255,255,0.08) inset" : "none";
    });
    // Language only applies to the Gemma backend; Libre is Telugu-only and
    // hybrid forces Telugu so its two stages agree.
    const languageSelect = settingsPanel.querySelector("#prime-subtitle-language");
    if (languageSelect) {
      const gemmaOnly = state.translatorBackend === "gemma";
      languageSelect.disabled = !gemmaOnly;
      languageSelect.style.opacity = gemmaOnly ? "1" : "0.45";
    }
  }

  function setGemmaModel(model) {
    state.gemmaModel = model;
    saveSetting("gemmaModel", model);
    updateBackendButtons();
    scheduleRead();
  }

  function saveSetting(key, value) {
    try {
      chrome.storage.sync.set({ [key]: value });
    } catch {
      // chrome.storage unavailable (e.g. extension reloaded); fall back below
    }
    localStorage.setItem(`prime-subtitle-${key}`, String(value));
  }

  function loadSettings() {
    try {
      chrome.storage.sync.get(
        ["translatorBackend", "gemmaModel", "targetLanguage", "subtitleSize"],
        (saved) => {
          if (!saved) return;
          if (saved.translatorBackend) state.translatorBackend = saved.translatorBackend;
          if (saved.gemmaModel) state.gemmaModel = saved.gemmaModel;
          if (saved.targetLanguage) state.targetLanguage = saved.targetLanguage;
          if (saved.subtitleSize) applySubtitleSize(saved.subtitleSize);
          const languageSelect = settingsPanel.querySelector("#prime-subtitle-language");
          if (languageSelect) languageSelect.value = state.targetLanguage;
          updateBackendButtons();
          pingTranslator();
        }
      );
    } catch {
      // chrome.storage unavailable; localStorage values already applied
    }
  }

  // Live cross-tab settings sync: another tab changing a setting updates
  // this one immediately (each tab otherwise only reads storage at load).
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      let translationAffected = false;
      if (changes.translatorBackend && changes.translatorBackend.newValue !== state.translatorBackend) {
        state.translatorBackend = changes.translatorBackend.newValue;
        translationAffected = true;
      }
      if (changes.gemmaModel && changes.gemmaModel.newValue !== state.gemmaModel) {
        state.gemmaModel = changes.gemmaModel.newValue;
        translationAffected = true;
      }
      if (changes.targetLanguage && changes.targetLanguage.newValue !== state.targetLanguage) {
        state.targetLanguage = changes.targetLanguage.newValue;
        const languageSelect = settingsPanel.querySelector("#prime-subtitle-language");
        if (languageSelect) languageSelect.value = state.targetLanguage;
        translationAffected = true;
      }
      if (changes.subtitleSize && Number(changes.subtitleSize.newValue) !== state.subtitleSize) {
        applySubtitleSize(changes.subtitleSize.newValue);
      }
      if (translationAffected) {
        updateBackendButtons();
        pingTranslator();
        state.lastText = "";
        scheduleRead();
      }
    });
  } catch {
    // chrome.storage unavailable (extension reloaded out from under us)
  }

  function cleanTranslation(text) {
    let cleaned = text.trim().replace(/^(here(?:'|’)s the translation:?|translation:?)\s*/i, "");
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("“") && cleaned.endsWith("”"))
    ) {
      cleaned = cleaned.slice(1, -1);
    }
    return cleaned.trim();
  }

  function toggleSettings(open) {
    state.settingsOpen = typeof open === "boolean" ? open : !state.settingsOpen;
    settingsPanel.style.display = state.settingsOpen ? "block" : "none";
    if (state.settingsOpen) updateBackendButtons();
  }

  function setStatus(text, ok) {
    statusBadge.textContent = text;
    statusBadge.style.background = ok ? "rgba(22, 120, 42, 0.82)" : "rgba(90, 20, 20, 0.82)";
  }

  function setTranslatorBackend(backend) {
    state.translatorBackend = ["gemma", "hybrid"].includes(backend) ? backend : "libre";
    saveSetting("translatorBackend", state.translatorBackend);
    state.translationCache.clear();
    updateBackendButtons();
    pingTranslator();
    scheduleRead();
  }

  // All backend calls go through the background service worker: content-script
  // fetches run under the page's CSP, and some OTTs (Hotstar) block localhost.
  function bgFetch(url, init) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "fetch", url, init }, (res) => {
        if (chrome.runtime.lastError || !res) {
          reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : "no response"));
          return;
        }
        resolve(res);
      });
    });
  }

  async function translateWithLibre(text) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return "";

    const cacheKey = `libre:${normalized}`;
    if (state.translationCache.has(cacheKey)) {
      return state.translationCache.get(cacheKey);
    }

    const response = await bgFetch("http://127.0.0.1:5000/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: normalized }),
    });

    if (!response.ok) {
      throw new Error(`translation server returned ${response.status}`);
    }

    const data = JSON.parse(response.body);
    const translated = (data && data.translated ? String(data.translated) : "").trim();
    if (translated) {
      state.translationCache.set(cacheKey, translated);
    }
    return translated;
  }

  async function translateWithGemma(text, onPartial) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return "";

    // Hybrid pairs Gemma with Telugu-only Libre, so both stages must match.
    const lang = state.translatorBackend === "hybrid" ? "Telugu" : state.targetLanguage;
    const cacheKey = `gemma:${state.gemmaModel}:${lang}:${normalized}`;
    if (state.translationCache.has(cacheKey)) {
      return state.translationCache.get(cacheKey);
    }

    const init = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: state.gemmaModel,
        think: false,
        prompt: [
          `Translate the following English subtitle into natural ${lang}.`,
          `Respond in ${lang} only, even if the line is short or ambiguous.`,
          `Return only the ${lang} translation, nothing else.`,
          "",
          normalized,
        ].join("\n"),
        stream: true,
        keep_alive: "30m",
        options: {
          temperature: 0,
          num_predict: 128,
        },
      }),
    };

    const accumulated = await new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: "stream" });
      let buffer = "";
      let acc = "";
      let settled = false;
      // Watchdog: a queued/hung request must not leave "…" on screen forever.
      // Reset on every chunk, so slow-but-alive streams are fine.
      let watchdog;
      const armWatchdog = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { port.disconnect(); } catch { /* already gone */ }
          reject(new Error("gemma timed out"));
        }, 20000);
      };
      armWatchdog();
      port.onDisconnect.addListener(() => {
        clearTimeout(watchdog);
        if (!settled) reject(new Error("stream port disconnected"));
      });
      port.onMessage.addListener((msg) => {
        armWatchdog();
        if (msg.error) {
          settled = true;
          clearTimeout(watchdog);
          port.disconnect();
          reject(new Error(`ollama: ${msg.error}`));
          return;
        }
        if (msg.done) {
          settled = true;
          clearTimeout(watchdog);
          port.disconnect();
          resolve(acc);
          return;
        }
        buffer += msg.chunk;
        const chunks = buffer.split("\n");
        buffer = chunks.pop();
        for (const chunk of chunks) {
          if (!chunk.trim()) continue;
          try {
            const data = JSON.parse(chunk);
            if (data.response) acc += data.response;
          } catch {
            // ignore partial JSON
          }
        }
        if (acc && onPartial) onPartial(acc.trim());
      });
      port.postMessage({ url: "http://127.0.0.1:11434/api/generate", init });
    });

    const translated = cleanTranslation(accumulated);
    if (translated) {
      state.translationCache.set(cacheKey, translated);
    }
    return translated;
  }

  async function translateToTelugu(text) {
    return state.translatorBackend === "gemma" ? translateWithGemma(text) : translateWithLibre(text);
  }

  async function pingTranslator() {
    const check = async (url) => {
      const res = await bgFetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
    };
    const libreUrl = "http://127.0.0.1:5000/health";
    const gemmaUrl = "http://127.0.0.1:11434/api/tags";
    if (state.translatorBackend === "hybrid") {
      const [libreOk, gemmaOk] = await Promise.all([
        check(libreUrl).then(() => true, () => false),
        check(gemmaUrl).then(() => true, () => false),
      ]);
      if (libreOk && gemmaOk) setStatus("Translator: hybrid connected", true);
      else if (libreOk) setStatus("Translator: Gemma offline", false);
      else if (gemmaOk) setStatus("Translator: Libre offline", false);
      else setStatus("Translator: offline", false);
      return;
    }
    try {
      await check(state.translatorBackend === "gemma" ? gemmaUrl : libreUrl);
      setStatus(state.translatorBackend === "gemma" ? "Translator: Gemma connected" : "Translator: connected", true);
    } catch {
      setStatus(state.translatorBackend === "gemma" ? "Translator: Gemma offline" : "Translator: offline", false);
    }
  }

  // Known sites get pinned selectors (zero blast radius between sites);
  // unknown sites — or known sites after a redesign breaks the pins — fall
  // back to the generic heuristics below.
  const SITE_ADAPTERS = [
    {
      hosts: ["hotstar.com"],
      roots: [".shaka-text-container"],
    },
    {
      hosts: ["youtube.com"],
      roots: [".ytp-caption-window-container"],
    },
    {
      hosts: ["primevideo.com", "amazon.com", "amazon.in"],
      roots: [
        ".atvwebplayersdk-captions-text",
        ".atvwebplayersdk-caption",
        ".atvwebplayersdk-captions-container",
      ],
      noiseLines: [
        /^(x-ray|all|more like this|details|cast|episodes?)$/i,
        /^crime\s+\d+/i,
        /^made in india:/i,
        /^season\s+\d+,\s*ep\.\s*\d+/i,
        /^the watch project$/i,
        /uses about/i,
        /quality/i,
        /^(crime|episode|season)\s+\d+/i,
      ],
    },
  ];
  const siteAdapter =
    SITE_ADAPTERS.find((a) =>
      a.hosts.some((h) => location.hostname === h || location.hostname.endsWith(`.${h}`))
    ) || null;
  let adapterMissLogged = false;

  function candidateRoots() {
    if (siteAdapter) {
      const pinned = siteAdapter.roots
        .map((selector) => document.querySelector(selector))
        .filter(Boolean);
      if (pinned.length) return pinned;
      if (!adapterMissLogged) {
        adapterMissLogged = true;
        log("site adapter selectors found nothing — falling back to generic heuristics (site redesign?)");
      }
    }
    // All matches per selector, not just the first: querySelector's first
    // document-order hit can be a <script> in <head> whose class mentions
    // captions (YouTube). Scoring in pickRoot chooses among candidates.
    const selectors = [
      ".shaka-text-container",
      ".ytp-caption-window-container",
      ".atvwebplayersdk-caption",
      ".atvwebplayersdk-captions-container",
      ".atvwebplayersdk-captions-text",
      ".atvwebplayersdk-player-container",
      '[aria-label="Web Player"]',
      ".dv-player-fullscreen",
      '[data-testid*="caption"]',
      '[class*="caption"]',
      '[class*="subtitle"]',
    ];
    const seenEls = new Set();
    const out = [];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (seenEls.has(el)) continue;
        seenEls.add(el);
        if (/^(SCRIPT|STYLE|LINK|META|NOSCRIPT)$/.test(el.tagName)) continue;
        out.push(el);
        if (out.length >= 40) return out;
      }
    }
    return out;
  }

  function pickRoot() {
    const roots = candidateRoots();
    if (!roots.length) return null;

    let best = null;
    let bestScore = -1;
    for (const el of roots) {
      const text = (el.innerText || "").trim();
      const score =
        (/caption|shaka-text/i.test(el.className || "") ? 10 : 0) +
        (text.length > 0 ? 5 : 0) +
        (el.querySelectorAll("*").length > 0 ? 2 : 0) +
        (el.getBoundingClientRect().top > window.innerHeight * 0.4 ? 2 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    // Stick with the current root unless the new pick is a caption element;
    // generic containers flapping in and out re-trigger observers and drop lines.
    if (
      state.subtitleRoot &&
      document.contains(state.subtitleRoot) &&
      best !== state.subtitleRoot &&
      !/caption|shaka-text/i.test(best && best.className || "")
    ) {
      return state.subtitleRoot;
    }
    return best;
  }

  // Generic noise: clocks/timestamps and player chrome common to all OTTs.
  // Site-specific UI strings live in the adapter's noiseLines.
  const GENERIC_NOISE = [
    /^[0-9]+(:[0-9]{2})?(\s*\/\s*[0-9]{1,2}:[0-9]{2})?$/,
    /^[0-9]{1,2}:[0-9]{2}\s*\/\s*[0-9]{1,2}:[0-9]{2}$/,
    /next episode/i,
    /^[\d:.\s\/\-]+$/,
  ];

  function noisePatterns() {
    return GENERIC_NOISE.concat((siteAdapter && siteAdapter.noiseLines) || []);
  }

  function isNoise(text) {
    return !text || text.length < 2 || noisePatterns().some((re) => re.test(text));
  }

  function narrowText(text) {
    const patterns = noisePatterns();
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !patterns.some((re) => re.test(line)));
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
        // Linger so the viewer has time to finish reading; a new line cancels this.
        // Scale with line length: ~90ms per character, between 2s and 5s.
        const lingerMs = Math.min(5000, Math.max(2000, (box.textContent || "").length * 90));
        clearTimeout(state.clearTimer);
        state.clearTimer = setTimeout(() => show(""), lingerMs);
      }
      return;
    }

    if (text !== state.lastText) {
      state.lastText = text;
      clearTimeout(state.clearTimer);
      // Hidden tabs don't translate: their overlay is invisible, and skipping
      // keeps the backends free for the tab the user is actually watching.
      // On refocus the visibilitychange handler re-reads the current line.
      if (document.hidden) {
        show("");
        return;
      }
      log("subtitle", text);
      const requestId = ++state.activeRequestId;
      show("…");
      const applyTranslation = (translated) => {
        if (requestId !== state.activeRequestId) return;
        const output = translated || text;
        state.lastTranslatedText = output;
        show(output);
        log("translation", output);
      };
      if (state.translatorBackend === "hybrid") {
        let gemmaDone = false;
        translateWithLibre(text)
          .then((translated) => {
            if (!gemmaDone) applyTranslation(translated);
          })
          .catch((error) => {
            if (!gemmaDone) applyTranslation("");
            log("translationError", String(error));
          });
        translateWithGemma(text)
          .then((translated) => {
            gemmaDone = true;
            applyTranslation(translated);
          })
          .catch((error) => {
            log("translationError", String(error));
          });
      } else if (state.translatorBackend === "gemma") {
        let lastPartialAt = 0;
        const onPartial = (partial) => {
          if (requestId !== state.activeRequestId) return;
          // Throttle so the overlay grows in calm steps instead of per token.
          const now = Date.now();
          if (now - lastPartialAt < 200) return;
          lastPartialAt = now;
          show(partial);
        };
        translateWithGemma(text, onPartial)
          .then(applyTranslation)
          .catch((error) => {
            applyTranslation("");
            log("translationError", String(error));
          });
      } else {
        translateToTelugu(text)
          .then(applyTranslation)
          .catch((error) => {
            applyTranslation("");
            log("translationError", String(error));
          });
      }
      const subtitleNode = findSmallestMatchingDescendant(state.subtitleRoot, text) || findSubtitleNode(state.subtitleRoot, text);
      if (subtitleNode) {
        const signature = nodePath(subtitleNode);
        if (signature !== state.lastNodeSignature) {
          state.lastNodeSignature = signature;
          log("node", signature);
          log("nodeText", (subtitleNode.innerText || "").trim());
        }
        // Hide the caption container, not the matched leaf: players recreate
        // text spans per cue (fresh spans show through), and the matched node
        // often carries only a hashed class (Prime), so leaf-level rules miss.
        const captionContainer = subtitleNode.closest('.shaka-text-container, [class*="caption" i]');
        if (captionContainer) {
          hideNode(captionContainer);
        }
      }
    }
  }

  function scheduleRead() {
    clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(read, 16);
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
    refresh();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      state.lastText = "";
      scheduleRead();
    }
  });
  statusBadge.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSettings();
  });

  const backendButtons = settingsPanel.querySelectorAll("#prime-subtitle-backend-options button");
  backendButtons.forEach((button) => {
    button.addEventListener("click", () => setTranslatorBackend(button.dataset.backend));
  });

  const gemmaModelButtons = settingsPanel.querySelectorAll("#prime-subtitle-gemma-options button");
  gemmaModelButtons.forEach((button) => {
    button.addEventListener("click", () => setGemmaModel(button.dataset.gemmaModel));
  });

  const languageSelect = settingsPanel.querySelector("#prime-subtitle-language");
  if (languageSelect) {
    languageSelect.addEventListener("change", (event) => {
      state.targetLanguage = event.target.value;
      saveSetting("targetLanguage", state.targetLanguage);
      scheduleRead();
    });
  }

  const slider = settingsPanel.querySelector("#prime-subtitle-size-slider");
  const sizeValue = settingsPanel.querySelector("#prime-subtitle-size-value");
  if (slider && sizeValue) {
    slider.value = String(state.subtitleSize);
    sizeValue.textContent = String(state.subtitleSize);
    slider.addEventListener("input", (event) => {
      applySubtitleSize(event.target.value);
    });
  }
  updateBackendButtons();
  window.addEventListener("resize", scheduleRead);

  refresh();
  pingTranslator();
  setInterval(() => {
    if (!document.hidden) pingTranslator();
  }, 5000);
  function watchVideoSeeks() {
    const video = document.querySelector("video");
    if (!video || video === state.video) return;
    state.video = video;
    // On seeks/skips the lingering subtitle no longer matches the scene.
    video.addEventListener("seeked", () => {
      clearTimeout(state.clearTimer);
      if (!state.lastText) show("");
    });
  }

  loadSettings();
  watchVideoSeeks();
  setInterval(() => {
    watchVideoSeeks();
    // Always re-evaluate the root, not just when it left the DOM: the initial
    // pick can land on a lookalike (e.g. Hotstar's subtitle button icon) that
    // never gets removed, and the real caption container appears later.
    // pickRoot's stickiness prevents flapping between equivalent roots.
    refresh();
  }, 1500);
})();
