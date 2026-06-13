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
    ".vjs-text-track-display,",
    ".text-track-wrapper,",
    ".atvwebplayersdk-captions-text,",
    ".ytp-caption-window-container,",
    ".player-timedtext,",
    ".atvwebplayersdk-caption {",
    "  opacity: 0 !important;",
    "}",
    // Browser-rendered native cues (hls.js sites: track mode "showing", no
    // caption DOM at all) — only the ::cue pseudo-element can hide those.
    "video::cue {",
    "  visibility: hidden !important;",
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

  // <br/> inside a cue separates speaker turns — flattening them into one
  // line loses who-said-what. Preserved as "\n" through translation/render.
  function cueText(p) {
    let out = "";
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) out += child.nodeValue;
        else if (child.nodeName.toLowerCase().endsWith("br")) out += "\n";
        else walk(child);
      }
    };
    walk(p);
    return out
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
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
        const text = cueText(p);
        if (!text || isNaN(begin)) continue;
        const key = `${begin}|${text}`;
        if (cues.has(key)) continue;
        cues.set(key, { begin, end: parseClock(p.getAttribute("end"), tickRate), text });
        added++;
      }
    }
    return added;
  }

  // YouTube timedtext json3: events carry tStartMs/dDurationMs and segs
  // (word-level for auto-captions; aAppend events are rolling continuations
  // of the previous line, not new cues).
  function parseYtJsonCues(body) {
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return 0;
    }
    if (!Array.isArray(data.events)) return 0;
    let added = 0;
    for (const ev of data.events) {
      if (!Array.isArray(ev.segs) || ev.aAppend || typeof ev.tStartMs !== "number") continue;
      // ASR cues carry stutters and [Music]-style tags — same cleanup the
      // live path applies.
      const text = cleanAutoCaption(
        ev.segs.map((s) => s.utf8 || "").join("").replace(/\s+/g, " ").trim()
      );
      if (!text) continue;
      const begin = ev.tStartMs / 1000;
      const end = ev.dDurationMs ? (ev.tStartMs + ev.dDurationMs) / 1000 : NaN;
      const key = `${begin}|${text}`;
      if (!cues.has(key)) {
        cues.set(key, { begin, end, text });
        added++;
      }
    }
    return added;
  }

  // YouTube legacy XML: <text start="1.2" dur="3.4">line</text>
  function parseTimedtextCues(body) {
    const doc = new DOMParser().parseFromString(body, "text/xml");
    let added = 0;
    for (const node of doc.getElementsByTagName("text")) {
      const begin = parseFloat(node.getAttribute("start"));
      const dur = parseFloat(node.getAttribute("dur"));
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || isNaN(begin)) continue;
      const key = `${begin}|${text}`;
      if (!cues.has(key)) {
        cues.set(key, { begin, end: isNaN(dur) ? NaN : begin + dur, text });
        added++;
      }
    }
    return added;
  }

  // WebVTT (Shaka/HLS players, often as many small segment files — cues
  // accumulate across captures). Constant timestamp offsets from HLS
  // timestamp maps are absorbed by the DOM calibration like any other.
  // VTT text carries HTML entities (&nbsp; &amp; …) — decode via a detached
  // textarea so they never reach the model or the overlay verbatim.
  const entityDecoder = document.createElement("textarea");
  function decodeEntities(text) {
    if (text.indexOf("&") === -1) return text;
    entityDecoder.innerHTML = text;
    return entityDecoder.value;
  }

  function parseVttClock(value) {
    const m = (value || "").trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
    if (!m) return NaN;
    return (m[1] ? +m[1] : 0) * 3600 + +m[2] * 60 + parseFloat(m[3]);
  }

  function parseVttCues(body) {
    let added = 0;
    for (const block of body.replace(/\r/g, "").split(/\n\n+/)) {
      const lines = block.split("\n");
      const timeIdx = lines.findIndex((l) => l.includes("-->"));
      if (timeIdx === -1) continue;
      const [rawBegin, rawEnd] = lines[timeIdx].split("-->");
      const begin = parseVttClock(rawBegin);
      const end = parseVttClock((rawEnd || "").trim().split(/\s+/)[0]);
      const text = lines
        .slice(timeIdx + 1)
        .map((l) =>
          decodeEntities(l.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
        )
        .filter(Boolean)
        .join("\n");
      if (!text || isNaN(begin)) continue;
      const key = `${begin}|${text}`;
      if (!cues.has(key)) {
        cues.set(key, { begin, end, text });
        added++;
      }
    }
    return added;
  }

  // ---- Native TextTrack harvest ----
  // Some players (SonyLIV) attach the full subtitle file to the <video> as a
  // hidden native TextTrack: every cue, already parsed, on the video's own
  // timeline — a prefetch source that needs no network interception. Only
  // enabled tracks ("hidden"/"showing") carry cues, so the player's own
  // selection picks the language for us. Harvest is incremental: some
  // players append cues as segments load.
  let nativeHarvestGen = 0;
  const nativeHarvested = new WeakMap(); // TextTrack -> { gen, count }
  let nativeClock = false;

  function harvestNativeTracks() {
    const video = activeVideo();
    if (!video || !video.textTracks) return;
    for (const track of video.textTracks) {
      if (track.kind !== "subtitles" && track.kind !== "captions") continue;
      if (track.mode === "disabled" || !track.cues || !track.cues.length) continue;
      const seen = nativeHarvested.get(track);
      if (seen && seen.gen === nativeHarvestGen && seen.count === track.cues.length) continue;
      nativeHarvested.set(track, { gen: nativeHarvestGen, count: track.cues.length });
      let added = 0;
      for (const c of track.cues) {
        const text = String(c.text || "")
          .split("\n")
          .map((l) => decodeEntities(l.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join("\n");
        if (!text) continue;
        const key = `${c.startTime}|${text}`;
        if (cues.has(key)) continue;
        cues.set(key, { begin: c.startTime, end: c.endTime, text });
        added++;
      }
      if (!added) continue;
      // Native cue times share the video element's clock — no calibration.
      nativeClock = true;
      rebuildCueList();
      // Trusted clock + ground-truth cues: schedule off them right away.
      // Progressive native tracks (hls.js) may never reach the 100-cue gate
      // ahead of the buffer, and browser-rendered cues have no DOM for the
      // live path to read anyway.
      if (cues.size >= 10) enablePrefetch("native track");
      // Synthetic per-episode URL so persistence keying works unchanged.
      const url = `https://native-texttrack.local${location.pathname}`;
      if (!state.tracks.some((t) => t.url === url)) {
        state.tracks.push({ url, contentType: "", kind: "native", size: track.cues.length, at: Date.now() });
      }
      if (!trackKey) trackKey = trackStorageKey(url);
      loadSavedTranslations();
      if (prefetchOn && lexiconState === "idle") buildLexicon();
      log(
        `native textTrack harvested (${track.label || track.language || track.kind}):`,
        `+${added} cues, total ${cues.size}`
      );
    }
  }

  // ---- Channel probe ----
  // A page can carry subtitles through four channels: native TextTracks,
  // rendered DOM, network track files, or burned into pixels (unreadable).
  // Log an inventory of the first three so every field test reports what a
  // site offers — not just what broke. See ASSUMPTIONS.md. Re-logs only on
  // change; stops once the verdict has been stable for a while.
  let lastProbeReport = "";
  let probeStableTicks = 0;

  function probeChannels() {
    if (probeStableTicks >= 8) return; // verdict settled — stop logging
    const video = activeVideo();
    const native = [];
    if (video && video.textTracks) {
      for (const t of video.textTracks) {
        native.push(
          `${t.kind}/${t.label || t.language || "?"}:${t.mode}` +
            (t.cues ? `:${t.cues.length}cues` : "")
        );
      }
    }
    const root = state.subtitleRoot;
    const rootClass = root
      ? String(root.className || root.id || root.tagName).trim().slice(0, 60)
      : "";
    const rootText = root ? (root.innerText || "").trim() : "";
    const netKinds = [...new Set(state.tracks.map((t) => t.kind))].join(",");
    const verdict = prefetchOn
      ? "prefetch tier"
      : cueList.length
        ? `track held (${cueList.length} cues) but prefetch off — segmented delivery?`
        : rootText
          ? "live path (DOM only)"
          : native.length
            ? "native tracks present, none enabled/populated"
            : video
              ? "no channel found — CC off, or burned-in subtitles?"
              : "no video yet";
    const langNote =
      rootText && !isTranslatableEnglish(rootText)
        ? " | WARNING: root text not Latin — non-English source? pipeline assumes English"
        : "";
    const report =
      `native[${native.join(" ") || "none"}]` +
      ` dom[${rootClass || "none"}]` +
      ` net[${netKinds || "none"}]` +
      ` → ${verdict}${langNote}`;
    if (report === lastProbeReport) {
      probeStableTicks++;
      return;
    }
    lastProbeReport = report;
    probeStableTicks = 0;
    log("channel probe:", report);
  }

  function parseTrack(body, kind) {
    if (kind === "yt-json") return parseYtJsonCues(body);
    if (kind === "timedtext-xml") return parseTimedtextCues(body);
    if (kind === "vtt") return parseVttCues(body);
    return parseTtmlCues(body);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.source === "lst-track-candidate") return;
    if (event.data.source !== "lst-track") return;
    const { url, contentType, kind, body } = event.data;
    if (typeof body !== "string" || !url) return; // foreign window message
    if (state.tracks.some((t) => t.url === url && t.size === body.length)) return;
    state.tracks.push({ url, contentType, kind, size: body.length, at: Date.now() });
    const added = parseTrack(body, kind);
    rebuildCueList();
    if (!trackKey) trackKey = trackStorageKey(url);
    if (added) loadSavedTranslations();
    // timedtext responses are complete files — no 100-cue threshold needed
    // (short videos have few cues), just enough to be a real track.
    if ((kind === "yt-json" || kind === "timedtext-xml") && cues.size >= 10) {
      enablePrefetch(kind);
    }
    if (prefetchOn && lexiconState === "idle") buildLexicon();
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
    try {
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
    } catch {
      // extension reloaded out from under us — orphaned script, no storage
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!trackKey || !chrome.storage) return;
      const entries = cueList.filter((c) => c.out).map((c) => [c.begin, c.text, c.out]);
      try {
        chrome.storage.local.set({ [trackKey]: { savedAt: Date.now(), entries } });
      } catch {
        // extension reloaded out from under us — translations stay in memory
      }
    }, 3000);
  }

  try {
    chrome.storage.local.get(null, (items) => {
      const stale = Object.keys(items).filter(
        (k) =>
          k.startsWith("lst-track:") &&
          Date.now() - ((items[k] && items[k].savedAt) || 0) > 24 * 3600 * 1000
      );
      if (stale.length) chrome.storage.local.remove(stale);
    });
  } catch {
    // extension reloaded out from under us
  }

  // ---- Episode lexicon: one pre-pass call when the full track lands ----
  // Holding the whole script lets the model make episode-level judgments
  // once instead of guessing per line: which English terms stay English in
  // the target language (code-mixing), and one committed transliteration
  // per recurring name so every cue prompt carries the same spellings.
  let lexicon = null; // { keepEnglish: [...], names: { src: target } }
  let lexiconStamp = 0; // participates in the gemma cache key
  let lexiconState = "idle"; // idle | pending | done

  async function gemmaOnce(prompt, numPredict) {
    const response = await bgFetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: state.gemmaModel,
        think: false,
        prompt,
        stream: false,
        keep_alive: "30m",
        options: { temperature: 0, num_predict: numPredict },
      }),
    });
    if (!response.ok) throw new Error(`ollama ${response.status}`);
    const data = JSON.parse(response.body);
    return (data && data.response) || "";
  }

  function candidateNames() {
    const counts = new Map();
    for (const cue of cueList) {
      for (const match of cue.text.matchAll(/\b([A-Z][a-z]{2,}|[A-Z]{2,5})\b/g)) {
        const word = match[1];
        if (NAME_STOPWORDS.has(word)) continue;
        counts.set(word, (counts.get(word) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([w]) => w);
  }

  function adoptLexicon(value, origin) {
    lexicon = {
      keepEnglish: Array.isArray(value.keepEnglish) ? value.keepEnglish.slice(0, 16) : [],
      names: value.names && typeof value.names === "object" ? value.names : {},
    };
    lexiconStamp++;
    log(
      `lexicon ${origin}: keep-English [${lexicon.keepEnglish.join(", ")}],`,
      `names ${Object.entries(lexicon.names).map(([k, v]) => `${k}=${v}`).join(", ") || "(none)"}`
    );
  }

  function buildLexicon() {
    if (lexiconState !== "idle") return;
    if (state.translatorBackend === "libre") {
      lexiconState = "done"; // libre takes no prompts — nothing to inject
      return;
    }
    lexiconState = "pending";
    const lexKey = trackKey ? `${trackKey}:lex` : "";
    const generate = () => {
      const lines = cueList
        .map((c) => c.text.replace(/\n/g, " "))
        .filter((t) => isTranslatableEnglish(t));
      const step = Math.max(1, Math.floor(lines.length / 60));
      const sample = lines.filter((_, i) => i % step === 0).slice(0, 60);
      const names = candidateNames();
      const prompt = [
        `You are preparing to subtitle a show into ${state.targetLanguage}. ${state.targetLanguage} subtitles keep certain English terms untranslated (institutions, acronyms, exams, technical and modern terms).`,
        `From the sample lines and candidate names below, reply with ONLY JSON in this exact shape, no commentary:`,
        `{"keepEnglish": ["term", ...], "names": {"CandidateName": "${state.targetLanguage} transliteration", ...}}`,
        names.length ? `Candidate names: ${names.join(", ")}` : "",
        "Sample lines:",
        ...sample,
      ].filter(Boolean).join("\n");
      gemmaOnce(prompt, 512)
        .then((raw) => {
          const jsonText = raw.replace(/^[\s\S]*?{/, "{").replace(/}[^}]*$/, "}");
          adoptLexicon(JSON.parse(jsonText), "built");
          if (lexKey) {
            try {
              chrome.storage.local.set({ [lexKey]: { savedAt: Date.now(), ...lexicon } });
            } catch {
              // extension reloaded out from under us
            }
          }
        })
        .catch((error) => log("lexiconError", String(error)))
        .then(() => {
          lexiconState = "done"; // failed pre-pass must not hold the pump
        });
    };
    if (!lexKey) {
      generate();
      return;
    }
    try {
      chrome.storage.local.get(lexKey, (items) => {
        const saved = items && items[lexKey];
        if (saved) {
          adoptLexicon(saved, "restored");
          lexiconState = "done";
        } else {
          generate();
        }
      });
    } catch {
      generate();
    }
  }

  // ---- Prefetch playback: paint cues on the video clock, translate ahead ----
  // With the full track in hand, display needs no DOM timing at all: an
  // interval matches cues against video.currentTime (zero perceived lag) and
  // a sequential pump translates forward from the playhead, so seeks just
  // change where the pump resumes. Threshold 100 cues = clearly a full
  // track, not the player's small Range windows.
  let cueList = [];
  let prefetchOn = false;
  let pumpDone = 0;
  let lastCueKey = "~init"; // not "" so the first tick always paints/clears

  // Cue timestamps live on the track's media timeline, which can sit at a
  // fixed offset from video.currentTime (DASH period anchoring). Calibrate
  // by matching the player's own DOM caption text to a cue and comparing
  // clocks; until the first sample lands, the live DOM path keeps driving.
  let syncOffset = 0;
  let syncSamples = [];
  let everCalibrated = false; // distinguishes CC-off cold start from post-jump gaps

  let lastCalibText = "";

  function calibrateSync(text) {
    const video = activeVideo();
    if (!video || !video.currentTime) return;
    const normalized = text.replace(/\s+/g, " ").trim();
    // Sample each caption once, at first sighting: that instant corresponds
    // to cue.begin. Re-sampling while it lingers biases the offset negative.
    if (normalized === lastCalibText) return;
    lastCalibText = normalized;
    if (normalized.length < 12) return; // short lines repeat — unsafe anchors
    let best = null;
    for (const cue of cueList) {
      if (cue.text.replace(/\n/g, " ") !== normalized) continue;
      if (!best || Math.abs(cue.begin - video.currentTime) < Math.abs(best.begin - video.currentTime)) {
        best = cue;
      }
    }
    if (!best) return;
    const sample = best.begin - video.currentTime;
    if (Math.abs(sample) > 120) return; // repeated line far away — ambiguous
    syncSamples.push(sample);
    everCalibrated = true;
    if (syncSamples.length > 5) syncSamples.shift();
    const sorted = [...syncSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (Math.abs(median - syncOffset) > 0.25) {
      syncOffset = median;
      log(`cue clock offset: ${syncOffset.toFixed(2)}s`);
    }
  }

  function enablePrefetch(why) {
    if (prefetchOn) return;
    prefetchOn = true;
    log(`prefetch mode ON: ${cueList.length} cues (${why})`);
  }

  function rebuildCueList() {
    cueList = [...cues.values()].sort((a, b) => a.begin - b.begin);
    if (cueList.length >= 100) enablePrefetch("full track");
  }

  // The cue clock is usable once calibrated against the player's captions,
  // or immediately on sites whose track timestamps share the video timeline.
  function cueClockUsable() {
    return nativeClock || syncSamples.length > 0 || !!(siteAdapter && siteAdapter.trustCueClock);
  }

  function adPlaying() {
    return !!(siteAdapter && siteAdapter.adActive && siteAdapter.adActive());
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

  // Settings that change translation output (backend, model, language,
  // style) invalidate already-translated cues — without this the pump's
  // earlier output keeps painting in the old language/model. Re-keys the
  // disk cache too, so a previously saved run under the new settings restores.
  function flushCueTranslations() {
    if (!cueList.length && !trackKey) return;
    for (const c of cueList) {
      c.out = null;
      c.tried = 0;
    }
    pumpDone = 0;
    lastCueKey = "~init";
    trackKey = state.tracks.length ? trackStorageKey(state.tracks[0].url) : "";
    loadSavedTranslations();
    // Lexicon depends on language/model — rebuild under the new settings
    // (the per-track save key follows trackKey, so a saved one restores).
    lexicon = null;
    lexiconState = "idle";
    if (prefetchOn) buildLexicon();
    log("cue translations flushed (settings change)");
  }

  // Prime is an SPA: title changes (and next-episode autoplay) swap content
  // without a page load, so per-episode prefetch state must be torn down or
  // the old show's cues keep painting over the new one.
  let prefetchHref = location.href;

  function resetPrefetch(reason) {
    prefetchHref = location.href;
    if (!cueList.length && !state.tracks.length) return;
    cues.clear();
    cueList = [];
    state.tracks = [];
    fullFetchRequested.clear();
    prefetchOn = false;
    pumpDone = 0;
    trackKey = "";
    nativeHarvestGen++;
    nativeClock = false;
    lastProbeReport = "";
    probeStableTicks = 0;
    syncOffset = 0;
    syncSamples = [];
    everCalibrated = false;
    lastCueKey = "~init";
    lexicon = null;
    lexiconState = "idle";
    show("");
    log("prefetch reset:", reason);
  }

  // Seeks, ad breaks, and source swaps jump video.currentTime against the
  // track clock; a stale offset then paints lines seconds off. Compare
  // playback advance to wall clock per tick and re-calibrate on any jump.
  let lastTickTime = 0;
  let lastTickAt = 0;

  setInterval(() => {
    if (location.href !== prefetchHref) resetPrefetch("navigation");
    if (!prefetchOn || !state.enabled || musicMode()) return;
    const video = activeVideo();
    if (!video) return;
    const now = Date.now();
    if (lastTickAt && syncSamples.length && !video.paused) {
      const advanced = video.currentTime - lastTickTime;
      const elapsed = (now - lastTickAt) / 1000;
      if (Math.abs(advanced - elapsed) > 2) {
        syncSamples = [];
        lastCueKey = "~init";
        show("");
        log("timeline jump — recalibrating cue clock");
      }
    }
    lastTickTime = video.currentTime;
    lastTickAt = now;
    if (adPlaying()) {
      // Same <video>, ad's own currentTime — episode cues must not paint.
      if (lastCueKey) {
        lastCueKey = "";
        show("");
      }
      return;
    }
    if (!cueClockUsable()) {
      pumpPrefetch(video.currentTime + syncOffset);
      return; // display stays with the live path until calibrated
    }
    const cue = activeCue(video.currentTime + syncOffset);
    const key = cue ? `${cue.begin}|${cue.text}` : "";
    if (key !== lastCueKey) {
      lastCueKey = key;
      // Original English as the stopgap until the translation lands (cold
      // start or right after a seek); the pump normally stays ahead.
      show(cue ? cue.out || cue.text : "");
    } else if (cue && cue.out && box.textContent !== cue.out) {
      show(cue.out);
    }
    pumpPrefetch(video.currentTime + syncOffset);
  }, 200);

  // First untranslated cue from the playhead forward; if everything ahead is
  // done, wrap around to the stretch behind it so the whole episode finishes.
  function nextUntranslated(fromTime) {
    let wrapIdx = -1;
    for (let i = 0; i < cueList.length; i++) {
      const c = cueList[i];
      if (c.out || c.inFlight || (c.tried || 0) >= 2) continue;
      if (!isTranslatableEnglish(c.text)) {
        c.out = c.text;
        continue;
      }
      if (cueEnd(c) >= fromTime - 1) return i;
      if (wrapIdx === -1) wrapIdx = i;
    }
    return wrapIdx;
  }

  // Two requests in flight: the live path is idle in prefetch mode, so its
  // Ollama slot (OLLAMA_NUM_PARALLEL=2) is free — halves full-track time
  // and post-seek catch-up.
  const PUMP_CONCURRENCY = 2;
  let pumpActive = 0;

  function pumpPrefetch(t) {
    // Focused window only: two visible windows would otherwise run two
    // pumps (4 requests vs OLLAMA_NUM_PARALLEL=2), flooding the queue and
    // pegging the GPU on both episodes at once. Display keeps painting
    // already-translated cues; the pump resumes on focus.
    if (document.hidden || !document.hasFocus()) return;
    if (lexiconState === "pending") return; // one pre-pass call, then flow
    while (pumpActive < PUMP_CONCURRENCY) {
      const idx = nextUntranslated(t);
      if (idx === -1) return;
      const next = cueList[idx];
      next.inFlight = true;
      pumpActive++;
      // prevLines is read synchronously when the prompt is built, so setting
      // it just before each dispatch is safe even with two in flight.
      state.prevLines = cueList.slice(Math.max(0, idx - 2), idx).map((c) => c.text);
      const backend = state.translatorBackend === "libre" ? translateWithLibre : translateWithGemma;
      // Translate speaker turns separately so the rendered split (and leading
      // dashes) match the original cue.
      const job = (async () => {
        const outs = [];
        for (const part of next.text.split("\n")) {
          const src = part.replace(/^-\s*/, "");
          const translated = (await backend(src)) || src;
          outs.push(part === src ? translated : `- ${translated}`);
        }
        return outs.join("\n");
      })();
      job
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
          next.inFlight = false;
          pumpActive--;
        });
    }
  }

  // Anchor the overlay to the video's rectangle, not the viewport: in
  // windowed layouts a viewport-bottom overlay sits on the player controls.
  function positionOverlay() {
    // Prefer the video that is actually playing: state.video is just "first
    // <video> in the DOM" (watchVideoSeeks), which on some sites (MX) is a
    // hero/preview clip at the top of the page, not the player.
    const vids = [...document.querySelectorAll("video")];
    const playing = vids.find((v) => !v.paused && !v.ended && v.currentTime > 0);
    const video = playing || state.video || vids[0] || null;
    const rect = video ? video.getBoundingClientRect() : null;
    // Degenerate or off-screen rects (dummy <video>s, scrolled-away players)
    // would fling the overlay off the viewport — use the default spot.
    if (!rect || rect.height < 80 || rect.bottom < 120 || rect.top > window.innerHeight) {
      box.style.left = "50%";
      box.style.bottom = "7%";
      return;
    }
    box.style.left = `${rect.left + rect.width / 2}px`;
    // 7% of video height matches the original fullscreen position; the 64px
    // floor keeps the overlay above player controls in small windowed layouts.
    // Clamp so the overlay always stays on screen.
    const bottom = Math.max(0, window.innerHeight - rect.bottom) + Math.max(rect.height * 0.07, 64);
    box.style.bottom = `${Math.min(bottom, window.innerHeight - 80)}px`;
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
    flushCueTranslations();
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
        flushCueTranslations();
        applyHideState();
        updateBackendButtons();
      }
      if (translationAffected) {
        flushCueTranslations();
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
    flushCueTranslations();
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
    const cacheKey = `gemma:${state.gemmaModel}:${lang}:${effectiveStyle()}:lex${lexiconStamp}:${context.slice(-48)}:${normalized}`;
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
          // Episode lexicon (prefetch pre-pass) supersedes the reactive
          // live-path glossary: committed spellings beat "be consistent".
          ...(lexicon && lexicon.keepEnglish.length
            ? [`Keep these terms in English: ${lexicon.keepEnglish.join(", ")}.`]
            : []),
          ...(lexicon && Object.keys(lexicon.names).length
            ? [
                `Use these spellings for names: ${Object.entries(lexicon.names)
                  .map(([src, out]) => `${src} = ${out}`)
                  .join(", ")}.`,
              ]
            : []),
          ...(!lexicon && state.glossaryNames.length
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

  // In prefetch mode the cue list says whether captions were even due in the
  // silent window (≥5s of scheduled cue time = the player should have shown
  // something). Without prefetch, assume they were — the old heuristic.
  function scheduledCueSeconds(from, to) {
    let due = 0;
    for (const cue of cueList) {
      if (cue.begin > to) break;
      const overlap = Math.min(cueEnd(cue), to) - Math.max(cue.begin, from);
      if (overlap > 0) due += overlap;
    }
    return due;
  }

  function captionsWereDue(video, silentMs) {
    if (!prefetchOn || !cueList.length) return true;
    if (adPlaying()) return false; // ads have no captions; clock is the ad's
    if (cueClockUsable()) {
      const to = video.currentTime + syncOffset;
      return scheduledCueSeconds(to - silentMs / 1000, to) >= 5;
    }
    // Post-jump (ad break) the offset is untrusted: the schedule can't say
    // anything until re-lock.
    if (everCalibrated) return false;
    // Never locked: offset unknown (calibration needs a caption to appear),
    // so a quiet opening looks identical to CC-off for a while. Use the raw
    // clock but demand much stronger evidence before nagging.
    const to = video.currentTime;
    return silentMs > 45000 && scheduledCueSeconds(to - silentMs / 1000, to) >= 15;
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
      // With the full track in hand, a silent stretch is only suspicious if
      // cues were actually scheduled during it; a long wordless scene is not.
      if (captionsWereDue(video, Date.now() - state.lastCaptionTextAt)) {
        state.captionHint = "no subtitles found — is CC on?";
      }
    }
    if (state.captionHint) {
      statusBadge.textContent = `Translator: ${state.captionHint}`;
      statusBadge.style.background = "rgba(140, 100, 20, 0.85)";
    }
    if (state.captionHint !== prevHint) log("captionHint", state.captionHint || "(cleared)");
  }

  let pingFailStreak = 0;
  async function pingTranslator() {
    if (!state.enabled) {
      statusBadge.textContent = "Translator: off";
      statusBadge.style.background = "rgba(0,0,0,0.72)";
      return;
    }
    if (state.captionHint) return; // the hint owns the badge while active
    // The probe shares the service worker with the prefetch translate flood,
    // so a single round-trip can be starved/dropped under load. Time out a
    // hung probe so the 5s loop stays healthy, and only declare offline after
    // two consecutive failures — a lone transient drop must not flap the badge.
    const check = (url) =>
      Promise.race([
        bgFetch(url, { cache: "no-store" }).then((res) => {
          if (!res.ok) throw new Error(String(res.status));
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
      ]);
    const libreUrl = "http://127.0.0.1:5000/health";
    const gemmaUrl = "http://127.0.0.1:11434/api/tags";
    let connected, label;
    if (state.translatorBackend === "hybrid") {
      const [libreOk, gemmaOk] = await Promise.all([
        check(libreUrl).then(() => true, () => false),
        check(gemmaUrl).then(() => true, () => false),
      ]);
      connected = libreOk && gemmaOk;
      label = connected
        ? "Translator: hybrid connected"
        : libreOk
        ? "Translator: Gemma offline"
        : gemmaOk
        ? "Translator: Libre offline"
        : "Translator: offline";
    } else {
      const gemma = state.translatorBackend === "gemma";
      connected = await check(gemma ? gemmaUrl : libreUrl).then(() => true, () => false);
      label = connected
        ? gemma
          ? "Translator: Gemma connected"
          : "Translator: connected"
        : gemma
        ? "Translator: Gemma offline"
        : "Translator: offline";
    }
    if (connected) {
      pingFailStreak = 0;
      setStatus(label, true);
    } else if (++pingFailStreak >= 2) {
      setStatus(label, false);
    }
    // else: a single transient failure — keep the last (good) badge.
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
      // timedtext timestamps sit directly on the video timeline, so the cue
      // clock is valid at offset 0 without DOM calibration (auto-captions'
      // rolling DOM text never exactly matches a cue, so it can't calibrate).
      trustCueClock: true,
      // Ads play in the same <video> with their own currentTime — a trusted
      // cue clock would paint episode lines over them.
      adActive: () => !!document.querySelector(".ad-showing, .ad-interrupting"),
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
      ".vjs-text-track-display",
      ".text-track-wrapper",
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
        // Caption containers are never interactive controls: player control
        // bars are full of caption-classed buttons (Shaka's CC toggle carries
        // "shaka-caption-button" + status text) that outscore the real root.
        if (el.closest('button, [role="button"]')) continue;
        out.push(el);
        if (out.length >= 40) return out;
      }
    }
    return out;
  }

  // Behavioral root discovery: subtitle DOM markup has no standard, so the
  // class-name vocabulary can miss unknown players. But when we hold the
  // track, the element whose text matches a cue scheduled near the playhead
  // IS the caption container — no player knowledge needed. Returns the
  // outermost element whose entire text is the matched cue, so the root
  // survives per-cue node recreation.
  let lastCueRootScanAt = 0;
  let cueTextRoot = null;
  function findRootByCueText() {
    if (!cueList.length) return null;
    const video = activeVideo();
    if (!video || !video.currentTime) return null;
    const now = Date.now();
    if (now - lastCueRootScanAt < 2000) return null; // full-DOM walk — throttle
    lastCueRootScanAt = now;
    const texts = new Set();
    for (const cue of cueList) {
      if (Math.abs(cue.begin - video.currentTime) > 120) continue;
      const t = cue.text.replace(/\s+/g, " ").trim();
      if (t.length >= 8) texts.add(t); // short lines match chrome/menus too easily
    }
    if (!texts.size) return null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      let el = node.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
      if (el.closest("#prime-subtitle-overlay-host, #prime-subtitle-overlay")) continue;
      // The text node may be one line of a multi-line cue — check its parent too.
      let match = null;
      for (let depth = 0; el && depth < 3; depth++, el = el.parentElement) {
        if (texts.has((el.innerText || "").replace(/\s+/g, " ").trim())) {
          match = el;
        }
      }
      if (!match) continue;
      // Climb to the outermost exact-text ancestor (e.g. the cue node's
      // persistent display container, which holds nothing but the caption).
      const matchedText = (match.innerText || "").replace(/\s+/g, " ").trim();
      while (
        match.parentElement &&
        match.parentElement !== document.body &&
        (match.parentElement.innerText || "").replace(/\s+/g, " ").trim() === matchedText
      ) {
        match = match.parentElement;
      }
      log("caption root found by cue-text match:", match);
      return match;
    }
    return null;
  }

  function pickRoot() {
    const roots = candidateRoots();

    let best = null;
    let bestScore = -1;
    for (const el of roots) {
      const text = (el.innerText || "").trim();
      const score =
        (/caption|shaka-text|timedtext|text-track/i.test(el.className || "") ? 10 : 0) +
        (text.length > 0 ? 5 : 0) +
        (el.querySelectorAll("*").length > 0 ? 2 : 0) +
        (el.getBoundingClientRect().top > window.innerHeight * 0.4 ? 2 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    const CAPTION_CLASS_RE = /caption|shaka-text|timedtext|text-track/i;
    const current =
      state.subtitleRoot && document.contains(state.subtitleRoot) ? state.subtitleRoot : null;
    // A root discovered by cue-text match is verified ground truth — keep it
    // while it lives; no class-named candidate can outrank that evidence.
    if (current && current === cueTextRoot) return current;
    // No trusted root and no candidate carries a recognized caption class:
    // unknown player markup. If we hold the track, find the container by
    // matching cue text instead — runs before stickiness so a wrongly stuck
    // generic root (e.g. a player menu item) can be displaced.
    if (bestScore < 10) {
      const found = findRootByCueText();
      if (found) {
        cueTextRoot = found;
        return found;
      }
    }
    // Stick with the current generic root unless the new pick is a caption element.
    if (current && best !== current && !CAPTION_CLASS_RE.test(best && best.className || "")) {
      return current;
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
    // Track-selection toasts ("subtitle stream_0, selected", "audio stream 1")
    /^(subtitle|audio)?\s*stream[_\s]?\d+\b/i,
    // UI labels carrying a keyboard mnemonic ("Close(_C)") — dialogs, menus
    /^.{1,30}\(_[A-Za-z]\)$/,
    // CC-toggle status labels ("closed_caption", "Closed Captions Off")
    /^closed[_\s-]?captions?(\s+(on|off))?$/i,
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
      if (text) calibrateSync(text);
      if (text && !state.showOriginal) {
        const node =
          findSmallestMatchingDescendant(state.subtitleRoot, text) ||
          findSubtitleNode(state.subtitleRoot, text);
        const container =
          node && node.closest('.shaka-text-container, .vjs-text-track-display, .text-track-wrapper, [class*="caption" i]');
        if (container) hideNode(container);
      }
      // Uncalibrated cue clock would paint out of sync — let the live path
      // keep driving until the first DOM/cue match lands.
      if (cueClockUsable()) return;
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
        const captionContainer = subtitleNode.closest('.shaka-text-container, .vjs-text-track-display, .text-track-wrapper, [class*="caption" i]');
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
      flushCueTranslations();
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
      flushCueTranslations();
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
  setInterval(probeChannels, 10000);
  setInterval(() => {
    watchVideoSeeks();
    harvestNativeTracks();
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
