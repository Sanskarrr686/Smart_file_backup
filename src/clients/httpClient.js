// src/clients/httpClient.js

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeout || 5000;

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const defaultHeaders = {};
    if (!(options.body instanceof FormData)) {
      defaultHeaders["Content-Type"] = "application/json";
    }

    const headers = {
      ...defaultHeaders,
      ...(options.headers || {}),
    };

    if (headers["Content-Type"] === undefined || headers["Content-Type"] === null) {
      delete headers["Content-Type"];
    }

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
    });

    const contentType = response.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch (e) {
        data = { message: "Invalid JSON response from upstream" };
      }
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const message = (typeof data === "object" && data?.message)
        ? data.message
        : `Upstream request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.upstreamStatus = response.status;
      error.upstreamData = data;
      error.code = response.status >= 500 ? "UPSTREAM_FAILURE" : "UPSTREAM_ERROR";
      throw error;
    }

    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      const timeoutErr = new Error(`Upstream request timed out after ${timeoutMs}ms`);
      timeoutErr.status = 504;
      timeoutErr.code = "UPSTREAM_TIMEOUT";
      throw timeoutErr;
    }
    if (!err.status) {
      err.status = 502;
      err.code = "UPSTREAM_FAILURE";
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  request,
};