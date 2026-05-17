// Isolated-world bridge. No inline script injection: page-world files are injected by the
// extension service worker via chrome.scripting.executeScript({ world: 'MAIN' }).
(() => {

const AUTO_FEED_ALLOWED_HOSTS = [
  "audiences.me",
  "backup.landof.tv",
  "beyond-hd.me",
  "broadcasthe.net",
  "douban.com",
  "greatposterwall.com",
  "imdb.com",
  "kp.m-team.cc",
  "m.douban.com",
  "movie.douban.com",
  "orpheus.network",
  "ourbits.club",
  "passthepopcorn.me",
  "ptchdbits.co",
  "redacted.ch",
  "redacted.sh",
  "search.douban.com",
  "totheglory.im",
  "www.douban.com",
  "www.imdb.com",
  "zp.m-team.io"
];

function autoFeedHostAllowed(url) {
  try {
    const host = new URL(String(url || location.href || '')).hostname.toLowerCase();
    return AUTO_FEED_ALLOWED_HOSTS.some((domain) => host === domain || host.endsWith('.' + domain));
  } catch (e) {
    return false;
  }
}

  if (window.__AUTO_FEED_EXT_BRIDGE_INSTALLED__) return;
  window.__AUTO_FEED_EXT_BRIDGE_INSTALLED__ = true;

  function shouldSkipAutoFeedInjection() {
    try {
      const href = String(location.href || '');
      if (!autoFeedHostAllowed(href)) return true;
      if (/(?:\.(?:rss|atom|xml)(?:[?#]|$)|\/feed(?:\.(?:rss|xml|atom))?(?:[?#]|$))/i.test(href)) return true;
      const contentType = String(document.contentType || '');
      if (contentType && !/html|xhtml/i.test(contentType)) return true;
      const rootName = document.documentElement && document.documentElement.nodeName;
      if (rootName && !/^html$/i.test(rootName)) return true;
    } catch (e) {}
    return false;
  }

  function parseCsvJsonForAllowed(value) {
    if (value == null || value === '') return [];
    let v = value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} }
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return v.split(',').map(x => x.trim()).filter(Boolean);
    return [];
  }

  function hrefFromQuickHtml(html) {
    const m = String(html || '').match(/href=["']([^"']+)/i);
    return m ? m[1] : '';
  }

  async function autoFeedHostAllowedDynamic(url) {
    if (autoFeedHostAllowed(url)) return true;
    try {
      const host = new URL(String(url || location.href || '')).hostname.toLowerCase();
      const data = await chrome.storage.local.get(['used_search_list']);
      const lines = parseCsvJsonForAllowed(data.used_search_list);
      for (const line of lines) {
        const href = hrefFromQuickHtml(line);
        if (!href) continue;
        try {
          const u = new URL(href.replace(/\{[^}]+\}/g, 'tt0000000'));
          const h = u.hostname.toLowerCase();
          if (host === h || host.endsWith('.' + h) || h.endsWith('.' + host)) return true;
        } catch (e) {}
      }
    } catch (e) {}
    return false;
  }

  async function shouldSkipAutoFeedInjectionAsync() {
    try {
      const href = String(location.href || '');
      if (!(await autoFeedHostAllowedDynamic(href))) return true;
      if (/(?:\.(?:rss|atom|xml)(?:[?#]|$)|\/feed(?:\.(?:rss|xml|atom))?(?:[?#]|$))/i.test(href)) return true;
      const contentType = String(document.contentType || '');
      if (contentType && !/html|xhtml/i.test(contentType)) return true;
      const rootName = document.documentElement && document.documentElement.nodeName;
      if (rootName && !/^html$/i.test(rootName)) return true;
    } catch (e) { return true; }
    return false;
  }

  async function continueAutoFeedInjection() {
  try {
    const u = new URL(location.href);
    if (u.hostname === 'beyond-hd.me' && /^\/(library\/title|torrents\/)/i.test(u.pathname)) {
      document.documentElement.classList.add('popcorn-bhd-suppress-search');
      const st = document.createElement('style');
      st.id = 'popcorn-bhd-prehide-search-urls';
      st.textContent = [
        'html.popcorn-bhd-suppress-search .search_urls{visibility:hidden!important}',
        'html.popcorn-bhd-suppress-search #forward_r .search_urls,html.popcorn-bhd-suppress-search .popcorn-bhd-allow-search{visibility:visible!important}'
      ].join('\n');
      (document.head || document.documentElement).appendChild(st);
    }
  } catch (e) {}


  function runtimeSend(type, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) return resolve({ ok:false, error:String(err.message || err) });
          resolve(resp || { ok:true });
        });
      } catch (e) {
        resolve({ ok:false, error:String(e && e.message || e) });
      }
    });
  }

  window.addEventListener('auto_feed_ext_request', async (event) => {
    const req = event.detail || {};
    let resp;
    try {
      if (req.type === 'storage_set') {
        await chrome.storage.local.set({ [req.payload.key]: req.payload.value });
        resp = { ok:true, data:true };
      } else if (req.type === 'storage_remove') {
        await chrome.storage.local.remove(req.payload.key);
        resp = { ok:true, data:true };
      } else {
        resp = await runtimeSend(req.type, req.payload);
      }
    } catch (e) {
      resp = { ok:false, error:String(e && e.message || e) };
    }
    try {
      window.dispatchEvent(new CustomEvent('auto_feed_ext_response', { detail: { id:req.id, response:resp } }));
    } catch (e) {
      console.error('[auto_feed extension] failed to dispatch response:', e);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const delta = {};
    for (const [k, v] of Object.entries(changes)) delta[k] = v.newValue;
    try {
      window.dispatchEvent(new CustomEvent('auto_feed_ext_storage_changed', { detail: delta }));
    } catch (e) {
      console.error('[auto_feed extension] failed to dispatch storage change:', e);
    }
  });

  chrome.runtime.sendMessage({ type: 'inject_auto_feed', payload: { href: location.href } }, (resp) => {
    const err = chrome.runtime.lastError;
    if (err) {
      console.error('[auto_feed extension] inject request failed:', err.message || err);
      return;
    }
    if (!resp || resp.ok === false) {
      console.error('[auto_feed extension] inject failed:', resp && resp.error || resp);
      return;
    }
    console.debug('[auto_feed extension] loaded');
  });
  }

  shouldSkipAutoFeedInjectionAsync().then((skip) => {
    if (!skip) continueAutoFeedInjection();
  }).catch((e) => console.debug('[auto_feed extension] dynamic allow check failed', e));
})();
