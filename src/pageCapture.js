(function () {
  if (window.__FOLLOWGRAPH_PAGE_CAPTURE_READY__) return;
  window.__FOLLOWGRAPH_PAGE_CAPTURE_READY__ = true;

  const MAX_BODY_CHARS = 2500000;

  function isGraphqlUrl(value) {
    try {
      const url = new URL(String(value), location.href);
      return url.pathname.toLowerCase().includes("/i/api/graphql/");
    } catch {
      return false;
    }
  }

  function post(url, response, startedAt) {
    if (!response || !isGraphqlUrl(url)) return;
    const clone = response.clone();
    clone
      .text()
      .then((text) => {
        if (!text || text.length > MAX_BODY_CHARS) return;
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          return;
        }

        window.postMessage(
          {
            source: "followgraph",
            type: "x-api-response",
            payload: {
              url: String(url),
              status: response.status,
              elapsedMs: Math.round(performance.now() - startedAt),
              body
            }
          },
          location.origin
        );
      })
      .catch(() => {});
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function followgraphFetch(input, init) {
      const startedAt = performance.now();
      const url = typeof input === "string" ? input : input && input.url;
      return originalFetch.apply(this, arguments).then((response) => {
        post(url, response, startedAt);
        return response;
      });
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === "function") {
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function followgraphOpen(method, url) {
      this.__followgraphUrl = url;
      return originalOpen.apply(this, arguments);
    };

    OriginalXHR.prototype.send = function followgraphSend() {
      const startedAt = performance.now();
      this.addEventListener("load", () => {
        const url = this.__followgraphUrl;
        if (!isGraphqlUrl(url)) return;
        try {
          const text = String(this.responseText || "");
          if (!text || text.length > MAX_BODY_CHARS) return;
          window.postMessage(
            {
              source: "followgraph",
              type: "x-api-response",
              payload: {
                url: String(url),
                status: this.status,
                elapsedMs: Math.round(performance.now() - startedAt),
                body: JSON.parse(text)
              }
            },
            location.origin
          );
        } catch {}
      });

      return originalSend.apply(this, arguments);
    };
  }
})();
