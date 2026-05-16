(() => {
  // ../../../../private/var/folders/gf/cg_yq02x5zs0tn6wdvydnplm0000gn/T/tmp.iU2yKg31WA/supabase.js
  var SUPABASE_URL = "https://pxegvviakrjhldtwtobi.supabase.co";
  var SUPABASE_ANON_KEY = "<YOUR_ANON_KEY>";
  var TIMEOUT_MS = 8e3;
  var SAVE_QUEUE_KEY = "gh_save_queue";
  async function supabaseFetch(path, { method = "GET", body, token } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        return { data: null, error: { status: response.status, message: errBody.message ?? response.statusText } };
      }
      if (response.status === 204) return { data: null, error: null };
      const data = await response.json();
      return { data, error: null };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        return { data: null, error: { status: 408, message: "Request timed out. Check your connection." } };
      }
      return { data: null, error: { status: 0, message: err.message ?? "Network error" } };
    }
  }
  async function supabaseGet(path, token) {
    return supabaseFetch(path, { method: "GET", token });
  }
  async function supabasePost(path, body, token) {
    return supabaseFetch(path, { method: "POST", body, token });
  }
  async function supabasePatch(path, body, token) {
    return supabaseFetch(path, { method: "PATCH", body, token });
  }
  async function enqueueSave(payload) {
    const result = await chrome.storage.local.get(SAVE_QUEUE_KEY);
    const queue = result[SAVE_QUEUE_KEY] ?? [];
    queue.push({ payload, queuedAt: Date.now() });
    await chrome.storage.local.set({ [SAVE_QUEUE_KEY]: queue });
  }
  async function flushSaveQueue(token) {
    const result = await chrome.storage.local.get(SAVE_QUEUE_KEY);
    const queue = result[SAVE_QUEUE_KEY] ?? [];
    if (queue.length === 0) return;
    const remaining = [];
    for (const entry of queue) {
      const { data, error } = await supabasePost("wishlist_items", entry.payload, token);
      if (error) {
        remaining.push(entry);
      } else {
        console.log("[GiftHint] flushed queued save:", data);
      }
    }
    await chrome.storage.local.set({ [SAVE_QUEUE_KEY]: remaining });
  }
})();
