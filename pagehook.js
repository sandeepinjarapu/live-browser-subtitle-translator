// Runs in the page's MAIN world at document_start. Content scripts live in
// an isolated world and cannot observe the player's own network traffic, so
// this hook wraps fetch/XHR and forwards subtitle-track responses to the
// content script via postMessage. Prefetch probe stage: detect + forward only.
(function () {
  if (window.__subtitleTrackHook) return;
  window.__subtitleTrackHook = true;

  // Prime serves tracks from bare-UUID URLs, and stpp subtitle segments
  // arrive as binary fragmented MP4 with a video/mp4-ish content type — so
  // the only reliable filter is searching decoded bodies for TTML markers.
  // image/font/audio can't carry subtitles; everything else gets sniffed.
  var URL_RE = /ttml|dfxp|timedtext|imsc|\.vtt|\.srt|\.xml|caption|subtitle/i;
  var SKIP_TYPE_RE = /^(audio|image|font)\//i;
  var MAX_BODY = 8 * 1024 * 1024;

  // "vtt" / "ttml-text" (plain file) / "ttml-mp4" (XML inside mdat boxes)
  function trackKind(body) {
    if (/^WEBVTT/.test(body.slice(0, 200))) return "vtt";
    if (body.indexOf("<tt") === -1 || body.indexOf("ttml") === -1) return "";
    return body.indexOf("mdat") !== -1 || body.indexOf("moof") !== -1 ? "ttml-mp4" : "ttml-text";
  }

  // Diagnosis aid: surface every subtitle-ish URL even when the body sniff
  // rejects it, so we can see what the player actually requests.
  function candidate(url, contentType, via) {
    if (!URL_RE.test(url)) return;
    window.postMessage(
      { source: "lst-track-candidate", url: String(url), contentType: contentType || "", via: via },
      "*"
    );
  }

  function report(url, contentType, body) {
    if (!body || body.length > MAX_BODY) return;
    var kind = trackKind(body);
    if (!kind) return;
    window.postMessage(
      {
        source: "lst-track",
        url: String(url),
        contentType: contentType || "",
        kind: kind,
        body: body,
      },
      "*"
    );
  }

  // The content script can ask for a full-file re-fetch of a captured track
  // URL (the player itself uses Range windows). Runs with the page's own
  // CORS context, which the player's CDN already permits. Uses the original
  // fetch so the wrapper below doesn't double-report it.
  window.addEventListener("message", function (event) {
    if (event.source !== window || !event.data || event.data.source !== "lst-fetch-track") return;
    origFetch(event.data.url)
      .then(function (res) {
        var type = res.headers.get("content-type") || "";
        return res.text().then(function (body) {
          report(res.url || event.data.url, type, body);
        });
      })
      .catch(function () {});
  });

  var origFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    var p = origFetch.apply(this, args);
    try {
      var url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      p.then(function (res) {
        var type = res.headers.get("content-type") || "";
        candidate(res.url || url, type, "fetch");
        if (SKIP_TYPE_RE.test(type)) return;
        res
          .clone()
          .text()
          .then(function (body) {
            report(res.url || url, type, body);
          })
          .catch(function () {});
      }).catch(function () {});
    } catch (e) {
      // never break the page's own fetch
    }
    return p;
  };

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__lstUrl = String(url);
    return origOpen.apply(this, arguments);
  };

  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    xhr.addEventListener("load", function () {
      try {
        var url = xhr.responseURL || xhr.__lstUrl || "";
        var type = xhr.getResponseHeader("content-type") || "";
        candidate(url, type, "xhr:" + (xhr.responseType || "text"));
        if (SKIP_TYPE_RE.test(type)) return;
        if (xhr.responseType === "" || xhr.responseType === "text") {
          report(url, type, xhr.responseText);
        } else if (xhr.responseType === "arraybuffer" && xhr.response) {
          report(url, type, new TextDecoder().decode(xhr.response));
        } else if (xhr.responseType === "blob" && xhr.response) {
          xhr.response.text().then(function (body) {
            report(url, type, body);
          }).catch(function () {});
        }
      } catch (e) {
        // sniffing must never affect the player's request handling
      }
    });
    return origSend.apply(this, arguments);
  };
})();
