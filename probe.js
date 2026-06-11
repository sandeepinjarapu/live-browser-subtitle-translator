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
    hideable: "unknown",
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

  const observer = new MutationObserver(() => {
    for (const c of seen) {
      const text = (c.innerText || "").trim();
      if (text && text.length > 1 && !report.domTextSamples.includes(text)) {
        report.domTextSamples.push(text.slice(0, 120));
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

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
    clearInterval(cueTimer);

    // --- (b) hideability: a non-empty leaf candidate we could opacity-0 ----
    const textCandidate = [...seen].find((c) => (c.innerText || "").trim());
    report.hideable = report.domTextSamples.length
      ? textCandidate
        ? "yes (DOM element can be opacity-0)"
        : "probably"
      : report.trackCueSamples.length
        ? "n/a (cues come from track API; rendering is player-side)"
        : "nothing to hide — no text found";

    const verdict = report.domTextSamples.length
      ? "SUPPORTED via DOM scraping (current pipeline)"
      : report.trackCueSamples.length
        ? "SUPPORTED via textTrack cues (better than scraping — new reader needed)"
        : report.videos
          ? "NOT READABLE — likely image/canvas subtitles; needs v2 prefetch route"
          : "NOT READABLE — no <video>; custom player, needs investigation";

    console.log(TAG, "================ PROBE VERDICT ================");
    console.log(TAG, "site:", report.site);
    console.log(TAG, "verdict:", verdict);
    console.log(TAG, "video syncable:", report.syncableVideo, `(${report.videos} video element(s))`);
    console.log(TAG, "hideable:", report.hideable);
    console.log(TAG, "DOM subtitle samples:", report.domTextSamples.slice(0, 5));
    console.log(TAG, "track cue samples:", report.trackCueSamples.slice(0, 5));
    console.log(TAG, "===============================================");
  }, WATCH_MS);
})();
