(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };

  // ../../../../private/var/folders/gf/cg_yq02x5zs0tn6wdvydnplm0000gn/T/tmp.iU2yKg31WA/supabase.js
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
  async function enqueueSave(payload) {
    const result = await chrome.storage.local.get(SAVE_QUEUE_KEY);
    const queue = result[SAVE_QUEUE_KEY] ?? [];
    queue.push({ payload, queuedAt: Date.now() });
    await chrome.storage.local.set({ [SAVE_QUEUE_KEY]: queue });
  }
  var SUPABASE_URL, SUPABASE_ANON_KEY, TIMEOUT_MS, SAVE_QUEUE_KEY;
  var init_supabase = __esm({
    "../../../../private/var/folders/gf/cg_yq02x5zs0tn6wdvydnplm0000gn/T/tmp.iU2yKg31WA/supabase.js"() {
      SUPABASE_URL = "https://pxegvviakrjhldtwtobi.supabase.co";
      SUPABASE_ANON_KEY = "<YOUR_ANON_KEY>";
      TIMEOUT_MS = 8e3;
      SAVE_QUEUE_KEY = "gh_save_queue";
    }
  });

  // ../../../../private/var/folders/gf/cg_yq02x5zs0tn6wdvydnplm0000gn/T/tmp.iU2yKg31WA/compat.js
  var IS_FIREFOX = typeof browser !== "undefined" && typeof browser.runtime !== "undefined";
  var _api = IS_FIREFOX ? (
    /* global browser */
    browser
  ) : (
    /* global chrome  */
    chrome
  );
  var ext = {
    /**
     * chrome.storage.local / browser.storage.local
     *
     * ext.storage.local.get(key | [key] | {key: default})  → Promise<object>
     * ext.storage.local.set({key: value, ...})              → Promise<void>
     * ext.storage.local.remove(key | [key])                 → Promise<void>
     */
    storage: {
      local: _api.storage.local
    },
    /**
     * chrome.runtime / browser.runtime
     *
     * ext.runtime.id          — extension ID string
     * ext.runtime.lastError   — last error (check after callbacks, if any)
     * ext.runtime.getURL(path) — extension resource URL
     */
    runtime: _api.runtime,
    /**
     * chrome.tabs / browser.tabs
     *
     * ext.tabs.create({ url })                     → Promise<Tab>
     * ext.tabs.query({ active, currentWindow })    → Promise<Tab[]>
     * ext.tabs.sendMessage(tabId, msg)             → Promise<any>
     */
    tabs: _api.tabs,
    /**
     * chrome.scripting / browser.scripting
     *
     * ext.scripting.executeScript({ target, func, args }) → Promise<InjectionResult[]>
     *
     * Available in Chrome MV3 and Firefox MV2 (Firefox 102+) / MV3.
     */
    scripting: _api.scripting,
    /**
     * Unified popup-icon / badge API.
     *
     * Chrome MV3:   chrome.action
     * Firefox MV2:  browser.browserAction
     * Firefox MV3:  browser.action
     *
     * ext.action.setBadgeText({ text })          → Promise<void>
     * ext.action.setBadgeBackgroundColor({ color }) → Promise<void>
     */
    action: _api.action ?? (IS_FIREFOX ? browser.browserAction ?? null : null),
    /** true when running in Firefox / Firefox-based browsers */
    isFirefox: IS_FIREFOX
  };

  // ../../../../private/var/folders/gf/cg_yq02x5zs0tn6wdvydnplm0000gn/T/tmp.iU2yKg31WA/auth.js
  var OAUTH_CLIENT_ID = "YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com";
  var EXCHANGE_URL = "https://gifthint.io/api/auth/exchange";
  var SCOPES = ["email", "profile", "openid"];
  var USER_KEY = "gh_user";
  function getRedirectUrl() {
    return browser.identity.getRedirectURL("oauth/callback");
  }
  function buildAuthUrl(redirectUrl) {
    const params = new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: redirectUrl,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "online",
      // Prompt selects the account every time — avoids silent re-use of a
      // wrong Google account when multiple accounts are logged in.
      prompt: "select_account"
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  async function exchangeCodeForToken(code, redirectUrl) {
    const res = await fetch(EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirect_uri: redirectUrl })
    });
    let body;
    try {
      body = await res.json();
    } catch {
      throw new Error(`Token exchange returned non-JSON response (HTTP ${res.status})`);
    }
    if (!res.ok) {
      throw new Error(body?.error ?? `Token exchange failed (HTTP ${res.status})`);
    }
    if (typeof body?.access_token !== "string") {
      throw new Error("No access_token in exchange response");
    }
    return body.access_token;
  }
  async function getToken() {
    const result = await ext.storage.local.get(USER_KEY);
    return result[USER_KEY]?.token ?? null;
  }
  async function signIn() {
    const redirectUrl = getRedirectUrl();
    const authUrl = buildAuthUrl(redirectUrl);
    let responseUrl;
    try {
      responseUrl = await browser.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });
    } catch (err) {
      const msg = err?.message ?? String(err);
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("dismiss") || msg.toLowerCase().includes("user closed")) {
        return { error: "Sign-in was cancelled. Click the extension icon and try again." };
      }
      console.error("[GiftHint] launchWebAuthFlow error:", err);
      return { error: `Sign-in failed: ${msg}` };
    }
    let code;
    try {
      const url = new URL(responseUrl);
      const err = url.searchParams.get("error");
      if (err) {
        return { error: `Google OAuth error: ${err}` };
      }
      code = url.searchParams.get("code");
      if (!code) throw new Error("no code param in redirect URL");
    } catch (parseErr) {
      console.error("[GiftHint] Failed to parse redirect URL:", responseUrl, parseErr);
      return { error: "Unexpected OAuth response. Please try again." };
    }
    let token;
    try {
      token = await exchangeCodeForToken(code, redirectUrl);
    } catch (exchangeErr) {
      console.error("[GiftHint] Token exchange error:", exchangeErr);
      return { error: exchangeErr?.message ?? "Token exchange failed. Please try again." };
    }
    let user;
    try {
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!profileRes.ok) throw new Error(`Profile fetch failed (HTTP ${profileRes.status})`);
      user = await profileRes.json();
    } catch (profileErr) {
      return { error: `Couldn't fetch Google profile: ${profileErr?.message}` };
    }
    await ext.storage.local.set({ [USER_KEY]: { ...user, token } });
    return { token, user };
  }
  async function signOut() {
    await ext.storage.local.remove(USER_KEY);
  }
  async function withAuth(fn) {
    const token = await getToken();
    if (!token) {
      return { data: null, error: { status: 401, message: "Not signed in" } };
    }
    const result = await fn(token);
    if (result.error?.status === 401) {
      await signOut();
      return {
        data: null,
        error: { status: 401, message: "Session expired \u2014 please sign in again." }
      };
    }
    return result;
  }
  async function getCachedUser() {
    const result = await ext.storage.local.get(USER_KEY);
    return result[USER_KEY] ?? null;
  }

  // ../../../../private/var/folders/gf/cg_yq02x5zs0tn6wdvydnplm0000gn/T/tmp.iU2yKg31WA/items.js
  init_supabase();

  // ../../../../private/var/folders/gf/cg_yq02x5zs0tn6wdvydnplm0000gn/T/tmp.iU2yKg31WA/wishlists.js
  init_supabase();
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

  // ../../../../private/var/folders/gf/cg_yq02x5zs0tn6wdvydnplm0000gn/T/tmp.iU2yKg31WA/items.js
  async function saveItem(productData, userId, token, wishlistId = null) {
    if (!productData?.isProductPage) {
      return { error: "Not a product page" };
    }
    const alreadySaved = await isDuplicate(productData.source_url, userId, token);
    if (alreadySaved) {
      return { error: "duplicate", message: "Already saved to your list" };
    }
    const payload = {
      user_id: userId,
      wishlist_id: wishlistId ?? null,
      title: productData.title,
      price: productData.price ?? null,
      currency: productData.currency ?? "USD",
      image_url: productData.image_url ?? null,
      source_url: productData.source_url,
      retailer: productData.retailer ?? null,
      dna_tags: [],
      is_claimed: false
    };
    const { data, error } = await withAuth(
      (t) => supabasePost("wishlist_items", payload, t)
    );
    if (error) {
      if (error.status === 408 || error.status === 0) {
        await enqueueSave(payload);
        return {
          error: error.message,
          queued: true,
          toast: "Save failed \u2014 check your connection. Will retry automatically."
        };
      }
      return { error: error.message };
    }
    return { item: Array.isArray(data) ? data[0] : data };
  }
  async function isDuplicate(sourceUrl, userId, token) {
    try {
      const { data, error } = await supabaseGet(
        `wishlist_items?user_id=eq.${encodeURIComponent(userId)}&source_url=eq.${encodeURIComponent(sourceUrl)}&select=id&limit=1`,
        token
      );
      if (error) return false;
      return Array.isArray(data) && data.length > 0;
    } catch {
      return false;
    }
  }

  // ../../../../private/var/folders/gf/cg_yq02x5zs0tn6wdvydnplm0000gn/T/tmp.iU2yKg31WA/popup.js
  var SITE_URL = "https://gifthint.io";
  var DASHBOARD_URL = `${SITE_URL}/dashboard`;
  var PURPLE = "#8B83F0";
  function render(html) {
    const root = document.getElementById("root");
    if (root) root.innerHTML = html;
  }
  function el(id) {
    return document.getElementById(id);
  }
  function escHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function formatPrice(price) {
    if (!price) return "";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
  }
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 864e5);
  }
  function occasionEmoji(occasionKey) {
    return OCCASION_LABELS[occasionKey]?.emoji ?? "\u{1F381}";
  }
  function buildShareUrl(publicUsername, wishlist) {
    if (!publicUsername || !wishlist?.slug) return null;
    return `${SITE_URL}/list/${publicUsername}/${wishlist.slug}`;
  }
  function countdownBadgeHtml(wishlist) {
    if (!wishlist?.occasion_date) return "";
    const days = daysUntil(wishlist.occasion_date);
    if (days === null || days < 0 || days > 90) return "";
    const emoji = occasionEmoji(wishlist.occasion);
    const label = OCCASION_LABELS[wishlist.occasion]?.label ?? "Occasion";
    let text, modifier;
    if (days === 0) {
      text = `${emoji} ${label} is today!`;
      modifier = "tomorrow";
    } else if (days === 1) {
      text = `${emoji} ${label} tomorrow`;
      modifier = "tomorrow";
    } else if (days <= 7) {
      text = `${emoji} ${label} in ${days} days`;
      modifier = "soon";
    } else {
      text = `${emoji} ${label} in ${days} days`;
      modifier = "";
    }
    return `<span class="countdown-badge ${modifier}">${escHtml(text)}</span>`;
  }
  function listSelectorTriggerHtml(activeList, open = false) {
    const emoji = occasionEmoji(activeList?.occasion);
    const name = escHtml(activeList?.title ?? "Select a list");
    const count = activeList?.itemCount ?? 0;
    const countLabel = count === 1 ? "1 item" : `${count} items`;
    return `
    <button class="list-selector__trigger${open ? " open" : ""}" id="ls-trigger" aria-expanded="${open}" aria-haspopup="listbox">
      <span class="list-selector__trigger-emoji">${emoji}</span>
      <span class="list-selector__trigger-name">${name}</span>
      <span class="list-selector__trigger-count">${escHtml(countLabel)}</span>
      <span class="list-selector__trigger-chevron">\u25BE</span>
    </button>
  `;
  }
  function listSelectorHtml(wishlists, activeList, open = false) {
    const items = wishlists.map((w) => {
      const isActive = w.id === activeList?.id;
      const emoji = occasionEmoji(w.occasion);
      const count = w.itemCount ?? 0;
      const countText = count === 1 ? "1 item" : `${count} items`;
      return `
      <div class="list-selector__item${isActive ? " active" : ""}" data-list-id="${escHtml(w.id)}" role="option" aria-selected="${isActive}">
        <span class="list-selector__item-emoji">${emoji}</span>
        <span class="ls-name">${escHtml(w.title)}</span>
        <span class="ls-count">${escHtml(countText)}</span>
        <span class="list-selector__item-check">${isActive ? "\u2713" : ""}</span>
      </div>
    `;
    }).join("");
    return `
    <div class="list-selector" id="list-selector">
      ${listSelectorTriggerHtml(activeList, open)}
      <div class="list-selector__menu${open ? " open" : ""}" id="ls-menu" role="listbox">
        ${items}
        <div class="list-selector__divider"></div>
        <div class="list-selector__create" id="ls-create-new">
          \uFF0B Create new list
        </div>
      </div>
    </div>
  `;
  }
  function renderLoading() {
    render(`
    <div class="skeleton-list">
      ${[1, 2, 3].map(() => `
        <div class="skeleton-card">
          <div class="skeleton-card__thumb gh-shimmer"></div>
          <div class="skeleton-card__lines">
            <div class="skeleton-card__line skeleton-card__line--title gh-shimmer"></div>
            <div class="skeleton-card__line skeleton-card__line--sub gh-shimmer"></div>
          </div>
        </div>
      `).join("")}
    </div>
  `);
  }
  function renderSignedOut() {
    render(`
    <div style="
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;height:100%;padding:32px 20px;text-align:center;gap:0;
    ">
      <div style="font-size:40px;margin-bottom:14px;">\u{1F381}</div>

      <h1 style="margin:0 0 8px;font-size:16px;font-weight:800;color:#F0EEE8;letter-spacing:-0.03em;">
        Save gifts while you shop
      </h1>

      <p style="margin:0 0 24px;font-size:12px;color:#7A7870;line-height:1.55;max-width:220px;">
        Sign in to save products to multiple wishlists with occasion tagging and share links.
      </p>

      <button id="btn-signin" style="
        display:inline-flex;align-items:center;gap:10px;
        padding:10px 22px;border-radius:999px;background:#fff;
        border:none;color:#1a1a1a;font-size:13px;font-weight:700;
        cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.3);
        letter-spacing:-0.01em;font-family:inherit;
      ">
        <svg width="16" height="16" viewBox="0 0 18 18" style="flex-shrink:0">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
        </svg>
        Continue with Google
      </button>

      <a id="link-dashboard-out" href="${DASHBOARD_URL}" target="_blank" rel="noopener noreferrer" style="
        margin-top:20px;font-size:11px;color:#7A7870;text-decoration:none;opacity:0.7;
      ">Open dashboard \u2197</a>
    </div>
  `);
    el("btn-signin").addEventListener("click", handleSignIn);
  }
  function renderSignedIn(user, { wishlists, lastWishlist }, product, publicUsername) {
    const name = user.given_name ?? user.name ?? "there";
    const hasLists = wishlists && wishlists.length > 0;
    const activeList = hasLists ? wishlists.find((w) => w.id === lastWishlist?.id) ?? wishlists.find((w) => w.is_default) ?? wishlists[0] : null;
    const shareUrl = buildShareUrl(publicUsername, activeList);
    const countdownHtml = countdownBadgeHtml(activeList);
    render(`
    <!-- \u2500\u2500 Header \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
    <div style="
      padding:12px 14px 10px;
      border-bottom:1px solid rgba(240,238,232,0.07);
    ">
      <!-- Row 1: avatar + name + sign-out -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          ${user.picture ? `<img src="${escHtml(user.picture)}" alt="" style="width:26px;height:26px;border-radius:50%;flex-shrink:0;">` : `<div style="width:26px;height:26px;border-radius:50%;background:${PURPLE};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0;">${escHtml(name[0].toUpperCase())}</div>`}
          <span style="font-size:12px;font-weight:600;color:#F0EEE8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Hi, ${escHtml(name)}</span>
        </div>
        <button id="btn-signout" style="
          background:transparent;border:none;color:#7A7870;
          font-size:10px;cursor:pointer;padding:3px 6px;
          border-radius:4px;font-family:inherit;flex-shrink:0;
        ">Sign out</button>
      </div>

      <!-- Row 2: occasion countdown (shown only when upcoming) -->
      ${countdownHtml ? `<div style="margin-top:8px;">${countdownHtml}</div>` : ""}
    </div>

    <!-- \u2500\u2500 List selector \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
    <div style="padding:12px 14px 0;">
      <label style="
        display:block;font-size:10px;font-weight:600;color:#7A7870;
        letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px;
      ">Active list</label>

      ${hasLists ? listSelectorHtml(wishlists, activeList, false) : `<div style="padding:9px 12px;border-radius:10px;border:1px solid rgba(240,238,232,0.1);font-size:12px;color:#7A7870;">
             No lists yet \u2014 <a href="${DASHBOARD_URL}" target="_blank" style="color:${PURPLE};text-decoration:none;">create one in the dashboard \u2197</a>
           </div>`}
    </div>

    <!-- \u2500\u2500 Quick actions: analytics + share \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
    <div class="quick-actions">
      <a href="${DASHBOARD_URL}" target="_blank" rel="noopener noreferrer" class="quick-btn" id="btn-analytics">
        \u{1F4CA} Analytics
      </a>
      <button class="quick-btn" id="btn-share" ${!shareUrl ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ""}>
        \u{1F517} Share list
      </button>
    </div>

    <!-- \u2500\u2500 Product preview \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
    ${product ? `
      <div style="
        margin:12px 14px 0;padding:10px;border-radius:10px;
        border:1px solid rgba(240,238,232,0.07);background:#141418;
        display:flex;align-items:center;gap:10px;
      ">
        ${product.imageUrl ? `<img src="${escHtml(product.imageUrl)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0;">` : `<div style="width:44px;height:44px;border-radius:6px;background:#1C1C22;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;">\u{1F6CD}\uFE0F</div>`}
        <div style="min-width:0;flex:1;">
          <p style="margin:0;font-size:12px;font-weight:600;color:#F0EEE8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${escHtml(product.title ?? "Product")}
          </p>
          ${product.price ? `<p style="margin:2px 0 0;font-size:11px;color:#4EC99A;font-weight:600;">${formatPrice(product.price)}</p>` : ""}
        </div>
      </div>
    ` : `
      <div style="
        margin:12px 14px 0;padding:10px 12px;border-radius:10px;
        border:1px dashed rgba(240,238,232,0.1);text-align:center;
      ">
        <p style="margin:0;font-size:12px;color:#7A7870;">
          Navigate to a product page to save an item.
        </p>
      </div>
    `}

    <!-- \u2500\u2500 Save button \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
    <div style="padding:12px 14px;">
      <button id="btn-save" ${!product || !hasLists ? "disabled" : ""} style="
        width:100%;padding:11px;border-radius:999px;border:none;
        background:${!product || !hasLists ? "#1C1C22" : PURPLE};
        color:${!product || !hasLists ? "#7A7870" : "#fff"};
        font-size:13px;font-weight:700;
        cursor:${!product || !hasLists ? "not-allowed" : "pointer"};
        letter-spacing:-0.01em;font-family:inherit;transition:opacity 120ms ease;
      ">
        \u{1F381} Save to wishlist
      </button>
      <p id="save-status" style="margin:8px 0 0;font-size:11px;text-align:center;color:#7A7870;min-height:14px;"></p>
    </div>
  `);
    el("btn-signout").addEventListener("click", handleSignOut);
    if (hasLists) {
      wireListSelector(wishlists, activeList, user);
    }
    if (shareUrl) {
      el("btn-share")?.addEventListener("click", () => handleShare(shareUrl));
    }
    const saveBtn = el("btn-save");
    if (saveBtn && product && hasLists) {
      saveBtn.addEventListener("click", () => handleSaveItem(user, wishlists, activeList, product));
    }
    el("root").__listData = { wishlists, lastWishlist };
    el("root").__product = product;
    el("root").__publicUser = publicUsername;
    el("root").__user = user;
  }
  function wireListSelector(wishlists, activeList, user) {
    let isOpen = false;
    const trigger = el("ls-trigger");
    const menu = el("ls-menu");
    function openMenu() {
      isOpen = true;
      trigger?.classList.add("open");
      menu?.classList.add("open");
      trigger?.setAttribute("aria-expanded", "true");
    }
    function closeMenu() {
      isOpen = false;
      trigger?.classList.remove("open");
      menu?.classList.remove("open");
      trigger?.setAttribute("aria-expanded", "false");
    }
    trigger?.addEventListener("click", (e) => {
      e.stopPropagation();
      isOpen ? closeMenu() : openMenu();
    });
    document.addEventListener("click", (e) => {
      if (isOpen && !el("list-selector")?.contains(e.target)) closeMenu();
    }, { once: false });
    menu?.addEventListener("click", async (e) => {
      const item = e.target.closest("[data-list-id]");
      if (item) {
        const listId = item.dataset.listId;
        const chosen = wishlists.find((w) => w.id === listId);
        if (!chosen) return;
        closeMenu();
        await setLastUsedWishlist(user.id, chosen);
        const root = el("root");
        renderSignedIn(
          root.__user,
          { wishlists, lastWishlist: chosen },
          root.__product,
          root.__publicUser
        );
        return;
      }
      if (e.target.closest("#ls-create-new")) {
        closeMenu();
        chrome.tabs.create({ url: `${DASHBOARD_URL}#new-list` });
      }
    });
  }
  async function handleSignIn() {
    const btn = el("btn-signin");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Signing in\u2026";
    }
    const result = await signIn();
    if (result.error) {
      render(`
      <div style="padding:24px;text-align:center;color:#E24B4A;font-size:13px;">
        ${escHtml(result.error)}
        <br><br>
        <button id="btn-retry" style="
          padding:8px 16px;border-radius:999px;
          border:1px solid rgba(240,238,232,0.12);
          background:transparent;color:#7A7870;font-size:12px;
          cursor:pointer;font-family:inherit;
        ">Try again</button>
      </div>
    `);
      el("btn-retry")?.addEventListener("click", () => renderSignedOut());
      return;
    }
    await initSignedIn(result.user);
  }
  async function handleSignOut() {
    await signOut();
    renderSignedOut();
  }
  async function handleShare(url) {
    try {
      await navigator.clipboard.writeText(url);
      const btn = el("btn-share");
      if (btn) {
        btn.classList.add("copied");
        btn.textContent = "\u2713 Copied!";
        setTimeout(() => {
          btn.classList.remove("copied");
          btn.textContent = "\u{1F517} Share list";
        }, 2e3);
      }
    } catch {
      chrome.tabs.create({ url });
    }
  }
  async function handleSaveItem(user, wishlists, activeList, product) {
    const saveBtn = el("btn-save");
    const statusEl = el("save-status");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving\u2026";
    }
    const { error } = await withAuth(
      (token) => saveItem(
        user.id,
        {
          title: product.title ?? "Saved item",
          price: product.price ?? null,
          imageUrl: product.imageUrl ?? null,
          sourceUrl: product.url ?? "",
          currency: product.currency ?? "USD"
        },
        token,
        activeList?.id ?? null
      )
    );
    if (error) {
      if (statusEl) {
        statusEl.style.color = "#E24B4A";
        statusEl.textContent = error.message ?? "Save failed.";
      }
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "\u{1F381} Save to wishlist";
      }
      return;
    }
    if (statusEl) {
      statusEl.style.color = "#4EC99A";
      statusEl.textContent = "\u2713 Saved!";
    }
    if (saveBtn) saveBtn.textContent = "\u2713 Saved!";
    setTimeout(() => {
      if (saveBtn) {
        saveBtn.textContent = "\u{1F381} Save to wishlist";
        saveBtn.disabled = false;
      }
      if (statusEl) statusEl.textContent = "";
    }, 2e3);
  }
  async function initSignedIn(user) {
    const [listResult, product, publicUsername] = await Promise.all([
      withAuth((token) => getWishlists(user.id, token)),
      detectProduct(),
      withAuth((token) => getPublicUsername(user.id, token))
    ]);
    const wishlists = listResult.data ?? listResult.wishlists ?? [];
    const lastWishlist = await getLastUsedWishlist(user.id);
    renderSignedIn(user, { wishlists, lastWishlist }, product, publicUsername);
  }
  async function detectProduct() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || tab.url.startsWith("chrome://")) return null;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["product-extractor.js"]
      });
      const result = results?.[0]?.result;
      if (!result || !result.title) return null;
      return result;
    } catch {
      return null;
    }
  }
  async function boot() {
    renderLoading();
    const cachedUser = await getCachedUser();
    if (!cachedUser) {
      renderSignedOut();
      return;
    }
    await initSignedIn(cachedUser);
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
