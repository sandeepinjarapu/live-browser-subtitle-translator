// Runs in the page's MAIN world at document_start. Content scripts live in
// an isolated world and cannot observe the player's own network traffic, so
// this hook wraps fetch/XHR and forwards subtitle-track responses to the
// content script via postMessage. Prefetch probe stage: detect + forward only.
(function () {
  if (window.__subtitleTrackHook) return;
  window.__subtitleTrackHook = true;

  // URL/content-type gate decides whether we read a body at all; the body
  // sniff makes the final call, so the gate can afford to be generous.
  var URL_RE = /ttml|dfxp|timedtext|imsc|\.vtt|\.srt|\.xml/i;
  var TYPE_RE = /ttml|vtt|subrip|dfxp|xml/i;
  var MAX_BODY = 4 * 1024 * 1024;

  function looksLikeTrack(body) {
    var head = body.slice(0, 2000);
    return /^WEBVTT/.test(head) || /<tt[\s>:]/i.test(head) || /<timedtext/i.test(head);
  }

  function report(url, contentType, body) {
    if (!body || body.length > MAX_BODY || !looksLikeTrack(body)) return;
    window.postMessage(
      { source: "lst-track", url: String(url), contentType: contentType || "", body: body },
      "*"
    );
  }

  var origFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    var p = origFetch.apply(this, args);
    try {
      var url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      p.then(function (res) {
        var type = res.headers.get("content-type") || "";
        if (!URL_RE.test(url) && !TYPE_RE.test(type)) return;
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
        if (!URL_RE.test(url) && !TYPE_RE.test(type)) return;
        if (xhr.responseType === "" || xhr.responseType === "text") {
          report(url, type, xhr.responseText);
        } else if (xhr.responseType === "arraybuffer" && xhr.response) {
          report(url, type, new TextDecoder().decode(xhr.response));
        }
      } catch (e) {
        // sniffing must never affect the player's request handling
      }
    });
    return origSend.apply(this, arguments);
  };
})();
