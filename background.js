// Proxies backend calls for content scripts. Content-script fetches run
// under the page's CSP (Hotstar blocks localhost); the service worker uses
// the extension's own host_permissions instead.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "fetch") {
    fetch(msg.url, msg.init)
      .then(async (response) => {
        const body = await response.text();
        sendResponse({ ok: response.ok, status: response.status, body });
      })
      .catch((error) => {
        sendResponse({ ok: false, status: 0, body: "", error: String(error) });
      });
    return true; // async sendResponse
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "stream") return;
  port.onMessage.addListener(async (msg) => {
    try {
      const response = await fetch(msg.url, msg.init);
      if (!response.ok) {
        port.postMessage({ error: `status ${response.status}` });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        port.postMessage({ chunk: decoder.decode(value, { stream: true }) });
      }
      port.postMessage({ done: true });
    } catch (error) {
      try {
        port.postMessage({ error: String(error) });
      } catch {
        // port already closed
      }
    }
  });
});
