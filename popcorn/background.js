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
  await migrateShowSearchStorage();
  await migrateQuickSearchStorage();
  await maybeOpenOptions(details);
});

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
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
  if (!force && cfg.__auto_feed_keepalive_last_date === today) return { count:0, skipped:'already_ran_today' };
  const sites = Array.isArray(cfg.__auto_feed_keepalive_sites) ? cfg.__auto_feed_keepalive_sites : [];
  const enabled = sites.filter(x => x && x.enabled !== false && /^https?:\/\//i.test(String(x.url || '')));
  const closeDelay = Math.max(5, Math.min(120, Number(cfg.__auto_feed_keepalive_close_delay || 20))) * 1000;
  const autoclose = cfg.__auto_feed_keepalive_autoclose === undefined ? true : !!cfg.__auto_feed_keepalive_autoclose;
  const opened = [];
  for (const site of enabled) {
    try {
      const tab = await chrome.tabs.create({ url: site.url, active: false });
      opened.push(tab.id);
      if (autoclose && tab.id) setTimeout(() => chrome.tabs.remove(tab.id).catch(()=>{}), closeDelay);
    } catch (e) {
      console.warn('[auto_feed keepalive] failed:', site.url, e);
    }
  }
  await chrome.storage.local.set({ __auto_feed_keepalive_last_date: today, __auto_feed_keepalive_last_count: opened.length, __auto_feed_keepalive_last_run: new Date().toISOString() });
  return { count: opened.length, tabIds: opened };
}

chrome.runtime.onStartup.addListener(async () => {
  await importInitialStorage(false);
  await migrateShowSearchStorage();
  await migrateQuickSearchStorage();
  try { await runKeepalive(false); } catch (e) { console.warn('[auto_feed keepalive] startup failed:', e); }
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

const BASE_LIBS = [
  'libs/jquery.js',
  'libs/jquery-ui.js',
  'libs/popper.min.js',
  'libs/tippy-bundle.umd.js',
  'libs/imgCheckbox2.js'
];

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
