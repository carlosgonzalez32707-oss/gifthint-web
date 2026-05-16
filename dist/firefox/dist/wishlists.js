(() => {
  // ../../../../private/var/folders/gf/cg_yq02x5zs0tn6wdvydnplm0000gn/T/tmp.iU2yKg31WA/supabase.js
  var SUPABASE_URL = "https://pxegvviakrjhldtwtobi.supabase.co";
  var SUPABASE_ANON_KEY = "<YOUR_ANON_KEY>";
  var TIMEOUT_MS = 8e3;
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

  // ../../../../private/var/folders/gf/cg_yq02x5zs0tn6wdvydnplm0000gn/T/tmp.iU2yKg31WA/wishlists.js
  var OCCASION_LABELS = {
    birthday: { label: "Birthday", emoji: "\u{1F382}" },
    christmas: { label: "Christmas", emoji: "\u{1F384}" },
    wedding: { label: "Wedding", emoji: "\u{1F48D}" },
    baby_shower: { label: "Baby Shower", emoji: "\u{1F37C}" },
    graduation: { label: "Graduation", emoji: "\u{1F393}" },
    housewarming: { label: "Housewarming", emoji: "\u{1F3E0}" },
    anniversary: { label: "Anniversary", emoji: "\u{1F942}" },
    other: { label: "My List", emoji: "\u{1F381}" }
  };
  function lastUsedKey(userId) {
    return `gh_last_wishlist_${userId}`;
  }
  async function getWishlists(userId, token) {
    const query = [
      `wishlists?user_id=eq.${encodeURIComponent(userId)}`,
      "is_public=eq.true",
      // Embed item count — PostgREST returns wishlist_items:[{count:N}]
      "select=id,title,occasion,occasion_date,slug,is_default,wishlist_items(count)",
      "order=is_default.desc,created_at.desc"
    ].join("&");
    const { data, error } = await supabaseGet(query, token);
    if (error) {
      return {
        wishlists: [],
        error: error.status === 408 ? "Couldn't load your lists. Check your connection." : error.message
      };
    }
    const wishlists = (data ?? []).map((w) => ({
      ...w,
      itemCount: w.wishlist_items?.[0]?.count ?? 0
    }));
    return { wishlists, error: null };
  }
  async function getPublicUsername(googleUserId, token) {
    try {
      const { data, error } = await supabaseGet(
        `users?google_id=eq.${encodeURIComponent(googleUserId)}&select=public_username&limit=1`,
        token
      );
      if (error || !data?.length) return null;
      return data[0].public_username ?? null;
    } catch {
      return null;
    }
  }
  async function getLastUsedWishlist(userId) {
    try {
      const result = await chrome.storage.local.get(lastUsedKey(userId));
      return result[lastUsedKey(userId)] ?? null;
    } catch {
      return null;
    }
  }
  async function setLastUsedWishlist(userId, list) {
    try {
      await chrome.storage.local.set({
        [lastUsedKey(userId)]: { id: list.id, title: list.title }
      });
    } catch {
    }
  }
})();
