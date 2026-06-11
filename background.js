// Proxies backend calls for content scripts. Content-script fetches run
// under the page's CSP (Hotstar blocks localhost); the service worker uses
// the extension's own host_permissions instead.

// Granted origins persist, but dynamic content-script registrations are
// wiped on extension reload/update — rebuild them from permissions.
async function syncRegisteredSites() {
  const { origins = [] } = await chrome.permissions.getAll();
  const sitePatterns = origins.filter(
    (o) => /^https?:\/\//.test(o) && !/127\.0\.0\.1|localhost/.test(o)
  );
  const existing = await chrome.scripting.getRegisteredContentScripts();
  const registered = new Set(existing.map((s) => s.id));
  for (const pattern of sitePatterns) {
    if (registered.has(pattern)) continue;
    try {
      await chrome.scripting.registerContentScripts([
        {
          id: pattern,
          matches: [pattern],
          js: ["content.js"],
          runAt: "document_idle",
          persistAcrossSessions: true,
        },
      ]);
    } catch {
      // invalid/duplicate pattern — skip
    }
  }
}
chrome.runtime.onInstalled.addListener(syncRegisteredSites);
chrome.runtime.onStartup.addListener(syncRegisteredSites);

// "Try on this site": toolbar click on any OTT requests permission for that
// origin, injects the pipeline now, and registers it for future visits.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !/^https?:/.test(tab.url)) return;
  const originPattern = `${new URL(tab.url).origin}/*`;
  const granted = await chrome.permissions.request({ origins: [originPattern] });
  if (!granted) return;
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: originPattern,
        matches: [originPattern],
        js: ["content.js"],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  } catch {
    // already registered for this origin
  }
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
});

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
