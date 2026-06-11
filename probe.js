// Compatibility probe — answers, for any streaming site:
//   (a) is there readable subtitle text (DOM or native text tracks)?
//   (b) could we hide the original cleanly?
//   (c) is there a normal <video> element to sync against?
//
// Usage: start playing a video WITH SUBTITLES ON, open DevTools console,
// paste this whole file, press Enter, and watch for ~15 seconds.
// Share the final "PROBE VERDICT" block.

(function () {
  const TAG = "[Subtitle Probe]";
  const WATCH_MS = 15000;
  const report = {
    site: location.hostname,
    videos: 0,
    syncableVideo: false,
    textTracks: [],
    trackCueSamples: [],
    domCandidates: [],
    domTextSamples: [],
    genericSamples: [],
    genericContainers: [],
    hideable: "unknown",
  };

  // Seek-bar timecodes change every second and sit low on screen — exclude.
  const isClockLike = (text) => /^[\d:.\s\/\-]+$/.test(text);

  const nodePath = (el) => {
    const parts = [];
    let cur = el;
    while (cur && cur.tagName && parts.length < 6) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) part += `#${cur.id}`;
      const cls = typeof cur.className === "string" ? cur.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      if (cls) part += `.${cls}`;
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  };

  // --- (c) video elements -------------------------------------------------
  const videos = [...document.querySelectorAll("video")];
  report.videos = videos.length;
  const mainVideo = videos.find((v) => v.duration > 60) || videos[0] || null;
  if (mainVideo) {
    report.syncableVideo = Number.isFinite(mainVideo.currentTime);
    console.log(TAG, "video:", {
      duration: mainVideo.duration,
      currentTime: mainVideo.currentTime,
      paused: mainVideo.paused,
    });
  } else {
    console.log(TAG, "no <video> element found (canvas/custom player?)");
  }

  // --- (a1) native text tracks --------------------------------------------
  if (mainVideo && mainVideo.textTracks && mainVideo.textTracks.length) {
    for (const track of mainVideo.textTracks) {
      report.textTracks.push({ kind: track.kind, label: track.label, language: track.language, mode: track.mode });
      // "hidden" keeps cues updating without rendering; lets us sample them.
      if (track.mode === "disabled") track.mode = "hidden";
    }
    console.log(TAG, "textTracks:", report.textTracks);
  } else {
    console.log(TAG, "no native textTracks");
  }

  // --- (a2) DOM candidates -------------------------------------------------
  const selectors = [
    '[class*="caption" i]',
    '[class*="subtitle" i]',
    '[class*="cue" i]',
    '[class*="timedtext" i]',
    '[data-testid*="caption" i]',
    '[data-testid*="subtitle" i]',
  ];
  const seen = new Set();
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      report.domCandidates.push({
        selector: sel,
        tag: el.tagName.toLowerCase(),
        className: String(el.className).slice(0, 80),
        text: (el.innerText || "").trim().slice(0, 80),
        visible: rect.width > 0 && rect.height > 0,
        bottomHalf: rect.top > window.innerHeight * 0.4,
      });
    }
  }
  console.log(TAG, `${report.domCandidates.length} DOM candidate(s)`);
  if (report.domCandidates.length) console.table(report.domCandidates);

  // --- watch phase: sample real subtitle text for WATCH_MS -----------------
  console.log(TAG, `watching for ${WATCH_MS / 1000}s — keep the video playing...`);

  // Dialogue changes during playback and sits low on screen; static page
  // metadata (titles, genres, ratings) matching the selectors does neither.
  const prevText = new Map();
  for (const c of seen) prevText.set(c, (c.innerText || "").trim());
  const observer = new MutationObserver(() => {
    for (const c of seen) {
      const text = (c.innerText || "").trim();
      if (text === prevText.get(c)) continue;
      prevText.set(c, text);
      const rect = c.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      const lowOnScreen = rect.top > window.innerHeight * 0.4;
      if (text && text.length > 1 && visible && lowOnScreen && !isClockLike(text) && !report.domTextSamples.includes(text)) {
        report.domTextSamples.push(text.slice(0, 120));
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // Generic detector: class names vary per OTT (Hotstar's subtitle container
  // matched none of our selectors), so also watch the whole document for
  // changing dialogue-like text over the bottom of the video.
  const videoRect = mainVideo ? mainVideo.getBoundingClientRect() : null;
  const genericObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!el || el.id === "prime-subtitle-overlay") continue;
      const text = (el.innerText || "").trim();
      if (!text || text.length < 2 || text.length > 200 || isClockLike(text)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const inBottomOfVideo = videoRect
        ? rect.top > videoRect.top + videoRect.height * 0.55 && rect.top < videoRect.bottom + 10
        : rect.top > window.innerHeight * 0.55;
      if (!inBottomOfVideo) continue;
      if (!report.genericSamples.includes(text)) {
        report.genericSamples.push(text.slice(0, 120));
        const path = nodePath(el);
        if (!report.genericContainers.includes(path)) report.genericContainers.push(path);
      }
    }
  });
  genericObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // Point sampling: ask the browser what is actually rendering at the spots
  // where subtitles appear. Sees through shadow DOM; identifies canvas/iframe.
  report.pointSamples = [];
  report.pointContainers = [];
  report.canvasOverVideo = false;
  report.iframes = [...document.querySelectorAll("iframe")].map((f) => {
    let sameOrigin = true;
    try { void f.contentDocument.body; } catch { sameOrigin = false; }
    return { src: (f.src || "").slice(0, 100), sameOrigin };
  });
  if (report.iframes.length) console.log(TAG, "iframes:", report.iframes);

  const pointTimer = setInterval(() => {
    const vr = mainVideo ? mainVideo.getBoundingClientRect() : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
    const x = (vr.left + vr.right) / 2;
    for (const frac of [0.75, 0.85, 0.93]) {
      const y = vr.top + (vr.bottom - vr.top) * frac;
      // composedPath through shadow DOM: elementsFromPoint pierces open shadow roots
      for (const el of document.elementsFromPoint(x, y)) {
        if (el.tagName === "CANVAS") report.canvasOverVideo = true;
        if (el.tagName === "VIDEO" || el.tagName === "CANVAS" || el.tagName === "IFRAME") continue;
        const text = (el.innerText || el.textContent || "").trim();
        if (!text || text.length < 2 || text.length > 200 || isClockLike(text)) continue;
        if (!report.pointSamples.includes(text)) {
          report.pointSamples.push(text.slice(0, 120));
          const root = el.getRootNode();
          const shadowNote = root instanceof ShadowRoot ? ` [in shadow root of ${nodePath(root.host)}]` : "";
          const path = nodePath(el) + shadowNote;
          if (!report.pointContainers.includes(path)) report.pointContainers.push(path);
        }
        break; // innermost text element at this point is enough
      }
    }
  }, 500);

  const cueTimer = setInterval(() => {
    if (!mainVideo || !mainVideo.textTracks) return;
    for (const track of mainVideo.textTracks) {
      for (const cue of track.activeCues || []) {
        const text = (cue.text || "").trim();
        if (text && !report.trackCueSamples.includes(text)) {
          report.trackCueSamples.push(text.slice(0, 120));
        }
      }
    }
  }, 500);

  setTimeout(() => {
    observer.disconnect();
    genericObserver.disconnect();
    clearInterval(cueTimer);
    clearInterval(pointTimer);

    // --- (b) hideability: a non-empty leaf candidate we could opacity-0 ----
    const textCandidate = [...seen].find((c) => (c.innerText || "").trim());
    report.hideable = report.domTextSamples.length
      ? textCandidate
        ? "yes (DOM element can be opacity-0)"
        : "probably"
      : report.trackCueSamples.length
        ? "n/a (cues come from track API; rendering is player-side)"
        : "nothing to hide — no text found";

    // Require at least 2 distinct changing lines; one change could be noise.
    const verdict = report.domTextSamples.length >= 2
      ? "SUPPORTED via DOM scraping (current pipeline)"
      : report.genericSamples.length >= 2 || report.pointSamples.length >= 2
        ? "SUPPORTED via DOM scraping, but site uses non-standard subtitle classes/shadow DOM — add the container below to candidateRoots()"
        : report.trackCueSamples.length
          ? "SUPPORTED via textTrack cues (better than scraping — new reader needed)"
          : report.canvasOverVideo
            ? "NOT READABLE — canvas-rendered subtitles; needs v2 prefetch route"
            : report.iframes.some((f) => !f.sameOrigin)
              ? "INCONCLUSIVE — cross-origin iframe present; player may live there (probe can't see in). Re-run with the iframe as console context."
              : report.domCandidates.length
                ? "INCONCLUSIVE — subtitle-like elements exist but none changed during playback (metadata match? subtitles off? video paused?)"
                : report.videos
                  ? "NOT READABLE — likely image/canvas subtitles; needs v2 prefetch route"
                  : "NOT READABLE — no <video>; custom player, needs investigation";

    console.log(TAG, "================ PROBE VERDICT ================");
    console.log(TAG, "site:", report.site);
    console.log(TAG, "verdict:", verdict);
    console.log(TAG, "video syncable:", report.syncableVideo, `(${report.videos} video element(s))`);
    console.log(TAG, "hideable:", report.hideable);
    console.log(TAG, "DOM subtitle samples:", report.domTextSamples.slice(0, 5));
    console.log(TAG, "generic samples:", report.genericSamples.slice(0, 5));
    console.log(TAG, "generic containers:", report.genericContainers.slice(0, 3));
    console.log(TAG, "point samples:", report.pointSamples.slice(0, 5));
    console.log(TAG, "point containers:", report.pointContainers.slice(0, 3));
    console.log(TAG, "canvas over video:", report.canvasOverVideo);
    console.log(TAG, "track cue samples:", report.trackCueSamples.slice(0, 5));
    console.log(TAG, "===============================================");
  }, WATCH_MS);
})();
