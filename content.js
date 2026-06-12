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
    minDisplayTimer: null,
    lastPaintAt: 0,
    paintedRequestId: 0,
    overlayHost: null,
    translationCache: new Map(),
    activeRequestId: 0,
    spec: null,
    rollingLines: [],
    rollingPending: "",
    recentCommitted: [],
    lastCaptionTextAt: Date.now(),
    captionHint: "",
    rollingEmptySince: 0,
    prevLines: [], // last 2 source lines, newest last
    styleProfile: localStorage.getItem("prime-subtitle-styleProfile") || "auto",
    category: "", // page-declared genre (YouTube meta itemprop)
    categoryHref: "",
    nameCounts: new Map(),
    glossaryNames: [],
    warm: new Map(),
    warmNextSrc: "",
    warmTimer: null,
    subtitleSize: Number(localStorage.getItem("prime-subtitle-size")) || 36,
    translatorBackend: localStorage.getItem("prime-subtitle-backend") || "libre",
    enabled: localStorage.getItem("prime-subtitle-enabled") !== "false",
    showOriginal: localStorage.getItem("prime-subtitle-showOriginal") === "true",
    gemmaModel: localStorage.getItem("prime-subtitle-gemma-model") || "gemma4:e2b-it-qat",
    targetLanguage: "Telugu",
    video: null,
    settingsOpen: false,
    tracks: [], // subtitle track files captured by pagehook.js (prefetch probe)
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
    <div style="margin-bottom: 10px; font-size: 13px;">Style:</div>
    <div id="prime-subtitle-style-options" style="display: flex; gap: 8px; margin-bottom: 12px;">
      <button data-style="auto" style="flex: 1; padding: 7px 10px; border: 0; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;">Auto</button>
      <button data-style="formal" style="flex: 1; padding: 7px 10px; border: 0; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;">Formal</button>
      <button data-style="conversational" style="flex: 1; padding: 7px 10px; border: 0; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;">Casual</button>
    </div>
    <div style="margin-bottom: 10px; font-size: 13px;">Subtitle size: <span id="prime-subtitle-size-value"></span>px</div>
    <input id="prime-subtitle-size-slider" type="range" min="20" max="60" step="1" style="width: 100%;">
    <div style="display: flex; gap: 8px; margin-top: 12px;">
      <button id="prime-subtitle-enabled-toggle" style="flex: 1; padding: 7px 10px; border: 0; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;">Translator: on</button>
      <button id="prime-subtitle-show-original" style="flex: 1; padding: 7px 10px; border: 0; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;">Original: hidden</button>
    </div>
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
    ".player-timedtext,",
    ".atvwebplayersdk-caption {",
    "  opacity: 0 !important;",
    "}",
  ].join("\n");
  document.documentElement.appendChild(hideCss);

  // "Show original" keeps the source captions visible alongside the overlay
  // (dual-subtitle mode); turning the translator off restores them too.
  function applyHideState() {
    hideCss.disabled = !(state.enabled && !state.showOriginal && !musicMode());
    if (hideCss.disabled && state.hiddenNode) {
      state.hiddenNode.style.opacity = "";
      state.hiddenNode.style.textShadow = "";
      state.hiddenNode = null;
    }
  }
  applyHideState();

  function log(...args) {
    console.log("[Prime Subtitle Light]", ...args);
  }

  // Prefetch: pagehook.js (MAIN world) forwards subtitle-track responses it
  // spots in the player's own network traffic. Each capture is parsed into
  // timed cues; the first segment also triggers a full-file re-fetch (the
  // player pulls the track in Range windows, plain GET returns all of it).
  const cues = new Map(); // "begin|text" -> { begin, end, text }
  const fullFetchRequested = new Set();

  function parseClock(value, tickRate) {
    if (!value) return NaN;
    if (/t$/.test(value)) return parseFloat(value) / (tickRate || 10000000);
    if (/(ms|s)$/.test(value)) return /ms$/.test(value) ? parseFloat(value) / 1000 : parseFloat(value);
    const parts = value.split(":");
    if (parts.length === 3) return +parts[0] * 3600 + +parts[1] * 60 + parseFloat(parts[2]);
    return NaN;
  }

  function parseTtmlCues(body) {
    // fMP4 bodies hold one or more <tt> documents inside mdat boxes; a
    // plain-text track is a single document. The regex handles both.
    const docs = body.match(/<tt[\s>][\s\S]*?<\/tt>/g) || [];
    let added = 0;
    for (const docText of docs) {
      const doc = new DOMParser().parseFromString(docText, "text/xml");
      const tt = doc.documentElement;
      const tickRate = Number(tt.getAttribute("ttp:tickRate")) || 0;
      for (const p of doc.getElementsByTagName("p")) {
        const begin = parseClock(p.getAttribute("begin"), tickRate);
        const text = (p.textContent || "").replace(/\s+/g, " ").trim();
        if (!text || isNaN(begin)) continue;
        const key = `${begin}|${text}`;
        if (cues.has(key)) continue;
        cues.set(key, { begin, end: parseClock(p.getAttribute("end"), tickRate), text });
        added++;
      }
    }
    return added;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.source === "lst-track-candidate") return;
    if (event.data.source !== "lst-track") return;
    const { url, contentType, kind, body } = event.data;
    if (state.tracks.some((t) => t.url === url && t.size === body.length)) return;
    state.tracks.push({ url, contentType, kind, size: body.length, at: Date.now() });
    const added = parseTtmlCues(body);
    rebuildCueList();
    if (!trackKey) trackKey = trackStorageKey(url);
    if (added) loadSavedTranslations();
    const times = [...cues.values()].map((c) => c.begin);
    log(
      `track captured (#${state.tracks.length}, ${kind}, ${body.length} chars):`,
      `+${added} cues, total ${cues.size},`,
      times.length
        ? `coverage ${Math.min(...times).toFixed(1)}s – ${Math.max(...times).toFixed(1)}s`
        : "no cues"
    );
    if (kind === "ttml-mp4" && !fullFetchRequested.has(url)) {
      fullFetchRequested.add(url);
      log("requesting full track:", url);
      window.postMessage({ source: "lst-fetch-track", url }, "*");
    }
  });

  // Persist per-track translations so a reload or same-day rewatch skips the
  // model entirely. Keyed by URL path (the query carries expiring signature
  // params) + language + model; restored cues match on begin-time + source
  // text. Day-old tracks are pruned — beyond that, a re-run is cheap.
  let trackKey = "";
  let saveTimer = null;

  function trackStorageKey(url) {
    try {
      const u = new URL(url);
      return `lst-track:${u.origin}${u.pathname}:${state.targetLanguage}:${state.gemmaModel}`;
    } catch {
      return "";
    }
  }

  function loadSavedTranslations() {
    if (!trackKey || !chrome.storage) return;
    chrome.storage.local.get(trackKey, (items) => {
      const saved = items && items[trackKey];
      if (!saved || !Array.isArray(saved.entries)) return;
      let applied = 0;
      for (const [begin, text, out] of saved.entries) {
        const cue = cues.get(`${begin}|${text}`);
        if (cue && !cue.out) {
          cue.out = out;
          applied++;
        }
      }
      if (applied) log(`restored ${applied} saved translations`);
    });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!trackKey || !chrome.storage) return;
      const entries = cueList.filter((c) => c.out).map((c) => [c.begin, c.text, c.out]);
      chrome.storage.local.set({ [trackKey]: { savedAt: Date.now(), entries } });
    }, 3000);
  }

  if (chrome.storage) {
    chrome.storage.local.get(null, (items) => {
      const stale = Object.keys(items).filter(
        (k) =>
          k.startsWith("lst-track:") &&
          Date.now() - ((items[k] && items[k].savedAt) || 0) > 24 * 3600 * 1000
      );
      if (stale.length) chrome.storage.local.remove(stale);
    });
  }

  // ---- Prefetch playback: paint cues on the video clock, translate ahead ----
  // With the full track in hand, display needs no DOM timing at all: an
  // interval matches cues against video.currentTime (zero perceived lag) and
  // a sequential pump translates forward from the playhead, so seeks just
  // change where the pump resumes. Threshold 100 cues = clearly a full
  // track, not the player's small Range windows.
  let cueList = [];
  let prefetchOn = false;
  let pumpBusy = false;
  let pumpDone = 0;
  let lastCueKey = "";

  function rebuildCueList() {
    cueList = [...cues.values()].sort((a, b) => a.begin - b.begin);
    if (!prefetchOn && cueList.length >= 100) {
      prefetchOn = true;
      log(`prefetch mode ON: ${cueList.length} cues`);
    }
  }

  function cueEnd(cue) {
    return isNaN(cue.end) ? cue.begin + 6 : cue.end;
  }

  function activeCue(t) {
    let current = null;
    for (const cue of cueList) {
      if (cue.begin > t) break;
      if (t <= cueEnd(cue) + 0.3) current = cue;
    }
    return current;
  }

  setInterval(() => {
    if (!prefetchOn || !state.enabled || musicMode()) return;
    const video = activeVideo();
    if (!video) return;
    const cue = activeCue(video.currentTime);
    const key = cue ? `${cue.begin}|${cue.text}` : "";
    if (key !== lastCueKey) {
      lastCueKey = key;
      // Original English as the stopgap until the translation lands (cold
      // start or right after a seek); the pump normally stays ahead.
      show(cue ? cue.out || cue.text : "");
    } else if (cue && cue.out && box.textContent !== cue.out) {
      show(cue.out);
    }
    pumpPrefetch(video.currentTime);
  }, 200);

  // First untranslated cue from the playhead forward; if everything ahead is
  // done, wrap around to the stretch behind it so the whole episode finishes.
  function nextUntranslated(fromTime) {
    let wrapIdx = -1;
    for (let i = 0; i < cueList.length; i++) {
      const c = cueList[i];
      if (c.out || (c.tried || 0) >= 2) continue;
      if (!isTranslatableEnglish(c.text)) {
        c.out = c.text;
        continue;
      }
      if (cueEnd(c) >= fromTime - 1) return i;
      if (wrapIdx === -1) wrapIdx = i;
    }
    return wrapIdx;
  }

  function pumpPrefetch(t) {
    if (pumpBusy || document.hidden) return;
    const idx = nextUntranslated(t);
    if (idx === -1) return;
    const next = cueList[idx];
    pumpBusy = true;
    // The pump is sequential, so pointing the shared prompt context at this
    // cue's predecessors is safe (the live DOM path is off in prefetch mode).
    state.prevLines = cueList.slice(Math.max(0, idx - 2), idx).map((c) => c.text);
    const backend = state.translatorBackend === "libre" ? translateWithLibre : translateWithGemma;
    backend(next.text)
      .then((translated) => {
        next.out = translated || next.text;
        pumpDone++;
        if (pumpDone % 25 === 0) log(`prefetch translated ${pumpDone} cues`);
        scheduleSave();
      })
      .catch((error) => {
        next.tried = (next.tried || 0) + 1;
        log("prefetchError", String(error));
      })
      .then(() => {
        pumpBusy = false;
      });
  }

  // Anchor the overlay to the video's rectangle, not the viewport: in
  // windowed layouts a viewport-bottom overlay sits on the player controls.
  function positionOverlay() {
    const video = state.video || document.querySelector("video");
    const rect = video ? video.getBoundingClientRect() : null;
    if (!rect || !rect.height) {
      box.style.left = "50%";
      box.style.bottom = "7%";
      return;
    }
    box.style.left = `${rect.left + rect.width / 2}px`;
    // 7% of video height matches the original fullscreen position; the 64px
    // floor keeps the overlay above player controls in small windowed layouts.
    box.style.bottom = `${Math.max(0, window.innerHeight - rect.bottom) + Math.max(rect.height * 0.07, 64)}px`;
  }

  // A shown translation stays up at least this long before a NEW line may
  // replace it; re-paints of the same line (streaming, hybrid swap) pass.
  const MIN_DISPLAY_MS = 250;
  function schedulePaint(requestId, render) {
    if (requestId !== state.activeRequestId) return;
    const elapsed = Date.now() - state.lastPaintAt;
    if (state.paintedRequestId !== requestId && elapsed < MIN_DISPLAY_MS) {
      clearTimeout(state.minDisplayTimer);
      state.minDisplayTimer = setTimeout(() => schedulePaint(requestId, render), MIN_DISPLAY_MS - elapsed);
      return;
    }
    if (state.paintedRequestId !== requestId) {
      state.paintedRequestId = requestId;
      state.lastPaintAt = Date.now();
    }
    render();
  }

  function show(text) {
    if (!text) {
      box.style.display = "none";
      box.textContent = "";
      return;
    }
    positionOverlay();
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
    const styleButtons = settingsPanel.querySelectorAll("#prime-subtitle-style-options button");
    styleButtons.forEach((button) => {
      const active = button.dataset.style === state.styleProfile;
      button.style.background = active ? "rgba(24, 119, 242, 0.95)" : "rgba(255,255,255,0.16)";
      button.style.color = "#fff";
    });
    const enabledBtn = settingsPanel.querySelector("#prime-subtitle-enabled-toggle");
    if (enabledBtn) {
      enabledBtn.textContent = state.enabled ? "Translator: on" : "Translator: off";
      enabledBtn.style.background = state.enabled ? "rgba(24, 119, 242, 0.95)" : "rgba(255,255,255,0.16)";
      enabledBtn.style.color = "#fff";
    }
    const originalBtn = settingsPanel.querySelector("#prime-subtitle-show-original");
    if (originalBtn) {
      originalBtn.textContent = state.showOriginal ? "Original: shown" : "Original: hidden";
      originalBtn.style.background = state.showOriginal ? "rgba(24, 119, 242, 0.95)" : "rgba(255,255,255,0.16)";
      originalBtn.style.color = "#fff";
    }
  }

  function setEnabled(on) {
    state.enabled = !!on;
    saveSetting("enabled", state.enabled);
    applyHideState();
    updateBackendButtons();
    if (!state.enabled) {
      clearTimeout(state.stabilizeTimer);
      clearTimeout(state.clearTimer);
      clearWarm();
      state.rollingLines = [];
      state.rollingPending = "";
      state.lastText = "";
      state.lastTranslatedText = "";
      show("");
      statusBadge.textContent = "Translator: off";
      statusBadge.style.background = "rgba(0,0,0,0.72)";
      return;
    }
    pingTranslator();
    scheduleRead();
  }

  function setShowOriginal(on) {
    state.showOriginal = !!on;
    saveSetting("showOriginal", state.showOriginal);
    applyHideState();
    updateBackendButtons();
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
        ["translatorBackend", "gemmaModel", "targetLanguage", "subtitleSize", "enabled", "showOriginal", "styleProfile"],
        (saved) => {
          if (!saved) return;
          if (saved.translatorBackend) state.translatorBackend = saved.translatorBackend;
          if (saved.gemmaModel) state.gemmaModel = saved.gemmaModel;
          if (saved.targetLanguage) state.targetLanguage = saved.targetLanguage;
          if (saved.subtitleSize) applySubtitleSize(saved.subtitleSize);
          if (typeof saved.enabled === "boolean") state.enabled = saved.enabled;
          if (typeof saved.showOriginal === "boolean") state.showOriginal = saved.showOriginal;
          if (saved.styleProfile) state.styleProfile = saved.styleProfile;
          applyHideState();
          if (!state.enabled) {
            statusBadge.textContent = "Translator: off";
            statusBadge.style.background = "rgba(0,0,0,0.72)";
          }
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
      if (changes.enabled && changes.enabled.newValue !== state.enabled) {
        setEnabled(changes.enabled.newValue);
      }
      if (changes.showOriginal && changes.showOriginal.newValue !== state.showOriginal) {
        setShowOriginal(changes.showOriginal.newValue);
      }
      if (changes.styleProfile && changes.styleProfile.newValue !== state.styleProfile) {
        state.styleProfile = changes.styleProfile.newValue;
        applyHideState();
        updateBackendButtons();
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
    let cleaned = text.trim().replace(/^(here(?:'|’)s the translation:?|translation:?|subtitle:?)\s*/i, "");
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
    // Same line under different preceding context can translate differently
    // (pronouns, tense), so the context participates in the key.
    const context = state.prevLines.filter((l) => l !== normalized).join("\n");
    const cacheKey = `gemma:${state.gemmaModel}:${lang}:${effectiveStyle()}:${context.slice(-48)}:${normalized}`;
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
        // Short prompt: prompt tokens are prefill time before the first
        // streamed token; the "even if short" clause guards language drift.
        prompt: [
          `Translate the English subtitle into natural ${lang}. Reply with only the ${lang} translation of the subtitle, even if it is short or ambiguous.`,
          styleInstruction(lang),
          ...(state.glossaryNames.length
            ? [`Transliterate these names consistently: ${state.glossaryNames.join(", ")}.`]
            : []),
          ...(context ? [`Previous lines (context only, do not translate):\n${context}`] : []),
          "",
          `Subtitle: ${normalized}`,
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

  // Advisory only — never gates settings. The adapter signal (CC button
  // state) is exact; the generic fallback is patient (20s of playback with
  // no caption text) because silent stretches are normal.
  // OTT pages keep several <video> elements around (previews, idle players);
  // querySelector("video") can land on a paused dummy. Prefer the one playing.
  function activeVideo() {
    const vids = [...document.querySelectorAll("video")];
    return vids.find((v) => !v.paused && !v.ended && v.currentTime > 0) || vids[0] || null;
  }

  function updateCaptionHint() {
    const prevHint = state.captionHint;
    state.captionHint = "";
    if (!state.enabled) return;
    const video = activeVideo();
    const playing = video && !video.paused && !video.ended && video.currentTime > 0;
    if (!playing) {
      state.lastCaptionTextAt = Date.now();
      return;
    }
    if (musicMode()) {
      state.captionHint = "music — showing original lyrics";
      statusBadge.textContent = `Translator: ${state.captionHint}`;
      statusBadge.style.background = "rgba(60, 60, 120, 0.85)";
      return;
    }
    if (siteAdapter && siteAdapter.captionsDisabled && siteAdapter.captionsDisabled()) {
      state.captionHint = "turn on subtitles in the player";
      // Captions are explicitly off — no linger, exit now.
      if (state.rollingLines.length || box.textContent) {
        clearTimeout(state.clearTimer);
        state.rollingLines = [];
        state.rollingPending = "";
        clearWarm();
        show("");
      }
    } else if (Date.now() - state.lastCaptionTextAt > 20000) {
      state.captionHint = "no subtitles found — is CC on?";
    }
    if (state.captionHint) {
      statusBadge.textContent = `Translator: ${state.captionHint}`;
      statusBadge.style.background = "rgba(140, 100, 20, 0.85)";
    }
    if (state.captionHint !== prevHint) log("captionHint", state.captionHint || "(cleared)");
  }

  async function pingTranslator() {
    if (!state.enabled) {
      statusBadge.textContent = "Translator: off";
      statusBadge.style.background = "rgba(0,0,0,0.72)";
      return;
    }
    if (state.captionHint) return; // the hint owns the badge while active
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
      hosts: ["netflix.com"],
      roots: [".player-timedtext"],
    },
    {
      hosts: ["youtube.com"],
      roots: [".ytp-caption-window-container"],
      // Precise "subtitles are off" signal: YT's CC button exposes its state.
      captionsDisabled: () => {
        const btn = document.querySelector(".ytp-subtitles-button");
        return !!btn && btn.offsetParent !== null && btn.getAttribute("aria-pressed") !== "true";
      },
      // Auto-captions roll word-by-word; translate only once a line has
      // stopped changing for this long, or every word restarts the request.
      stabilizeMs: 250,
      // Mirror YouTube's own caption model: lines scroll up as they complete;
      // translate whole committed lines and let the previous one linger.
      rolling: true,
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
        (/caption|shaka-text|timedtext/i.test(el.className || "") ? 10 : 0) +
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
      !/caption|shaka-text|timedtext/i.test(best && best.className || "")
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

  // Auto-captions carry sound tags and verbal fillers that waste model
  // attention and pollute output; spoken-word artifacts, not dialogue.
  function cleanAutoCaption(text) {
    return text
      .replace(/\[[^\]]*\]/g, " ") // [Music], [Applause], [Laughter]
      .replace(/\b(um+|uh+|erm?)\b[,.]?/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // Glossary: recurring capitalized words are almost always names/terms.
  // Feeding them to Gemma keeps transliteration consistent across lines.
  const NAME_STOPWORDS = new Set([
    "The", "But", "And", "Yes", "Yeah", "Okay", "Now", "Then", "This", "That",
    "They", "What", "When", "Where", "Why", "How", "Not", "You", "Your", "Our",
    "His", "Her", "She", "Him", "For", "With", "From", "Just", "Like", "Right",
  ]);

  // Style profile: register consistency is the cheap quality win — one
  // steady prompt line beats the model guessing formality per line.
  const FORMAL_CATEGORIES = ["Education", "Science & Technology", "News & Politics"];

  function refreshCategory() {
    if (location.href === state.categoryHref) return;
    state.categoryHref = location.href;
    const meta = document.querySelector('meta[itemprop="genre"]');
    state.category = (meta && meta.content) || "";
  }

  function effectiveStyle() {
    if (state.styleProfile !== "auto") return state.styleProfile;
    return FORMAL_CATEGORIES.includes(state.category) ? "formal" : "conversational";
  }

  // Literal lyric translation is garbage; on music content show the
  // originals and stand down (auto mode only — overrides win).
  function musicMode() {
    return state.styleProfile === "auto" && state.category === "Music";
  }

  function styleInstruction(lang) {
    return effectiveStyle() === "formal"
      ? `Use formal ${lang} register; keep technical and business terms in English.`
      : `Use natural, conversational ${lang}.`;
  }

  function notePrev(src) {
    state.prevLines.push(src);
    if (state.prevLines.length > 2) state.prevLines.shift();
  }

  function noteNames(text) {
    const words = text.match(/\b[A-Z][a-z]{2,}\b/g) || [];
    for (const word of words) {
      if (NAME_STOPWORDS.has(word)) continue;
      const count = (state.nameCounts.get(word) || 0) + 1;
      state.nameCounts.set(word, count);
      if (count === 2) {
        state.glossaryNames.push(word);
        if (state.glossaryNames.length > 8) state.glossaryNames.shift();
      }
    }
  }

  // Guard against non-English input (e.g. the user left YouTube's own
  // auto-translate on): en->Telugu models turn it into gibberish. A real
  // English line is overwhelmingly Latin letters.
  function isTranslatableEnglish(text) {
    const letters = (text.match(/[\p{L}]/gu) || []).length;
    if (!letters) return false;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    return latin / letters > 0.5;
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

  // ---- Rolling-caption mode (YouTube-style) ----
  // YouTube shows a 2-line window: words append to the bottom line, and when
  // it fills, lines scroll up. A line that is no longer the last one is
  // final ("committed") — translate exactly those, never half-built lines.
  // The overlay mirrors the model: last two translated lines stacked, so the
  // previous line lingers for readability while the next is being translated.
  const ROLLING_HOLD_MS = 450; // commit the last line after this pause

  function readRolling(text) {
    if (!text) {
      // One-shot on the transition to empty: re-entering this branch while
      // the linger is pending must NOT re-arm the timer (the 1.5s refresh
      // interval would otherwise reset it forever).
      if (!state.rollingEmptySince && (state.rollingPending || state.rollingLines.length)) {
        state.rollingEmptySince = Date.now();
        state.rollingPending = "";
        clearWarm();
        clearTimeout(state.stabilizeTimer);
        const lingerMs = Math.min(5000, Math.max(2000, (box.textContent || "").length * 90));
        clearTimeout(state.clearTimer);
        state.clearTimer = setTimeout(() => {
          state.rollingLines = [];
          state.prevLines = []; // scene break — stale context misleads more than it helps
          show("");
        }, lingerMs);
      }
      return;
    }
    state.rollingEmptySince = 0;
    clearTimeout(state.clearTimer);
    if (document.hidden) {
      show("");
      return;
    }
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    // Every line above the last has scrolled up: it is final.
    for (const line of lines.slice(0, -1)) commitLine(line);
    // The last line is still growing; commit it only after a real pause
    // (end of a sentence or the speaker stopping), else wait for the scroll.
    const last = lines[lines.length - 1];
    if (last !== state.rollingPending) {
      // A ">>" speaker-change marker opening a new line means the previous
      // speaker's line is definitively done — commit it without the hold.
      if (/^>{2,}/.test(last) && state.rollingPending && !last.startsWith(state.rollingPending)) {
        commitLine(state.rollingPending);
      }
      state.rollingPending = last;
      clearTimeout(state.stabilizeTimer);
      state.stabilizeTimer = setTimeout(() => commitLine(last), ROLLING_HOLD_MS);
      scheduleWarm(last);
    }
  }

  // Warm-ahead: on a fixed beat, speculatively translate the still-growing
  // line with the selected backend, keyed by exact text. A pause-commit's
  // text is by definition unchanged for ROLLING_HOLD_MS, so its warm request
  // is already in flight (or done) when the commit lands — the inference
  // time overlaps the wait instead of following it.
  const WARM_EVERY_MS = 600;

  function scheduleWarm(rawLast) {
    // Same cleaning as commitLine, so the warm key matches the commit key.
    const src = cleanAutoCaption((rawLast || "").replace(/^>{2,}\s*/, "").trim());
    if (musicMode() || !src || isNoise(src) || !isTranslatableEnglish(src)) return;
    state.warmNextSrc = src;
    if (state.warmTimer) return;
    state.warmTimer = setTimeout(fireWarm, WARM_EVERY_MS);
  }

  function fireWarm() {
    state.warmTimer = null;
    const src = state.warmNextSrc;
    // One speculative request at a time: a slow model (e4b ~3-4s/line) must
    // not stack a queue of stale speculations ahead of real commits.
    if (!src || state.warm.has(src) || state.warmInFlight) return;
    state.warmInFlight = true;
    const backend = state.translatorBackend === "libre" ? translateWithLibre : translateWithGemma;
    const job = backend(src).catch(() => "");
    job.then(() => {
      state.warmInFlight = false;
    });
    state.warm.set(src, job);
    if (state.warm.size > 6) state.warm.delete(state.warm.keys().next().value);
  }

  function pickWarm(src) {
    const p = state.warm.get(src);
    if (p) state.warm.delete(src);
    return p || null;
  }

  function clearWarm() {
    state.warmNextSrc = "";
    clearTimeout(state.warmTimer);
    state.warmTimer = null;
    state.warmInFlight = false;
  }

  function commitLine(rawSrc) {
    // Strip broadcast-style speaker markers (">>", ">>>"); they confuse the
    // translation models and carry no meaning for the viewer.
    const src = cleanAutoCaption((rawSrc || "").replace(/^>{2,}\s*/, "").trim());
    if (musicMode() || !src || isNoise(src) || !isTranslatableEnglish(src)) return;
    if (state.recentCommitted.includes(src)) return;
    state.recentCommitted.push(src);
    if (state.recentCommitted.length > 8) state.recentCommitted.shift();
    if (rawSrc === state.rollingPending) {
      state.rollingPending = "";
      clearTimeout(state.stabilizeTimer);
    }
    // A pause mid-sentence commits a prefix; when the completed line arrives
    // (via scroll), extend that entry in place — never show fragment + full
    // line as two near-identical neighbors.
    const prior = state.rollingLines[state.rollingLines.length - 1];
    const extending = prior && src.startsWith(prior.src) && src !== prior.src;
    const entry = extending ? prior : { src, out: null };
    const priorSrc = extending ? prior.src : "";
    if (extending) {
      entry.src = src;
    } else {
      state.rollingLines.push(entry);
      if (state.rollingLines.length > 3) state.rollingLines.shift();
    }
    log("commit", src);
    noteNames(src);
    translateLine(src, (translated) => {
      entry.out = translated || entry.out || src;
      renderRolling();
    });
    // After dispatch, so the request's context holds the lines before this one.
    if (extending) {
      if (state.prevLines[state.prevLines.length - 1] === priorSrc) {
        state.prevLines[state.prevLines.length - 1] = src;
      }
    } else {
      notePrev(src);
    }
  }

  // The box is bottom-anchored, so a new line growing in at the bottom
  // pushes the previous line up — same motion as YouTube's caption window.
  const ROLL_MS = 300;

  function renderRolling() {
    const entries = state.rollingLines.filter((e) => e.out);
    if (!entries.length) return;
    positionOverlay();
    box.style.display = "block";
    entries.forEach((entry, i) => {
      if (entry.el) {
        // Hybrid swap: update text in place, no motion.
        if (entry.el.textContent !== entry.out) {
          entry.el.textContent = entry.out;
          entry.el.style.maxHeight = `${entry.el.scrollHeight}px`;
        }
        return;
      }
      const el = document.createElement("div");
      entry.el = el;
      el.textContent = entry.out;
      el.style.cssText = [
        "overflow: hidden",
        "max-height: 0",
        "opacity: 0",
        `transition: max-height ${ROLL_MS}ms ease, opacity ${ROLL_MS}ms ease`,
      ].join(";");
      // Translations can resolve out of order; keep the spoken order.
      const next = entries.slice(i + 1).find((e) => e.el);
      box.insertBefore(el, next ? next.el : null);
      requestAnimationFrame(() => {
        el.style.maxHeight = `${el.scrollHeight}px`;
        el.style.opacity = "1";
      });
    });
    // Roll the oldest line out once more than two are showing.
    const active = [...box.children].filter((el) => !el.dataset.rollingOut);
    active.slice(0, -2).forEach((el) => {
      el.dataset.rollingOut = "1";
      el.style.maxHeight = "0px";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), ROLL_MS + 50);
    });
  }

  // Committed lines accumulate instead of replacing each other, so no
  // schedulePaint gate and no per-token streaming — whole lines only.
  function translateLine(src, onResult) {
    const warm = pickWarm(src); // adopt the in-flight warm-ahead request if any
    if (state.translatorBackend === "hybrid") {
      let gemmaDone = false;
      translateWithLibre(src)
        .then((translated) => {
          if (!gemmaDone) onResult(translated);
        })
        .catch(() => {});
      (warm || translateWithGemma(src))
        .then((translated) => {
          gemmaDone = true;
          if (translated) onResult(translated);
        })
        .catch((error) => log("translationError", String(error)));
    } else {
      const fresh = () =>
        state.translatorBackend === "gemma" ? translateWithGemma(src) : translateWithLibre(src);
      (warm || fresh())
        .then(onResult)
        .catch((error) => {
          onResult("");
          log("translationError", String(error));
        });
    }
  }

  function read() {
    if (!state.enabled) return;
    const text = extractText(state.subtitleRoot);
    if (text) state.lastCaptionTextAt = Date.now();
    // Prefetch mode paints from the cue clock; the DOM path's only remaining
    // job is hiding the player's own captions as they appear.
    if (prefetchOn) {
      if (text && !state.showOriginal) {
        const node =
          findSmallestMatchingDescendant(state.subtitleRoot, text) ||
          findSubtitleNode(state.subtitleRoot, text);
        const container =
          node && node.closest('.shaka-text-container, [class*="caption" i]');
        if (container) hideNode(container);
      }
      return;
    }
    if (siteAdapter && siteAdapter.rolling) {
      readRolling(text);
      return;
    }
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
      const stabilizeMs = siteAdapter && siteAdapter.stabilizeMs;
      if (stabilizeMs) {
        clearTimeout(state.stabilizeTimer);
        maybeSpeculate(text);
        state.stabilizeTimer = setTimeout(() => startTranslation(text), stabilizeMs);
        return;
      }
      startTranslation(text);
    }
  }

  // Rolling captions + Gemma: send the line to Gemma immediately, in parallel
  // with the stabilize window. Most lines settle unchanged (the sentence simply
  // ended), so the adopted request has a stabilizeMs head start. A line that
  // changes mid-flight is never painted; its result still warms the cache.
  // At most one speculative request runs (OLLAMA_NUM_PARALLEL=2: one slot for
  // this, one for the active request).
  function maybeSpeculate(text) {
    if (state.translatorBackend !== "gemma") return;
    if (state.spec) return;
    const spec = { text, paint: null };
    spec.promise = translateWithGemma(text, (partial) => {
      if (spec.paint) spec.paint(partial);
    });
    spec.promise
      .catch(() => {})
      .then(() => {
        if (state.spec === spec) state.spec = null;
      });
    state.spec = spec;
  }

  function startTranslation(text) {
    {
      if (musicMode() || !isTranslatableEnglish(text)) return;
      log("subtitle", text);
      noteNames(text);
      const requestId = ++state.activeRequestId;
      // Keep the previous translation visible while the next one is pending
      // on rolling-caption sites; only show the pending marker from cold.
      if (!state.lastTranslatedText) show("…");
      const applyTranslation = (translated) => {
        schedulePaint(requestId, () => {
          const output = translated || text;
          state.lastTranslatedText = output;
          show(output);
          log("translation", output);
        });
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
          schedulePaint(requestId, () => show(partial));
        };
        // Adopt the speculative request if it was for this exact line;
        // freeing state.spec lets the next line speculate right away.
        let pending;
        if (state.spec && state.spec.text === text) {
          const spec = state.spec;
          state.spec = null;
          spec.paint = onPartial;
          pending = spec.promise;
        } else {
          pending = translateWithGemma(text, onPartial);
        }
        pending
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
      notePrev(text); // after dispatch: the request reads the lines before this one
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
        if (captionContainer && !state.showOriginal) {
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

  const styleOptionButtons = settingsPanel.querySelectorAll("#prime-subtitle-style-options button");
  styleOptionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.styleProfile = button.dataset.style;
      saveSetting("styleProfile", state.styleProfile);
      applyHideState(); // override may enter/exit music mode
      updateBackendButtons();
      scheduleRead();
    });
  });

  const enabledToggle = settingsPanel.querySelector("#prime-subtitle-enabled-toggle");
  if (enabledToggle) enabledToggle.addEventListener("click", () => setEnabled(!state.enabled));
  const showOriginalToggle = settingsPanel.querySelector("#prime-subtitle-show-original");
  if (showOriginalToggle) showOriginalToggle.addEventListener("click", () => setShowOriginal(!state.showOriginal));

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
      state.prevLines = []; // a seek breaks dialogue continuity
      if (siteAdapter && siteAdapter.rolling) {
        state.rollingLines = [];
        state.rollingPending = "";
        clearWarm();
        show("");
        return;
      }
      if (!state.lastText) show("");
    });
  }

  loadSettings();
  watchVideoSeeks();
  setInterval(() => {
    watchVideoSeeks();
    positionOverlay();
    const wasMusic = musicMode();
    refreshCategory();
    if (musicMode() !== wasMusic) applyHideState();
    updateCaptionHint();
    // Always re-evaluate the root, not just when it left the DOM: the initial
    // pick can land on a lookalike (e.g. Hotstar's subtitle button icon) that
    // never gets removed, and the real caption container appears later.
    // pickRoot's stickiness prevents flapping between equivalent roots.
    refresh();
  }, 1500);
})();
