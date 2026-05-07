function decodeTampermonkeyValue(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  const tag = value[0];
  const raw = value.slice(1);
  if (tag === 's') return raw;
  if (tag === 'n') return Number(raw);
  if (tag === 'b') return raw === 'true' || raw === '1';
  if (tag === 'o' || tag === 'a') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return value;
}

function normalizeBackup(data) {
  const src = data && typeof data === 'object' && data.data && typeof data.data === 'object' ? data.data : data;
  const out = {};
  for (const [k, v] of Object.entries(src || {})) out[k] = decodeTampermonkeyValue(v);

  // Popcorn historically asks for a hosting NP site via prompt and stores it as host_link.
  // For extension mode, derive it from the backed-up settings so first run can work without prompt.
  if (!out.host_link) {
    let list = out.setting_host_list;
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch { list = null; }
    }
    const chosen = out.setting_host;
    if (list && chosen && list[chosen]) out.host_link = list[chosen];
  }
  return out;
}


const AUTO_FEED_DEFAULT_QUICK_SEARCH_LIST = ["<a href=\"https://passthepopcorn.me/torrents.php?searchstr={imdbid}\" target=\"_blank\">PTP</a>", "<a href=\"https://beyond-hd.me/torrents?search={imdbid}\" target=\"_blank\">BHD</a>", "<a href=\"https://ptchdbits.co/torrents.php?incldead=0&spstate=0&inclbookmarked=0&search={imdbid}&search_area=4&search_mode=0\" target=\"_blank\">CHD</a>", "<a href=\"https://audiences.me/torrents.php?cat401=1&cat402=1&cat403=1&incldead=0&spstate=0&inclbookmarked=0&search={imdbid}&search_area=4\" target=\"_blank\">ADE</a>", "<a href=\"https://greatposterwall.com/torrents.php?searchstr={imdbid}\" target=\"_blank\">GPW</a>", "<a href=\"https://broadcasthe.net/torrents.php?action=advanced&searchstr=&searchtags=&tags_type=1&groupdesc=&imdbid={imdbid}\" target=\"_blank\">BTN</a>", "<a href=\"https://search.douban.com/movie/subject_search?search_text={imdbid}&cat=1002\" target=\"_blank\">豆瓣</a>"];
const AUTO_FEED_DEFAULT_QUICK_SEARCH_KEYS = ["PTP", "BHD", "CHD", "ADE", "GPW", "BTN", "豆瓣"];

const AUTO_FEED_CLEAN_SITE_ORDER = ["Audiences", "BHD", "BTN", "CHDBits", "GPW", "HDB", "KG", "MTeam", "OPS", "OurBits", "PTP", "RED", "TTG"];
const AUTO_FEED_CLEAN_SITE_INFO = {
  "Audiences": {
    "url": "https://audiences.me/",
    "enable": 0
  },
  "BHD": {
    "url": "https://beyond-hd.me/",
    "enable": 0
  },
  "BTN": {
    "url": "https://broadcasthe.net/",
    "enable": 0
  },
  "CHDBits": {
    "url": "https://ptchdbits.co/",
    "enable": 0
  },
  "GPW": {
    "url": "https://greatposterwall.com/",
    "enable": 0
  },
  "HDB": {
    "url": "https://hdbits.org/",
    "enable": 0
  },
  "KG": {
    "url": "https://karagarga.in/",
    "enable": 0
  },
  "MTeam": {
    "url": "https://kp.m-team.cc/",
    "enable": 0
  },
  "OPS": {
    "url": "https://orpheus.network/",
    "enable": 0
  },
  "OurBits": {
    "url": "https://ourbits.club/",
    "enable": 0
  },
  "PTP": {
    "url": "https://passthepopcorn.me/",
    "enable": 0
  },
  "RED": {
    "url": "https://redacted.sh/",
    "enable": 0
  },
  "TTG": {
    "url": "https://totheglory.im/",
    "enable": 0
  }
};

function parseAutoFeedJsonValue(value, fallback) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return fallback; } }
  return value && typeof value === 'object' ? value : fallback;
}

async function cleanupStoredSiteLibrary() {
  try {
    const data = await chrome.storage.local.get(['used_site_info','site_order','__auto_feed_hidden_sites']);
    const current = parseAutoFeedJsonValue(data.used_site_info, {}) || {};
    const cleaned = {};
    for (const key of AUTO_FEED_CLEAN_SITE_ORDER) {
      const old = current[key] && typeof current[key] === 'object' ? current[key] : {};
      cleaned[key] = { ...AUTO_FEED_CLEAN_SITE_INFO[key], enable: old.enable === 1 ? 1 : 0 };
    }
    await chrome.storage.local.set({
      used_site_info: JSON.stringify(cleaned),
      site_order: JSON.stringify(AUTO_FEED_CLEAN_SITE_ORDER.join(',')),
      __auto_feed_hidden_sites: JSON.stringify('')
    });
  } catch (e) {
    console.warn('[Popcorn] could not clean site library:', e);
  }
}
const AUTO_FEED_OLD_QUICK_SEARCH_KEYS = ["PTP", "BHD", "GPW", "BLU", "TTG", "MTeam", "KG"];

function quickSearchKeyFromHtml(html) {
  const text = String(html || '');
  const nameMatch = text.match(/>([^<>]+)<\/a>/i);
  const name = (nameMatch ? nameMatch[1] : '').trim().toLowerCase();
  const hrefMatch = text.match(/href=["']([^"']+)/i);
  const href = (hrefMatch ? hrefMatch[1] : '').toLowerCase();
  const map = { ptp:'PTP', bhd:'BHD', chd:'CHD', chdbits:'CHD', ade:'ADE', audiences:'ADE', gpw:'GPW', btn:'BTN', douban:'豆瓣', '豆瓣':'豆瓣' };
  if (map[name]) return map[name];
  if (href.includes('passthepopcorn')) return 'PTP';
  if (href.includes('beyond-hd')) return 'BHD';
  if (href.includes('chdbits') || href.includes('chddiy')) return 'CHD';
  if (href.includes('audiences')) return 'ADE';
  if (href.includes('greatposterwall')) return 'GPW';
  if (href.includes('broadcasthe')) return 'BTN';
  if (href.includes('douban.com')) return '豆瓣';
  return '';
}

function parseCsvLike(value) {
  let parsed = value;
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch {} }
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'string') return parsed.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function normalizeQuickSearchStorageValue(value) {
  const lines = parseCsvLike(value);
  const keys = lines.map(quickSearchKeyFromHtml).filter(Boolean);
  const hasNewDefault = AUTO_FEED_DEFAULT_QUICK_SEARCH_KEYS.every(k => keys.includes(k));
  const looksLikeOldDefault = AUTO_FEED_OLD_QUICK_SEARCH_KEYS.every(k => keys.includes(k)) && !keys.includes('CHD') && !keys.includes('ADE') && !keys.includes('BTN') && !keys.includes('豆瓣');
  if (!lines.length || looksLikeOldDefault) return JSON.stringify(AUTO_FEED_DEFAULT_QUICK_SEARCH_LIST.join(','));
  return JSON.stringify(lines.map(line => String(line)
    .replace('https://beyond-hd.me/torrents?search={imdbid}', 'https://beyond-hd.me/torrents?search={imdbid}')
    .replace('https://beyond-hd.me/torrents?search={imdbid}', 'https://beyond-hd.me/torrents?search={imdbid}')
    .replace(/https:\/\/beyond-hd\.me\/torrents\?[^\"']*\{imdbid\}[^\"']*/g, 'https://beyond-hd.me/torrents?search={imdbid}')
    .replace('https://broadcasthe.net/torrents.php?searchstr={imdbid}', 'https://broadcasthe.net/torrents.php?action=advanced&searchstr=&searchtags=&tags_type=1&groupdesc=&imdbid={imdbid}')
    .replace('https://broadcasthe.net/torrents.php?action=advanced&searchstr=&searchtags=&tags_type=1&groupdesc=&imdbid={imdbid}', 'https://broadcasthe.net/torrents.php?action=advanced&searchstr=&searchtags=&tags_type=1&groupdesc=&imdbid={imdbid}')
    .replace(/https:\/\/chdbits\.co\/torrents\.php\?search=\{imdbid\}&search_area=4&search_mode=0/g, 'https://ptchdbits.co/torrents.php?incldead=0&spstate=0&inclbookmarked=0&search={imdbid}&search_area=4&search_mode=0')
    .replace(/https:\/\/chdbits\.co\/torrents\.php\?[^"']*\{imdbid\}[^"']*/g, 'https://ptchdbits.co/torrents.php?incldead=0&spstate=0&inclbookmarked=0&search={imdbid}&search_area=4&search_mode=0')
  ).join(','));
}

async function migrateQuickSearchStorage() {
  const data = await chrome.storage.local.get(['used_search_list','used_common_sites']);
  const normalized = normalizeQuickSearchStorageValue(data.used_search_list);
  const updates = { used_search_list: normalized };
  const keys = parseCsvLike(JSON.parse(normalized)).map(quickSearchKeyFromHtml).filter(Boolean);
  updates.used_common_sites = JSON.stringify(Array.from(new Set(keys)).join(','));
  await chrome.storage.local.set(updates);
}

function normalizeShowSearchStorageValue(value) {
  let parsed = value;
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { parsed = {}; } }
  parsed = parsed && typeof parsed === 'object' ? parsed : {};
  return JSON.stringify({ PTP: parsed.PTP !== 0 ? 1 : 0, BHD: parsed.BHD !== 0 ? 1 : 0, CHD: parsed.CHD !== 0 ? 1 : 0, ADE: parsed.ADE !== 0 ? 1 : 0, GPW: parsed.GPW !== 0 ? 1 : 0, BTN: parsed.BTN !== 0 ? 1 : 0, '豆瓣': parsed['豆瓣'] !== 0 && parsed.Douban !== 0 ? 1 : 0 });
}

async function migrateShowSearchStorage() {
  const data = await chrome.storage.local.get('show_search_urls');
  const normalized = normalizeShowSearchStorageValue(data.show_search_urls);
  if (data.show_search_urls !== normalized) await chrome.storage.local.set({ show_search_urls: normalized });
}

function disableForwardSitesByDefault(data) {
  try {
    let info = data && data.used_site_info;
    if (typeof info === 'string') { try { info = JSON.parse(info); } catch { info = null; } }
    if (info && typeof info === 'object') {
      for (const site of Object.values(info)) {
        if (site && typeof site === 'object') site.enable = 0;
      }
      data.used_site_info = JSON.stringify(info);
    }
  } catch (e) {}
  return data;
}

async function disableForwardSitesInStorage() {
  try {
    const data = await chrome.storage.local.get('used_site_info');
    let info = data.used_site_info;
    if (typeof info === 'string') { try { info = JSON.parse(info); } catch { info = null; } }
    if (!info || typeof info !== 'object') return;
    for (const site of Object.values(info)) {
      if (site && typeof site === 'object') site.enable = 0;
    }
    await chrome.storage.local.set({ used_site_info: JSON.stringify(info) });
  } catch (e) {
    console.warn('[Popcorn] could not disable default forward sites:', e);
  }
}

async function importInitialStorage(force = false) {
  const flag = await chrome.storage.local.get('__auto_feed_imported');
  if (flag.__auto_feed_imported && !force) return;
  try {
    const url = chrome.runtime.getURL('data/auto_feed.storage.json');
    const raw = await fetch(url).then(r => r.json());
    const data = disableForwardSitesByDefault(normalizeBackup(raw));
    if (data.show_search_urls !== undefined) data.show_search_urls = normalizeShowSearchStorageValue(data.show_search_urls);
    await chrome.storage.local.set({ ...data, __auto_feed_imported: true, __auto_feed_version: '0.25.0' });
  } catch (e) {
    await chrome.storage.local.set({ __auto_feed_imported: true, __auto_feed_version: '0.25.0', __auto_feed_import_error: String(e && e.message || e) });
  }
}

async function maybeOpenOptions(details) {
  try {
    const qs = new URLSearchParams({ firstRun: '1', reason: details && details.reason || 'manual' });
    if (details && (details.reason === 'install' || details.reason === 'update')) {
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html?' + qs.toString()) });
    }
  } catch (e) {
    console.warn('[auto_feed extension] could not open options page:', e);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await importInitialStorage(false);
  await disableForwardSitesInStorage();
  await cleanupStoredSiteLibrary();
  await migrateShowSearchStorage();
  await migrateQuickSearchStorage();
  await maybeOpenOptions(details);
});

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

const KEEPALIVE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function keepaliveRecentlySucceeded(site) {
  if (!site || !site.lastSuccessAt) return false;
  const last = Date.parse(site.lastSuccessAt);
  if (!Number.isFinite(last)) return false;
  return Date.now() - last < KEEPALIVE_INTERVAL_MS;
}

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve) => {
    if (!tabId) return resolve(false);
    let done = false;
    const cleanup = (ok) => {
      if (done) return;
      done = true;
      try { chrome.tabs.onUpdated.removeListener(listener); } catch (_) {}
      clearTimeout(timer);
      resolve(!!ok);
    };
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo && changeInfo.status === 'complete') cleanup(true);
    };
    const timer = setTimeout(() => cleanup(false), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    try {
      chrome.tabs.get(tabId).then(tab => {
        if (tab && tab.status === 'complete') cleanup(true);
      }).catch(() => cleanup(false));
    } catch (_) {}
  });
}

async function runKeepalive(force = false) {
  const cfg = await chrome.storage.local.get([
    '__auto_feed_keepalive_enabled',
    '__auto_feed_keepalive_sites',
    '__auto_feed_keepalive_last_date',
    '__auto_feed_keepalive_autoclose',
    '__auto_feed_keepalive_close_delay'
  ]);
  if (!force && !cfg.__auto_feed_keepalive_enabled) return { count:0, skipped:'disabled' };
  const today = todayKey();
  const sites = Array.isArray(cfg.__auto_feed_keepalive_sites) ? cfg.__auto_feed_keepalive_sites : [];
  const closeDelay = Math.max(1, Math.min(30, Number(cfg.__auto_feed_keepalive_close_delay || 2))) * 1000;
  const autoclose = cfg.__auto_feed_keepalive_autoclose === undefined ? true : !!cfg.__auto_feed_keepalive_autoclose;
  const opened = [];
  const skipped = [];
  let changed = false;

  for (const site of sites) {
    if (!site || site.enabled === false || !/^https?:\/\//i.test(String(site.url || ''))) continue;
    if (!force && keepaliveRecentlySucceeded(site)) {
      skipped.push(site.name || site.url);
      continue;
    }
    const now = new Date().toISOString();
    site.lastAttemptAt = now;
    site.lastStatus = 'running';
    site.lastError = '';
    changed = true;
    try {
      const tab = await chrome.tabs.create({ url: site.url, active: false });
      if (tab && tab.id) opened.push(tab.id);
      const loaded = await waitForTabComplete(tab && tab.id, 45000);
      const doneAt = new Date().toISOString();
      if (loaded) {
        site.lastSuccessAt = doneAt;
        site.lastSuccessDate = today;
        site.lastStatus = 'success';
      } else {
        site.lastStatus = 'timeout';
        site.lastError = '页面加载超时或无响应';
      }
      if (autoclose && tab && tab.id) setTimeout(() => chrome.tabs.remove(tab.id).catch(()=>{}), closeDelay);
    } catch (e) {
      site.lastStatus = 'failed';
      site.lastError = e && e.message ? e.message : String(e || '访问失败');
      console.warn('[auto_feed keepalive] failed:', site.url, e);
    }
  }
  await chrome.storage.local.set({
    __auto_feed_keepalive_sites: sites,
    __auto_feed_keepalive_last_date: today,
    __auto_feed_keepalive_last_interval_days: 7,
    __auto_feed_keepalive_last_count: opened.length,
    __auto_feed_keepalive_last_run: new Date().toISOString()
  });
  return { count: opened.length, skippedCount: skipped.length, skipped };
}

chrome.runtime.onStartup.addListener(async () => {
  await importInitialStorage(false);
  await cleanupStoredSiteLibrary();
  await migrateShowSearchStorage();
  await migrateQuickSearchStorage();
  try { await runKeepalive(false); } catch (e) { console.warn('[auto_feed keepalive] startup failed:', e); }
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

const AUTO_FEED_ALLOWED_HOSTS = [
  "audiences.me",
  "backup.landof.tv",
  "beyond-hd.me",
  "broadcasthe.net",
  "douban.com",
  "greatposterwall.com",
  "hdbits.org",
  "imdb.com",
  "karagarga.in",
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

const BASE_LIBS = [
  'libs/jquery.js',
  'libs/jquery-ui.js',
  'libs/popper.min.js',
  'libs/tippy-bundle.umd.js',
  'libs/imgCheckbox2.js'
];


function shouldSkipAutoFeedInjectionUrl(url) {
  try {
    const href = String(url || '');
    if (!/^https?:\/\//i.test(href)) return true;
    if (/(?:\.(?:rss|atom|xml)(?:[?#]|$)|\/feed(?:\.(?:rss|xml|atom))?(?:[?#]|$))/i.test(href)) return true;
  } catch (e) {
    return true;
  }
  return false;
}

function shouldLoadMusicHelper(url) {
  return /(?:redacted\.ch|orpheus\.network|dicmusic\.club|open\.cd|lemonhd\.org|notwhat|waffles|d3si)/i.test(url || '')
    && /(?:upload|request|torrent|plugin_upload|upload_music)/i.test(url || '');
}

function sanitizeHeaders(headers = {}) {
  const forbidden = new Set(['host','origin','referer','user-agent','content-length','cookie','cookie2','connection','accept-encoding']);
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (!forbidden.has(String(k).toLowerCase())) out[k] = v;
  }
  return out;
}

function deserializeBody(body) {
  if (!body || body.kind === 'empty') return undefined;
  if (body.kind === 'text') return body.text;
  if (body.kind === 'arrayBuffer') return new Uint8Array(body.bytes || []).buffer;
  if (body.kind === 'blob') return new Blob([new Uint8Array(body.bytes || [])], { type: body.type || '' });
  if (body.kind === 'formData') {
    const fd = new FormData();
    for (const e of body.entries || []) {
      if (e.isBlob) fd.append(e.key, new Blob([new Uint8Array(e.bytes || [])], { type:e.type || '' }), e.name || 'blob');
      else fd.append(e.key, e.value == null ? '' : String(e.value));
    }
    return fd;
  }
  return undefined;
}

function headersToString(headers) {
  let s = '';
  headers.forEach((v, k) => { s += `${k}: ${v}\r\n`; });
  return s;
}

async function injectAutoFeed(sender, href) {
  if (shouldSkipAutoFeedInjectionUrl(href || (sender && sender.url) || '')) {
    return { skipped: true, reason: 'non_html_or_feed' };
  }
  if (!sender || !sender.tab || typeof sender.tab.id !== 'number') {
    throw new Error('missing sender tab for injection');
  }
  const target = { tabId: sender.tab.id, frameIds: [sender.frameId || 0] };
  const initStorage = await chrome.storage.local.get(null);
  if (!initStorage.host_link) {
    try {
      const u = new URL(href || sender.url || '');
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        initStorage.host_link = u.origin + '/usercp.php?action=personal';
      }
    } catch (e) {}
  }
  const extensionBase = chrome.runtime.getURL('');

  await chrome.scripting.executeScript({
    target,
    world: 'MAIN',
    func: (init) => {
      window.__AUTO_FEED_EXT_INIT__ = init;
      window.__AUTO_FEED_EXT_INJECTED__ = window.__AUTO_FEED_EXT_INJECTED__ || false;
    },
    args: [{ storage: initStorage, extensionBase }]
  });

  await chrome.scripting.insertCSS({ target, files: ['libs/jquery-ui.css'] });

  const files = ['content/page_shim.js', ...BASE_LIBS];
  if (shouldLoadMusicHelper(href)) files.push('libs/music-helper.js');
  files.push('content/auto_feed.wrapper.js');
  files.push('content/popcorn_fixes.js');

  await chrome.scripting.executeScript({ target, world: 'MAIN', files });
  return true;
}

function normalizeTransmissionRpcUrl(url) {
  url = String(url || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  try {
    const u = new URL(url);
    if (!/\/transmission\/rpc\/?$/i.test(u.pathname)) {
      u.pathname = (u.pathname.replace(/\/+$/, '') || '') + '/transmission/rpc';
    }
    return u.href;
  } catch (e) {
    return '';
  }
}

function transmissionAuthHeader(username, password) {
  username = String(username || '');
  password = String(password || '');
  if (!username && !password) return '';
  try { return 'Basic ' + btoa(username + ':' + password); } catch (e) { return ''; }
}

async function transmissionRpcCall(config, body) {
  const rpcUrl = normalizeTransmissionRpcUrl(config && config.rpcUrl);
  if (!rpcUrl) throw new Error('Transmission RPC 地址无效');
  const headers = { 'Content-Type': 'application/json' };
  const auth = transmissionAuthHeader(config.username, config.password);
  if (auth) headers.Authorization = auth;
  const doFetch = async () => {
    try {
      return await fetch(rpcUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        credentials: 'include',
        redirect: 'follow'
      });
    } catch (e) {
      throw new Error('无法连接 Transmission RPC：' + (e && e.message ? e.message : String(e)) + '。请检查地址是否可访问、远程访问/白名单是否开启、端口是否正确。');
    }
  };
  let res = await doFetch();
  if (res.status === 409) {
    const sid = res.headers.get('X-Transmission-Session-Id');
    if (!sid) throw new Error('Transmission 返回 409，但没有 Session ID');
    headers['X-Transmission-Session-Id'] = sid;
    res = await doFetch();
  }
  const text = await res.text();
  if (!res.ok) throw new Error('Transmission RPC HTTP ' + res.status + ': ' + text.slice(0, 200));
  let json = null;
  try { json = JSON.parse(text); } catch (e) { throw new Error('Transmission RPC 返回不是 JSON: ' + text.slice(0, 200)); }
  if (json.result && json.result !== 'success') throw new Error(json.result);
  return json;
}

async function testTransmissionRpc(payload) {
  const json = await transmissionRpcCall(payload || {}, { method: 'session-get', arguments: {} });
  const args = json && json.arguments || {};
  return { version: args.version || '', rpcVersion: args['rpc-version'] || '' };
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchTorrentAsBase64(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('torrent 下载链接无效');
  const res = await fetch(url, { method:'GET', credentials:'include', redirect:'follow' });
  if (!res.ok) throw new Error('下载 torrent 失败：HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  if (!buf || buf.byteLength < 16) throw new Error('下载到的 torrent 文件为空或无效');
  return bytesToBase64(new Uint8Array(buf));
}

async function addTorrentToTransmission(payload) {
  const store = await chrome.storage.local.get([
    '__popcorn_tm_enabled',
    '__popcorn_tm_rpc_lan',
    '__popcorn_tm_rpc_wan',
    '__popcorn_tm_rpc_mode',
    '__popcorn_tm_username',
    '__popcorn_tm_password',
    '__popcorn_tm_download_dir',
    '__popcorn_tm_movie_dir',
    '__popcorn_tm_tv_dir'
  ]);
  if (!store.__popcorn_tm_enabled) throw new Error('Transmission 推送未启用');
  const mode = store.__popcorn_tm_rpc_mode === 'wan' ? 'wan' : 'lan';
  const rpcUrl = mode === 'wan' ? store.__popcorn_tm_rpc_wan : store.__popcorn_tm_rpc_lan;
  const metainfo = await fetchTorrentAsBase64(payload && payload.torrentUrl);
  const args = { metainfo };
  const target = payload && payload.target === 'tv' ? 'tv' : 'movie';
  const legacyDir = String(store.__popcorn_tm_download_dir || '').trim();
  const movieDir = String(store.__popcorn_tm_movie_dir || legacyDir || '').trim();
  const tvDir = String(store.__popcorn_tm_tv_dir || '').trim();
  const dir = target === 'tv' ? tvDir : movieDir;
  if (dir) args['download-dir'] = dir;
  const json = await transmissionRpcCall({
    rpcUrl,
    username: store.__popcorn_tm_username,
    password: store.__popcorn_tm_password
  }, { method:'torrent-add', arguments: args });
  const a = json.arguments || {};
  if (a['torrent-duplicate']) return { status:'duplicate', name:a['torrent-duplicate'].name || '' };
  if (a['torrent-added']) return { status:'added', name:a['torrent-added'].name || '' };
  return { status:'success' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) return { ok:false, error:'missing message type' };

    if (msg.type === 'inject_auto_feed') {
      await importInitialStorage(false);
      await migrateShowSearchStorage();
      await migrateQuickSearchStorage();
      await injectAutoFeed(sender, msg.payload && msg.payload.href);
      return { ok:true, data:true };
    }

    if (msg.type === 'open_options') {
      await chrome.runtime.openOptionsPage();
      return { ok:true, data:true };
    }

    if (msg.type === 'xhr') {
      const d = msg.payload || {};
      const controller = new AbortController();
      let timer = null;
      if (d.timeout) timer = setTimeout(() => controller.abort(), d.timeout);
      const init = {
        method: d.method || 'GET',
        headers: sanitizeHeaders(d.headers),
        body: deserializeBody(d.data),
        credentials: 'include',
        redirect: 'follow',
        signal: controller.signal
      };
      const res = await fetch(d.url, init);
      if (timer) clearTimeout(timer);
      const responseHeaders = headersToString(res.headers);
      const mimeType = res.headers.get('content-type') || '';
      let responseText = '';
      let response = null;
      let responseBytes = null;
      if (d.responseType === 'blob' || d.responseType === 'arraybuffer') {
        const buf = await res.arrayBuffer();
        responseBytes = Array.from(new Uint8Array(buf));
      } else if (d.responseType === 'json') {
        responseText = await res.text();
        try { response = JSON.parse(responseText); } catch { response = null; }
      } else {
        responseText = await res.text();
        response = responseText;
      }
      return { ok:true, data:{ status:res.status, statusText:res.statusText, responseHeaders, responseText, response, responseBytes, mimeType, finalUrl:res.url, readyState:4 } };
    }

    if (msg.type === 'download') {
      const d = msg.payload || {};
      const id = await chrome.downloads.download({ url:d.url, filename:d.name || d.filename, saveAs:!!d.saveAs });
      return { ok:true, data:id };
    }

    if (msg.type === 'clipboard') {
      return { ok:false, error:'Clipboard fallback not available in MV3 service worker.' };
    }

    if (msg.type === 'transmission_test') {
      const result = await testTransmissionRpc(msg.payload || {});
      return { ok:true, data:result };
    }

    if (msg.type === 'transmission_add') {
      const result = await addTorrentToTransmission(msg.payload || {});
      return { ok:true, data:result };
    }

    if (msg.type === 'run_keepalive') {
      const result = await runKeepalive(!!(msg.payload && msg.payload.force));
      return { ok:true, data:result };
    }

    if (msg.type === 'reset_storage') {
      await chrome.storage.local.clear();
      await importInitialStorage(true);
      await migrateShowSearchStorage();
      await migrateQuickSearchStorage();
      return { ok:true, data:true };
    }

    return { ok:false, error:'unknown message type: ' + msg.type };
  })().then((resp) => {
    try { sendResponse(resp); } catch (e) {}
  }).catch((e) => {
    try { sendResponse({ ok:false, error:String(e && e.message || e) }); } catch (ignore) {}
  });
  return true;
});
