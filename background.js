// Popcorn configuration policy:
// - data/auto_feed.storage.json is the only packaged configuration file.
// - It is imported only on a true first install, and only when storage is empty.
// - Startup, reload, injection and extension updates never seed, normalize, migrate,
//   repair or restore user configuration values.
// - After installation, chrome.storage.local is the only runtime source of user settings.

async function loadPackagedConfiguration() {
  const url = chrome.runtime.getURL('data/auto_feed.storage.json');
  const raw = await fetch(url).then((r) => {
    if (!r.ok) throw new Error('configuration HTTP ' + r.status);
    return r.json();
  });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('configuration root must be an object');
  }
  return raw;
}

async function importConfigurationOnFirstInstall(details) {
  if (!details || details.reason !== 'install') return false;
  const existing = await chrome.storage.local.get(null);
  if (existing && Object.keys(existing).length) return false;
  const config = await loadPackagedConfiguration();
  await chrome.storage.local.set(config);
  return true;
}

async function maybeOpenOptions(details) {
  try {
    const qs = new URLSearchParams({ firstRun: details && details.reason === 'install' ? '1' : '0', reason: details && details.reason || 'manual' });
    if (details && (details.reason === 'install' || details.reason === 'update')) {
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html?' + qs.toString()) });
    }
  } catch (e) {
    console.warn('[auto_feed extension] could not open options page:', e);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details && details.reason === 'install') {
    try {
      await importConfigurationOnFirstInstall(details);
    } catch (e) {
      console.error('[Popcorn] first-install configuration import failed:', e);
    }
  }
  await maybeOpenOptions(details);
});

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function keepaliveRecentlySucceeded(site, intervalDays) {
  if (!site || !site.lastSuccessAt) return false;
  const days = Number(intervalDays);
  if (!Number.isFinite(days) || days <= 0) return false;
  const last = Date.parse(site.lastSuccessAt);
  if (!Number.isFinite(last)) return false;
  return Date.now() - last < days * 24 * 60 * 60 * 1000;
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


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyTabLoggedIn(tabId) {
  if (!tabId) return { ok:false, reason:'没有可校验的标签页' };
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const url = location.href;
        const path = location.pathname.toLowerCase();
        const bodyText = (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 20000);
        const html = (document.documentElement && document.documentElement.innerHTML || '').slice(0, 50000);
        const lowerText = bodyText.toLowerCase();
        const lowerHtml = html.toLowerCase();

        const loginPath = /\/(login|signin|takelogin|account-login|auth|oauth|sso)(\.php|\/|$|\?)/i.test(path);
        const passwordInput = !!document.querySelector('input[type="password"], input[name*="password" i], input[id*="password" i]');
        const loginForm = !!document.querySelector('form[action*="login" i], form[action*="takelogin" i], form[action*="signin" i]');
        const loginButtonText = /(登录|登入|sign in|log in|login|password|密码|验证码|captcha|two[- ]?factor|2fa|passkey)/i.test(bodyText);
        const explicitLoggedOut = /(not logged in|please log in|please login|sign in to|你还没有登录|请先登录|请登录|未登录|游客|guest)/i.test(bodyText);

        const logoutLink = !!document.querySelector('a[href*="logout" i], a[href*="logoff" i], a[href*="signout" i], a[href*="sign-out" i], form[action*="logout" i]');
        const userAreaLink = !!document.querySelector([
          'a[href*="userdetails" i]',
          'a[href*="usercp" i]',
          'a[href*="my.php" i]',
          'a[href*="profile" i]',
          'a[href*="messages" i]',
          'a[href*="inbox" i]',
          'a[href*="mybonus" i]',
          'a[href*="bonus" i]',
          'a[href*="torrents.php" i]',
          'a[href*="upload.php" i]'
        ].join(','));
        const ptLoggedInText = /(logout|log out|退出|登出|注销|控制面板|个人中心|用户中心|我的账户|我的账号|收件箱|站内信|魔力值|做种积分|分享率|上传量|下载量|ratio|uploaded|downloaded|bonus|invite)/i.test(bodyText);
        const loggedInByCookieUI = lowerHtml.includes('logout.php') || lowerHtml.includes('userdetails.php') || lowerHtml.includes('usercp.php');

        if (loginPath || passwordInput || loginForm || explicitLoggedOut) {
          return { ok:false, url, reason:'页面仍显示登录/密码/验证码/未登录信息' };
        }
        if (logoutLink || loggedInByCookieUI || (userAreaLink && ptLoggedInText)) {
          return { ok:true, url, reason:'页面显示已登录入口/退出登录/用户信息' };
        }
        if (ptLoggedInText && !loginButtonText) {
          return { ok:true, url, reason:'页面显示 PT 用户状态信息' };
        }
        return { ok:false, url, reason:'未检测到明确的已登录特征' };
      }
    });
    const data = result && result[0] && result[0].result;
    return data && typeof data === 'object' ? data : { ok:false, reason:'校验脚本没有返回结果' };
  } catch (e) {
    return { ok:false, reason:e && e.message ? e.message : String(e || '登录状态校验失败') };
  }
}

async function runKeepalive(force = false) {
  const cfg = await chrome.storage.local.get([
    '__auto_feed_keepalive_enabled',
    '__auto_feed_keepalive_sites',
    '__auto_feed_keepalive_last_date',
    '__auto_feed_keepalive_autoclose',
    '__auto_feed_keepalive_close_delay',
    '__popcorn_keepalive_interval_days'
  ]);
  if (!force && !cfg.__auto_feed_keepalive_enabled) return { count:0, skipped:'disabled' };
  const today = todayKey();
  const sites = Array.isArray(cfg.__auto_feed_keepalive_sites) ? cfg.__auto_feed_keepalive_sites : [];
  const intervalDays = Number(cfg.__popcorn_keepalive_interval_days);
  const delaySeconds = Number(cfg.__auto_feed_keepalive_close_delay);
  const closeDelay = Number.isFinite(delaySeconds) && delaySeconds >= 0 ? Math.min(30, delaySeconds) * 1000 : 0;
  const autoclose = !!cfg.__auto_feed_keepalive_autoclose;
  const opened = [];
  const skipped = [];
  let changed = false;

  for (const site of sites) {
    if (!site || site.enabled === false || !/^https?:\/\//i.test(String(site.url || ''))) continue;
    if (!force && keepaliveRecentlySucceeded(site, intervalDays)) {
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
        await sleep(1500);
        const loginCheck = await verifyTabLoggedIn(tab && tab.id);
        if (loginCheck.ok) {
          site.lastSuccessAt = doneAt;
          site.lastSuccessDate = today;
          site.lastStatus = 'success';
          site.lastError = loginCheck.reason || '';
        } else {
          site.lastStatus = 'unauth';
          site.lastError = loginCheck.reason || '未确认真实登录，未记为成功';
        }
      } else {
        site.lastStatus = 'timeout';
        site.lastError = '页面加载超时或无响应，未确认真实登录';
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
    __auto_feed_keepalive_last_interval_days: Number.isFinite(intervalDays) ? intervalDays : 0,
    __auto_feed_keepalive_last_count: opened.length,
    __auto_feed_keepalive_last_run: new Date().toISOString()
  });
  return { count: opened.length, skippedCount: skipped.length, skipped };
}

chrome.runtime.onStartup.addListener(async () => {
  // Never import or normalize configuration on browser startup.
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

  // The timeout covers one complete RPC attempt, including the normal 409
  // Session-Id handshake. Torrent push timers start only after the .torrent
  // has already been downloaded, read and converted to Base64.
  const configuredTimeout = Number(config && config.timeoutMs);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.max(1000, configuredTimeout)
    : 15000;
  const controller = new AbortController();
  const externalSignal = config && config.signal;
  let abortedByExternal = false;
  const abortFromExternal = () => {
    abortedByExternal = true;
    try { controller.abort(); } catch (e) { /* ignore */ }
  };
  if (externalSignal && typeof externalSignal.addEventListener === 'function') {
    if (externalSignal.aborted) abortFromExternal();
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const doFetch = async () => fetch(rpcUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
    redirect: 'follow',
    signal: controller.signal
  });

  try {
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
  } catch (e) {
    if (controller.signal.aborted || (e && e.name === 'AbortError')) {
      if (abortedByExternal) throw new Error('Transmission RPC 已取消');
      throw new Error('Transmission RPC 请求超时（' + Math.round(timeoutMs / 1000) + '秒）');
    }
    if (e && /^Transmission /.test(String(e.message || ''))) throw e;
    throw new Error('无法连接 Transmission RPC：' + (e && e.message ? e.message : String(e)) + '。请检查地址是否可访问、远程访问/白名单是否开启、端口是否正确。');
  } finally {
    clearTimeout(timer);
    if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
      try { externalSignal.removeEventListener('abort', abortFromExternal); } catch (e) { /* ignore */ }
    }
  }
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
    '__popcorn_tm_rpc_lan',
    '__popcorn_tm_rpc_wan',
    '__popcorn_tm_username',
    '__popcorn_tm_password',
    '__popcorn_tm_movie_dir',
    '__popcorn_tm_tv_dir'
  ]);

  // 先完整获取一次种子：下载 .torrent -> 读取 -> Base64。
  // 只有 metainfo 准备好以后，LAN/WAN 的 RPC 超时计时才开始。
  const metainfo = await fetchTorrentAsBase64(payload && payload.torrentUrl);
  const args = { metainfo };
  const target = payload && payload.target === 'tv' ? 'tv' : 'movie';
  const movieDir = String(store.__popcorn_tm_movie_dir || '').trim();
  const tvDir = String(store.__popcorn_tm_tv_dir || '').trim();
  const dir = target === 'tv' ? tvDir : movieDir;
  if (dir) args['download-dir'] = dir;

  const configured = [];
  if (payload && payload.address === 'wan') {
    configured.push({ type: 'wan', url: store.__popcorn_tm_rpc_wan, timeoutMs: 15000 });
  } else if (payload && payload.address === 'lan') {
    configured.push({ type: 'lan', url: store.__popcorn_tm_rpc_lan, timeoutMs: 15000 });
  } else {
    // 默认同时向 LAN / WAN 发起 torrent-add：
    // LAN / WAN 都最多等待 15 秒；任意一个成功就立即算成功，
    // 并取消仍在等待的另一个请求。只有两边都失败才返回失败。
    configured.push({ type: 'lan', url: store.__popcorn_tm_rpc_lan, timeoutMs: 15000 });
    configured.push({ type: 'wan', url: store.__popcorn_tm_rpc_wan, timeoutMs: 15000 });
  }

  const addresses = configured.filter((addr) => addr.url && String(addr.url).trim() !== '');
  if (!addresses.length) throw new Error('没有可用的 Transmission RPC 地址');

  const controllers = new Map();
  const errors = [];
  let settled = false;

  const runOne = async (addr) => {
    const cancelController = new AbortController();
    controllers.set(addr.type, cancelController);
    const json = await transmissionRpcCall({
      rpcUrl: addr.url,
      username: store.__popcorn_tm_username,
      password: store.__popcorn_tm_password,
      timeoutMs: addr.timeoutMs,
      signal: cancelController.signal
    }, { method:'torrent-add', arguments: args });
    const a = json.arguments || {};
    if (a['torrent-duplicate']) return { status:'duplicate', name:a['torrent-duplicate'].name || '', address:addr.type };
    if (a['torrent-added']) return { status:'added', name:a['torrent-added'].name || '', address:addr.type };
    return { status:'success', address:addr.type };
  };

  return await new Promise((resolve, reject) => {
    let pending = addresses.length;
    for (const addr of addresses) {
      runOne(addr).then((result) => {
        if (settled) return;
        settled = true;
        // 先返回的成功地址已经完成 torrent-add；另一条只是同一 NAS 的备用路径，
        // 立即取消，避免继续占用连接或重复提交。
        for (const [type, ctl] of controllers.entries()) {
          if (type !== addr.type) {
            try { ctl.abort(); } catch (e) { /* ignore */ }
          }
        }
        resolve(result);
      }).catch((err) => {
        if (settled) return;
        errors.push({ address: addr.type, error: err });
        pending -= 1;
        if (pending <= 0) {
          settled = true;
          const detail = errors.map((item) => item.address + ': ' + (item.error && item.error.message ? item.error.message : String(item.error))).join('；');
          reject(new Error('局域网和外网都推送失败' + (detail ? '：' + detail : '')));
        }
      });
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) return { ok:false, error:'missing message type' };

    if (msg.type === 'inject_auto_feed') {
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

    return { ok:false, error:'unknown message type: ' + msg.type };
  })().then((resp) => {
    try { sendResponse(resp); } catch (e) {}
  }).catch((e) => {
    try { sendResponse({ ok:false, error:String(e && e.message || e) }); } catch (ignore) {}
  });
  return true;
});
