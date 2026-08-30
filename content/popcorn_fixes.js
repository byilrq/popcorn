// Popcorn extension site-specific fixes loaded after the original userscript.
// Keeps the upstream userscript mostly intact while patching browser-extension compatibility gaps.
(() => {
  if (window.__POPCORN_FIXES_V40__) return;
  window.__POPCORN_FIXES_V40__ = true;

  const $ = window.jQuery || window.$;
  const DOUBAN_PREFIX = 'https://movie.douban.com/subject/';

  try {
    const st = document.createElement('style');
    st.textContent = [
      '.popcorn-bhd-quick-search{display:none!important}',
      '.search_urls.popcorn-dark-search-urls{color:#c7ccd1!important}',
      '.search_urls.popcorn-dark-search-urls a,.search_urls.popcorn-dark-search-urls a:link,.search_urls.popcorn-dark-search-urls a:visited,.search_urls.popcorn-dark-search-urls a:hover,.search_urls.popcorn-dark-search-urls a:active{color:#d7dbe0!important;text-decoration:none!important;font-weight:600!important}',
      '.search_urls.popcorn-dark-search-urls .popcorn-dark-search-links{color:#c7ccd1!important}',
      'html.popcorn-bhd-suppress-search .search_urls{visibility:hidden!important}',
      'html.popcorn-bhd-suppress-search #forward_r .search_urls,html.popcorn-bhd-suppress-search .popcorn-bhd-allow-search{visibility:visible!important}'
    ].join('\n');
    document.documentElement.appendChild(st);
  } catch (_) {}

  const DEFAULT_QUICK_SEARCH = [
    '<a href="https://passthepopcorn.me/torrents.php?searchstr={imdbid}" target="_blank">PTP</a>',
    '<a href="https://beyond-hd.me/torrents?search={imdbid}" target="_blank">BHD</a>',
    '<a href="https://blutopia.cc/torrents?imdbid={imdbno}&perPage=25&imdbId={imdbno}" target="_blank">BLU</a>',
    '<a href="https://ptchdbits.co/torrents.php?incldead=0&spstate=0&inclbookmarked=0&search={imdbid}&search_area=4&search_mode=0" target="_blank">CHD</a>',
    '<a href="https://audiences.me/torrents.php?cat401=1&cat402=1&cat403=1&incldead=0&spstate=0&inclbookmarked=0&search={imdbid}&search_area=4" target="_blank">ADE</a>',
    '<a href="https://greatposterwall.com/torrents.php?searchstr={imdbid}" target="_blank">GPW</a>',
    '<a href="https://broadcasthe.net/torrents.php?action=advanced&searchstr=&searchtags=&tags_type=1&groupdesc=&imdbid={imdbid}" target="_blank">BTN</a>',
    '<a href="https://search.douban.com/movie/subject_search?search_text={imdbid}&cat=1002" target="_blank">豆瓣</a>'
  ];

  function text(v) { return v == null ? '' : String(v); }
  function unique(arr) { return Array.from(new Set(arr.filter(Boolean))); }
  function parseCsvJson(v, fallback) {
    let x = v;
    if (typeof x === 'string') { try { x = JSON.parse(x); } catch (_) {} }
    if (Array.isArray(x)) return x;
    if (typeof x === 'string') return x.split(',').map(s => s.trim()).filter(Boolean);
    return fallback || [];
  }
  function quickSearchList() {
    try { return parseCsvJson(window.GM_getValue('used_search_list'), DEFAULT_QUICK_SEARCH); }
    catch (_) { return DEFAULT_QUICK_SEARCH; }
  }
  function request(url, responseType) {
    return new Promise((resolve, reject) => {
      try {
        window.GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: responseType || 'text',
          headers: { 'Accept': responseType === 'json' ? 'application/json,text/plain,*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
          onload: (res) => resolve(res),
          onerror: reject,
          ontimeout: reject
        });
      } catch (e) { reject(e); }
    });
  }
  async function fetchResponseText(url) {
    const res = await request(url, 'text');
    return { status: Number(res && res.status || 0), text: text(res && (res.responseText || res.response) || '') };
  }
  async function fetchText(url) {
    return (await fetchResponseText(url)).text;
  }
  async function fetchJson(url) {
    const raw = await fetchText(url);
    try { return JSON.parse(raw); } catch (_) { return null; }
  }
  function cacheGetJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function cacheSetJson(key, value) {
    try { if (value) localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch (_) {}
  }
  function clearExpiredDoubanCache() {
    try {
      const now = Date.now();
      const cacheExpiry = 3600000; // 1小时过期
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('popcorn_douban_')) {
          const cached = JSON.parse(localStorage.getItem(key) || 'null');
          if (cached && cached.at && (now - cached.at) > cacheExpiry) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch (_) {}
  }
  function parseHtml(html) { return new DOMParser().parseFromString(text(html), 'text/html'); }
  function firstNumber() {
    for (let i = 0; i < arguments.length; i++) {
      const m = text(arguments[i]).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
      if (m) return m[0];
    }
    return '';
  }
  function normalizeDoubanRating(value) {
    let s = text(value).trim();
    if (!s) return '';
    s = s.replace(/,/g, '');
    if (/^\d{2}$/.test(s)) {
      const n = Number(s);
      if (n > 10 && n <= 99) return (n / 10).toFixed(1).replace(/\.0$/, '');
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n > 10 && n <= 100) return (n / 10).toFixed(1).replace(/\.0$/, '');
    return String(n).replace(/\.0$/, '');
  }
  function doubanInfoFromHtml(html, id) {
    const doc = parseHtml(html);
    const ld = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map(x => x.textContent || '').join('\n');
    const body = doc.documentElement ? doc.documentElement.textContent || '' : '';
    const avg = normalizeDoubanRating(firstNumber(
      doc.querySelector('[property="v:average"]') && doc.querySelector('[property="v:average"]').textContent,
      doc.querySelector('strong.rating_num') && doc.querySelector('strong.rating_num').textContent,
      (ld.match(/"ratingValue"\s*:\s*"?([0-9.]+)/) || [])[1],
      (body.match(/评分[^0-9]{0,40}([0-9]+(?:\.[0-9]+)?)/) || [])[1]
    ));
    const votes = firstNumber(
      doc.querySelector('[property="v:votes"]') && doc.querySelector('[property="v:votes"]').textContent,
      doc.querySelector('.rating_people span') && doc.querySelector('.rating_people span').textContent,
      (ld.match(/"ratingCount"\s*:\s*"?([0-9,]+)/) || [])[1]
    );
    let title = '';
    const h1 = doc.querySelector('#content h1');
    if (h1) title = text(h1.textContent).replace(/\(豆瓣\)/, '').replace(/\(\d{4}\)/, '').trim();
    if (!title) title = text(doc.title).replace(/\(豆瓣\).*/, '').trim();
    let summary = '';
    const summaryEl = doc.querySelector('#link-report-intra [property="v:summary"], #link-report-intra .all.hidden, .related-info .indent span[property="v:summary"]');
    if (summaryEl) summary = text(summaryEl.textContent).replace(/\s+/g, ' ').trim();
    return { id, title, average: avg, votes, summary, url: id ? DOUBAN_PREFIX + id + '/' : '' };
  }
  async function doubanBySubjectId(id) {
    if (!id) return null;
    const cacheKey = 'popcorn_douban_subject_' + id;
    const cached = cacheGetJson(cacheKey);
    const mergeAndCache = (info) => {
      if (!info) return null;
      if (/429\s+Too\s+Many\s+Requests/i.test(info.title || '')) info.title = '';
      const merged = { ...(cached && cached.value || {}), ...info };
      if (!merged.title && cached && cached.value && cached.value.title) merged.title = cached.value.title;
      if (!merged.summary && cached && cached.value && cached.value.summary) merged.summary = cached.value.summary;
      if (!merged.average && cached && cached.value && cached.value.average) merged.average = cached.value.average;
      if (merged.average || merged.title || merged.summary) { cacheSetJson(cacheKey, merged); return merged; }
      return null;
    };
    try {
      const res = await fetchResponseText(DOUBAN_PREFIX + id + '/');
      if (res.status !== 429 && !/429\s+Too\s+Many\s+Requests/i.test(res.text.slice(0, 1000))) {
        const info = mergeAndCache(doubanInfoFromHtml(res.text, id));
        if (info && (info.average || info.title || info.summary)) return info;
      }
    } catch (_) {}
    try {
      const res = await fetchResponseText('https://m.douban.com/movie/subject/' + id + '/');
      if (res.status !== 429 && !/429\s+Too\s+Many\s+Requests/i.test(res.text.slice(0, 1000))) {
        const info = mergeAndCache(doubanInfoFromMobileHtml(res.text, id));
        if (info && (info.average || info.title || info.summary)) return info;
      }
    } catch (_) {}
    try {
      const info = mergeAndCache(await doubanBySuggestIdOnly(id));
      if (info && (info.average || info.title)) return info;
    } catch (_) {}
    return cached && cached.value ? cached.value : null;
  }
  function subjectIdFromText(raw) {
    const m = text(raw).match(/movie\.douban\.com\/subject\/(\d+)|\/subject\/(\d+)/);
    return m ? (m[1] || m[2]) : '';
  }
  async function doubanBySuggest(query) {
    if (!query) return null;
    const data = await fetchJson('https://movie.douban.com/j/subject_suggest?q=' + encodeURIComponent(query));
    if (Array.isArray(data) && data.length) {
      let item = data.find(x => x && (x.type === 'movie' || x.type === 'tv')) || data[0];
      const id = item && (item.id || subjectIdFromText(item.url));
      const itemRate = normalizeDoubanRating(firstNumber(item && (item.rate || item.rating || item.rating_value)));
      if (id) {
        const full = await doubanBySubjectId(id).catch(() => null);
        if (full) {
          // Douban subject pages can be partially rendered or blocked in extension requests.
          // The suggest API often still carries `rate`, so keep it as a fallback.
          if (!full.average && itemRate) full.average = itemRate;
          if (!full.title) full.title = item.title || item.name || '';
          return full;
        }
        return { id, title: item.title || item.name || '', average: itemRate, votes: '', summary: '', url: DOUBAN_PREFIX + id + '/' };
      }
    }
    return null;
  }
  async function doubanByMobileSearch(query) {
    if (!query) return null;
    const html = await fetchText('https://m.douban.com/search/?query=' + encodeURIComponent(query) + '&type=movie');
    const id = subjectIdFromText(html);
    if (!id) return null;
    const full = await doubanBySubjectId(id).catch(() => null) || { id, title:'', average:'', votes:'', summary:'', url:DOUBAN_PREFIX + id + '/' };
    if (!full.average) {
      const around = html.slice(Math.max(0, html.indexOf('/subject/' + id) - 800), html.indexOf('/subject/' + id) + 1200);
      full.average = normalizeDoubanRating(firstNumber(
        (around.match(/评分[^0-9]{0,40}([0-9]+(?:\.[0-9]+)?)/) || [])[1],
        (around.match(/rating[^0-9]{0,40}([0-9]+(?:\.[0-9]+)?)/i) || [])[1],
        (around.match(/([0-9]+(?:\.[0-9]+)?)\s*分/) || [])[1]
      ));
    }
    return full;
  }

  function extractImdbFromDoubanHtml(html) {
    return (text(html).match(/IMDb\s*:?\s*<[^>]*>\s*(tt\d{6,10})|IMDb\s*:?\s*(tt\d{6,10})|imdb\.com\/title\/(tt\d{6,10})/i) || []).slice(1).find(Boolean) || '';
  }
  async function doubanSeriesImdbFromTitle(titleHint) {
    const q = cleanSeriesTitleHint(titleHint);
    if (!q) return '';
    const cacheKey = 'popcorn_douban_series_imdb_' + q.toLowerCase();
    const cached = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
    if (cached) return cached;
    const queries = unique([q, q + ' 第一季', q + ' Season 1']);
    for (const query of queries) {
      const data = await fetchJson('https://movie.douban.com/j/subject_suggest?q=' + encodeURIComponent(query)).catch(() => null);
      const items = Array.isArray(data) ? data : [];
      for (const item of items.slice(0, 5)) {
        const id = item && (item.id || subjectIdFromText(item.url));
        const title = text(item && (item.title || item.name || ''));
        if (!id) continue;
        // Prefer season-one/base-series results, avoid obvious later seasons when possible.
        if (/第[二三四五六七八九十0-9]+季|Season\s*[2-9]/i.test(title) && !/第一季|Season\s*1/i.test(query)) continue;
        const res = await fetchResponseText(DOUBAN_PREFIX + id + '/').catch(() => null);
        if (!res || res.status === 429) continue;
        const imdb = extractImdbFromDoubanHtml(res.text);
        if (imdb) {
          try { sessionStorage.setItem(cacheKey, imdb); localStorage.setItem(cacheKey, imdb); } catch (_) {}
          return imdb;
        }
      }
    }
    return '';
  }

  function cleanTitleForSearch(raw) {
    return text(raw)
      .replace(/\|\s*豆瓣\[[^\]]+\]/g, '')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\b(1080p|2160p|720p|BluRay|WEB[- ]?DL|WEBRip|REMUX|x264|x265|H\.264|H\.265|HEVC|DDP?\d?\.\d|Atmos|HDR|DV|DoVi|REMUX|FraMeSToR)\b/ig, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  async function findDoubanInfo({ imdb, douban, title }) {
    const existingId = subjectIdFromText(douban || '');
    if (existingId) {
      const x = await doubanBySubjectId(existingId).catch(() => null);
      if (x && (x.average || x.title || x.summary)) return x;
    }
    const imdbId = text(imdb).match(/tt\d+/i)?.[0];
    if (imdbId) {
      const byImdb = await doubanBySuggest(imdbId).catch(() => null) || await doubanByMobileSearch(imdbId).catch(() => null);
      if (byImdb && (byImdb.average || byImdb.id)) return byImdb;
    }
    const q = cleanTitleForSearch(title || '');
    if (q) {
      const year = (text(title).match(/\b(19|20)\d{2}\b/) || [])[0];
      const queries = unique([q, year ? q + ' ' + year : '', q.replace(/\b(19|20)\d{2}\b/g, '').trim()]);
      for (const query of queries) {
        const found = await doubanBySuggest(query).catch(() => null) || await doubanByMobileSearch(query).catch(() => null);
        if (found && (found.average || found.id)) return found;
      }
    }
    return null;
  }
  function formatScore(info) {
    if (!info) return '暂无评分';
    const avg = normalizeDoubanRating(info.average);
    let score = avg ? (avg + '分') : '暂无评分';
    if (info.votes) score += '|' + String(info.votes).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '人';
    return score;
  }
  function findImdbInScope(scope) {
    const root = scope || document;
    try {
      const anchors = Array.from((root.querySelectorAll ? root.querySelectorAll('a[href*="imdb.com/title/tt"],a[href*="imdb.com/title/"]') : []) || []);
      for (const a of anchors) {
        const m = text(a.href || a.getAttribute('href') || '').match(/tt\d{6,10}/i);
        if (m) return m[0];
      }
    } catch (_) {}
    const html = text((scope && scope.innerHTML) || (document.body && document.body.innerHTML) || '');
    return (html.match(/tt\d{6,10}/i) || [])[0] || '';
  }

  function getPageImdbId(scope) {
    const root = scope || document;
    const chunks = [];
    try { chunks.push(location.href || ''); } catch (_) {}
    try { chunks.push(document.referrer || ''); } catch (_) {}
    for (const chunk of chunks) {
      const m = text(chunk).match(/tt\d{6,10}/i);
      if (m) return m[0];
    }
    try {
      const links = Array.from((root.querySelectorAll ? root.querySelectorAll('a[href]') : []) || []);
      const imdbLinks = links.filter(a => /imdb\.com\/title\/tt\d{6,10}/i.test(text(a.href || a.getAttribute('href') || '')));
      for (const a of imdbLinks) {
        const m = text(a.href || a.getAttribute('href') || '').match(/tt\d{6,10}/i);
        if (m) return m[0];
      }
      const labelLinks = links.filter(a => /\bIMDB\b/i.test(text(a.textContent || a.title || '')));
      for (const a of labelLinks) {
        const m = text(a.href || a.getAttribute('href') || '').match(/tt\d{6,10}/i);
        if (m) return m[0];
      }
    } catch (_) {}
    return findImdbInScope(root);
  }

  function waitForCondition(fn, timeoutMs, stepMs) {
    const timeout = timeoutMs || 12000;
    const step = stepMs || 250;
    return new Promise(resolve => {
      const start = Date.now();
      let done = false;
      let obs = null;
      const finish = v => {
        if (done) return;
        done = true;
        try { if (obs) obs.disconnect(); } catch (_) {}
        resolve(v || null);
      };
      const check = () => {
        let v = null;
        try { v = fn(); } catch (_) { v = null; }
        if (v) return finish(v);
        if (Date.now() - start >= timeout) return finish(null);
      };
      const timer = setInterval(() => { if (done) return clearInterval(timer); check(); }, step);
      try {
        obs = new MutationObserver(check);
        obs.observe(document.documentElement || document.body, { childList:true, subtree:true });
      } catch (_) {}
      check();
    });
  }
  function findDoubanHrefInScope(scope) {
    const el = (scope || document).querySelector && (scope || document).querySelector('a[href*="movie.douban.com/subject/"]');
    return el ? el.href : '';
  }

  async function fixBhdTitleDouban() {
    if (!location.href.match(/^https:\/\/beyond-hd\.me\/(library\/title|torrents\/)/i)) return;
    cleanupBhdTitleAndSearch();

    const inputDouban = Array.from(document.querySelectorAll('input, textarea'))
      .map(x => x.value || '')
      .find(v => /movie\.douban\.com\/subject\//.test(v));
    const douban = findDoubanHrefInScope(document) || inputDouban || '';
    const imdb = findImdbInScope(document.body);
    const titleEl = findBhdTitleElement();
    const titleText = titleEl ? titleEl.textContent : document.title;
    const info = await findDoubanInfo({ imdb, douban, title: titleText });
    if (!info || (!info.average && !info.title && !info.summary)) return;

    applyBhdTitleInfo(titleEl, info);
    applyBhdChineseSummary(info);
  }

  function findBhdTitleElement() {
    const candidates = Array.from(document.querySelectorAll('h1,h2,[class*="title" i],[class*="heading" i]'))
      .filter(el => {
        const t = (el.textContent || '').trim();
        if (t.length < 4 || t.length > 220) return false;
        if (/豆瓣信息|转发种子|Tools|Uploaded|Category|Discounts|FL Token|Internal/i.test(t)) return false;
        if (el.querySelector('input,textarea,button,select')) return false;
        return /\b(19|20)\d{2}\b|\|/.test(t) || el.tagName === 'H1' || el.tagName === 'H2';
      });
    if (!candidates.length) return document.querySelector('h1,h2');
    return candidates.sort((a,b) => (a.getBoundingClientRect().top - b.getBoundingClientRect().top))[0];
  }

  function stripBhdInjectedTitle(raw) {
    let s = text(raw).trim();
    // Remove older Popcorn/upstream duplicate Chinese score blocks, while keeping the original BHD title/year.
    s = s.replace(/\s*\|\s*[^|]{0,90}\[(?:暂无评分|[0-9.]+分(?:\|[\d,]+人)?)\]/g, '');
    s = s.replace(/\s*\|\s*豆瓣\[(?:暂无评分|[0-9.]+分(?:\|[\d,]+人)?)\]/g, '');
    return s.replace(/\s+\|\s+$/g, '').replace(/\s+/g, ' ').trim();
  }

  function cleanDoubanTitleForBhd(title) {
    let t = text(title).replace(/\(豆瓣\).*/g, '').replace(/\(\d{4}\).*/g, '').trim();
    if (/429\s+Too\s+Many\s+Requests/i.test(t)) return '';
    return t || '豆瓣';
  }

  function applyBhdTitleInfo(titleEl, info) {
    if (!titleEl || titleEl.dataset.popcornBhdTitleDone === '1') return;
    const current = titleEl.textContent || '';
    // If the upstream userscript already inserted a valid Chinese Douban title/score,
    // keep it. This avoids the later 429 fallback overwriting it.
    if (/[一-鿿][^|]{0,80}\[\d+(?:\.\d+)?分/.test(current) && !/429\s+Too\s+Many\s+Requests/i.test(current)) {
      titleEl.dataset.popcornBhdTitleDone = '1';
      return;
    }
    const base = stripBhdInjectedTitle(current);
    const label = cleanDoubanTitleForBhd(info.title);
    const score = formatScore(info);
    if (!label || /429\s+Too\s+Many\s+Requests/i.test(label)) return;
    titleEl.textContent = base + ' | ' + label + '[' + score + ']';
    titleEl.dataset.popcornBhdTitleDone = '1';
  }

  function applyBhdChineseSummary(info) {
    const summary = text(info && info.summary).replace(/\s+/g, ' ').trim();
    if (!summary || summary.length < 20) return;
    const selectors = [
      '.movie-overview', '.overview', '.synopsis', '.description', '[class*="overview" i]', '[class*="synopsis" i]', '[class*="description" i]', 'p'
    ];
    const nodes = unique(selectors.flatMap(sel => Array.from(document.querySelectorAll(sel))));
    const candidates = nodes.filter(el => {
      if (el.dataset.popcornBhdSummaryDone === '1') return false;
      if (el.querySelector('input,textarea,button,select,a')) return false;
      const t = (el.textContent || '').trim();
      if (t.length < 60 || t.length > 1400) return false;
      if (/豆瓣信息|转发种子|Uploaded|Category|Discounts|FL Token|Internal|快速搜索|Tools/i.test(t)) return false;
      const ascii = (t.match(/[A-Za-z]/g) || []).length;
      const cjk = (t.match(/[一-鿿]/g) || []).length;
      return ascii > cjk && ascii > 40;
    });
    const target = candidates.sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    if (target) {
      target.textContent = summary;
      target.dataset.popcornBhdSummaryDone = '1';
    }
  }


  function isBluDetailPage() {
    if (!isBluHost()) return false;
    try {
      const url = new URL(location.href);
      return /^\/torrents\/\d+(?:\/)?$/i.test(url.pathname) || /^\/torrents\/\d+\//i.test(url.pathname);
    } catch (_) { return /^https?:\/\/blutopia\.cc\/torrents\/\d+/i.test(location.href); }
  }

  function findBluTitleElement() {
    const selectors = ['h1','h2','.torrent-title','.movie-title','.page-title','.card-title','[class*="title" i]','[class*="heading" i]'];
    const candidates = unique(selectors.flatMap(sel => Array.from(document.querySelectorAll(sel)))).filter(el => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length < 3 || t.length > 240) return false;
      if (/豆瓣信息|快速搜索|Uploaded|Type|Category|Size|Files|Peers|Seeders|Leechers|Comments|Thanks/i.test(t)) return false;
      if (el.querySelector('input,textarea,button,select')) return false;
      return el.tagName === 'H1' || el.tagName === 'H2' || /\b(19|20)\d{2}\b|2160p|1080p|720p|BluRay|WEB|REMUX|UHD/i.test(t);
    });
    return candidates.sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || document.querySelector('h1,h2');
  }

  function stripBluInjectedTitle(raw) {
    return text(raw).replace(/\s*\|\s*[^|]{0,90}\[(?:暂无评分|[0-9.]+分(?:\|[\d,]+人)?)\]/g, '').replace(/\s+/g, ' ').trim();
  }

  function applyBluTitleInfo(titleEl, info) {
    if (!titleEl || titleEl.dataset.popcornBluTitleDone === '1') return;
    const current = titleEl.textContent || '';
    if (/[一-鿿][^|]{0,80}\[(?:暂无评分|\d+(?:\.\d+)?分)/.test(current) && !/429\s+Too\s+Many\s+Requests/i.test(current)) {
      titleEl.dataset.popcornBluTitleDone = '1';
      return;
    }
    const base = stripBluInjectedTitle(current);
    const label = cleanDoubanTitleForBhd(info && info.title).replace(/\s*\(.*?\)\s*$/g, '').trim();
    if (!label || /429\s+Too\s+Many\s+Requests/i.test(label)) return;
    const a = document.createElement('a');
    a.href = (info && info.url) || '#';
    a.target = '_blank';
    a.className = 'popcorn-blu-douban-score';
    a.style.cssText = 'margin-left:8px;text-decoration:none;font-weight:600;color:inherit;';
    a.textContent = ' | ' + label + '[' + formatScore(info) + ']';
    titleEl.textContent = base;
    titleEl.appendChild(a);
    titleEl.dataset.popcornBluTitleDone = '1';
  }

  function applyBluChineseSummary(info) {
    const summary = text(info && info.summary).replace(/\s+/g, ' ').trim();
    if (!summary || summary.length < 20) return;
    const selectors = ['.movie-overview','.overview','.synopsis','.description','.torrent-description','.bbcode-rendered','[class*="overview" i]','[class*="synopsis" i]','[class*="description" i]','p'];
    const nodes = unique(selectors.flatMap(sel => Array.from(document.querySelectorAll(sel))));
    const candidates = nodes.filter(el => {
      if (el.dataset.popcornBluSummaryDone === '1') return false;
      if (el.querySelector('input,textarea,button,select')) return false;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length < 40 || t.length > 1800) return false;
      if (/豆瓣信息|快速搜索|Uploaded|Category|Thanks|Comments|Files|Peers|Seeders|Leechers|Mediainfo/i.test(t)) return false;
      const ascii = (t.match(/[A-Za-z]/g) || []).length;
      const cjk = (t.match(/[一-鿿]/g) || []).length;
      return ascii > cjk && ascii > 30;
    });
    const target = candidates.sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    if (target) {
      target.textContent = summary;
      target.dataset.popcornBluSummaryDone = '1';
    }
  }

  let bluDoubanInfoPromise = null;
  function bluHasTitleInfo() {
    return !!document.querySelector('.popcorn-blu-douban-score') || /[一-鿿][^|]{0,80}\[(?:暂无评分|\d+(?:\.\d+)?分)/.test((document.querySelector('h1,h2') || {}).textContent || '');
  }
  function bluHasChineseSummary() {
    return !!document.querySelector('[data-popcorn-blu-summary-done="1"]');
  }
  async function getBluDoubanInfo(titleEl, clearCache = false) {
    if (clearCache) {
      bluDoubanInfoPromise = null;
    }
    if (bluDoubanInfoPromise) return bluDoubanInfoPromise;
    bluDoubanInfoPromise = (async () => {
      const imdb = await waitForCondition(() => getPageImdbId(document), 20000, 300);
      const douban = findDoubanHrefInScope(document);
      const titleText = titleEl ? titleEl.textContent : document.title;
      return await findDoubanInfo({ imdb, douban, title: titleText });
    })();
    return bluDoubanInfoPromise;
  }
  async function fixBluTitleDouban() {
    if (!isBluDetailPage()) return;
    const titleEl = await waitForCondition(() => findBluTitleElement(), 20000, 300);
    const info = await getBluDoubanInfo(titleEl).catch(() => null);
    if (!info || (!info.average && !info.title && !info.summary)) return;
    if (!bluHasTitleInfo()) applyBluTitleInfo(titleEl, info);
    if (!bluHasChineseSummary()) applyBluChineseSummary(info);
  }


  function cleanupBhdTitleAndSearch() {
    if (!location.href.match(/^https:\/\/beyond-hd\.me\/(?:library\/title(?:[\/?#]|$)|torrents(?:[\/?#]|$))/i)) return;

    // Remove quick-search snippets outside the original forwarding area. The upstream
    // script inserts the usable quick search inside #forward_r / 转发种子; later Popcorn
    // patches created a second floating/header row, so remove only those extras.
    const forward = document.querySelector('#forward_r') || findTextContainer('转发种子') || findTextContainer('Forward');
    Array.from(document.querySelectorAll('.popcorn-bhd-quick-search, .popcorn-forward-quick-holder')).forEach(el => {
      try { el.remove(); } catch (_) {}
    });
    Array.from(document.querySelectorAll('.search_urls')).forEach(el => {
      if (forward && forward.contains(el)) return;
      try { el.remove(); } catch (_) {}
    });
    if (forward) {
      const kept = Array.from(forward.querySelectorAll('.search_urls'));
      kept.forEach((el, idx) => { if (idx > 0) { try { el.remove(); } catch (_) {} } });
      const one = forward.querySelector('.search_urls');
      if (one) {
        one.classList.add('popcorn-bhd-allow-search');
        one.style.cssText += ';display:block!important;margin:6px 0 0 0!important;line-height:1.6!important;background:transparent!important;visibility:visible!important;';
      }
    }
  }


  function substituteQuick(html, imdb, title) {
    const imdbid = imdb || '';
    const imdbno = imdbid.replace(/^tt/i, '');
    const searchName = encodeURIComponent(cleanTitleForSearch(title || imdbid));
    return html
      .replace(/\{imdbid\}/g, encodeURIComponent(imdbid))
      .replace(/\{imdbno\}/g, encodeURIComponent(imdbno))
      .replace(/\{search_name\}/g, searchName)
      .replace(/\{searchname\}/g, searchName);
  }
  function quickBarHtml(imdb, title) {
    return '<span class="popcorn-bhd-quick-search" style="display:inline-block;margin-left:8px;font-size:13px;">快速搜索：' +
      quickSearchList().map(x => substituteQuick(x, imdb, title)).join(' | ') + '</span>';
  }
  function addBhdListSearch() {
    // Only for the BHD torrent list page. Detail pages get their quick search in the forward area below.
    if (!location.href.match(/^https:\/\/beyond-hd\.me\/torrents(?:\?|$)/i)) return;
    const rows = Array.from(document.querySelectorAll('tr, .torrent-card, .torrent-row, li')).slice(0, 300);
    rows.forEach(row => {
      if (row.dataset.popcornQuickAdded || row.querySelector('.popcorn-bhd-quick-search')) return;
      const imdb = findImdbInScope(row);
      if (!imdb) return;
      let target = row.querySelector('a[href*="/torrents/"], a[href*="/library/title/"], .torrent-name, .title') || row.querySelector('a');
      if (!target) return;
      const title = target.textContent || row.textContent || imdb;
      target.insertAdjacentHTML('afterend', quickBarHtml(imdb, title));
      row.dataset.popcornQuickAdded = '1';
    });
  }

  function cleanupBtnDuplicateTitles() {
    if (!location.href.match(/^https:\/\/(broadcasthe\.net|backup\.landof\.tv)\/series\.php\?id=\d+/i)) return;
    const seen = new Set();
    Array.from(document.querySelectorAll('h1,h2')).forEach(el => {
      const key = (el.textContent || '').replace(/\[[^\]]+\]/g, '').replace(/豆瓣\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) { try { el.remove(); } catch (_) {} }
      else seen.add(key);
    });
    const scores = Array.from(document.querySelectorAll('.popcorn-btn-douban-score'));
    scores.forEach((el, idx) => { if (idx > 0) { try { el.remove(); } catch (_) {} } });
  }

  async function fixBtnSeriesDouban() {
    if (!location.href.match(/^https:\/\/(broadcasthe\.net|backup\.landof\.tv)\/series\.php\?id=\d+/i)) return;
    cleanupBtnDuplicateTitles();
    document.querySelectorAll('a').forEach(a => {
      if ((a.textContent || '').trim() === '[Douban]') a.textContent = '[豆瓣]';
    });
    const titleEl = await waitForCondition(() => document.querySelector('h1, .series_title, #series_title, .page__title') || Array.from(document.querySelectorAll('div, span')).find(x => /\[豆瓣\]|\[IMDB\]|\[TMDB\]/.test(x.textContent || '')), 12000, 300);
    if (!titleEl || titleEl.dataset.popcornDoubanFixed) return;
    const imdb = await waitForCondition(() => getPageImdbId(document), 12000, 300);
    const douban = findDoubanHrefInScope(document);
    const titleText = cleanTitleForSearch((titleEl.textContent || document.title).replace(/\[豆瓣\]|\[Douban\]|\[IMDB\]|\[TMDB\]/g, ' '));
    const info = await findDoubanInfo({ imdb, douban, title: titleText });
    if (!info) return;
    titleEl.dataset.popcornDoubanFixed = '1';
    const a = document.createElement('a');
    a.href = info.url || douban || '#';
    a.target = '_blank';
    a.className = 'popcorn-btn-douban-score';
    a.style.cssText = 'margin-left:10px;font-size:0.78em;color:#d3d3d3;text-decoration:none;';
    const zhTitle = cleanDoubanTitleForBhd(info.title || '').replace(/\s*\(.*?\)\s*$/g, '').trim();
    const score = formatScore(info);
    a.textContent = zhTitle ? ` ${zhTitle}[${score}]` : ` 豆瓣[${score}]`;
    titleEl.appendChild(a);
  }

  function addGpwFallbackDisplay() {
    if (!location.href.match(/^https:\/\/greatposterwall\.com\//i)) return;
    // Legacy versions placed a quick-search-only box after the whole GPW torrent table and
    // labelled it as "转发种子". That was not a real transfer action. The real controls are
    // now mounted by auto_feed.wrapper.js inside the expanded single-torrent detail panel.
    document.querySelectorAll('.popcorn-gpw-forward').forEach(el => {
      try { el.remove(); } catch (_) {}
    });
  }


  function cleanupAllDoubanControls() {
    // 通用清理：移除所有站点转发面板中的豆瓣信息（网址）、检索名称、API、ptgen跳转、点击获取等冗余控件
    // 只保留"转发种子"等核心转发功能。这些控件在转发流程中基本无用，且影响页面加载和布局。
    const ids = ['input_box','search_button','douban_api','ptgen_button','douban_button','download_pngs','select_img'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      try {
        const parent = el.parentNode;
        el.remove();
        if (parent) {
          // 清理标签文本节点
          Array.from(parent.childNodes || []).forEach(n => {
            if (n.nodeType === 3 && /^\s*(API|API接口|豆瓣网址|检索名称|ptgen跳转|获取成功|转存截图)\s*$/i.test(n.nodeValue || '')) {
              try { n.remove(); } catch (_) {}
            }
          });
          // 清理 checkbox（douban_api 是 checkbox，可能 label 残留）
          Array.from(parent.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
            if (cb.id === 'douban_api' || (cb.parentNode === parent && !parent.querySelector('label[for="' + cb.id + '"]'))) {
              try { cb.remove(); } catch (_) {}
            }
          });
        }
      } catch (_) {}
    });
    // 按 value/文字匹配清理按钮
    Array.from(document.querySelectorAll('input[type="button"], button')).forEach(el => {
      const v = (el.value || el.textContent || '').trim();
      if (/^(检索名称|ptgen跳转|点击获取|获取成功|获取失败|获取中……|转存截图|处理中…)$/.test(v)) {
        try { el.remove(); } catch (_) {}
      }
    });
    // 清理"豆瓣信息"标签表结构（douban_box 中的左侧标签）
    document.querySelectorAll('td, th, div, span').forEach(el => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t === '豆瓣信息' && !el.querySelector('input, button, a, select, textarea')) {
        const row = el.closest('tr, .row, div');
        if (row) {
          try { row.remove(); } catch (_) {}
        } else {
          try { el.remove(); } catch (_) {}
        }
      }
    });
    // 清理残留的"API"文字标签（checkbox 旁边的文本节点）
    document.querySelectorAll('td, th, div, span, form').forEach(el => {
      Array.from(el.childNodes || []).forEach(n => {
        if (n.nodeType === 3) {
          let v = n.nodeValue || '';
          const orig = v;
          v = v.replace(/\s*\bAPI\b\s*/g, ' ').replace(/\s{2,}/g, ' ');
          if (v !== orig) n.nodeValue = v;
        }
      });
    });
  }


  function addChdDetailSearchFallback() {
    if (!/^https?:\/\/(ptchdbits\.co|[^\/]{1,8}\.chddiy\.xyz)\/details\.php/i.test(location.href)) return;
    if (document.querySelector('.search_urls, .popcorn-chd-detail-search')) return;
    const imdb = findImdbInScope(document.body);
    if (!imdb) return;
    const titleNode = document.querySelector('h1, .title, #top, a[href*="details.php"], td.embedded h1') || document.querySelector('td[colspan], table td');
    const title = cleanTitleForSearch((titleNode && titleNode.textContent) || document.title || imdb);
    const holder = document.createElement('div');
    holder.className = 'search_urls popcorn-chd-detail-search';
    holder.style.cssText = 'text-align:center;border:1px solid blue;margin:8px 0;padding:4px;line-height:1.6;';
    holder.innerHTML = '<font color="red">快速搜索：' + quickSearchList().map(x => substituteQuick(x, imdb, title)).join(' | ') + '</font>';
    const target = document.querySelector('#outer, #content, .main, table, body') || document.body;
    try { target.parentNode.insertBefore(holder, target.nextSibling); }
    catch (_) { document.body.insertBefore(holder, document.body.firstChild); }
  }


  function findTextContainer(label) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node && node.nodeValue && node.nodeValue.includes(label) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const node = walker.nextNode();
    if (!node) return null;
    return node.parentElement && (node.parentElement.closest('section, article, .card, .panel, .box, .container, .row, div, td') || node.parentElement);
  }

  function normalizeBhdForwardQuickSearch() {
    // v21: no custom BHD quick-search injection; only cleanup duplicate/header rows.
    cleanupBhdTitleAndSearch();
  }


  function cleanSeriesTitleHint(raw) {
    let q = text(raw || '')
      .replace(/\+/g, ' ')
      .replace(/%20/g, ' ')
      .replace(/第[一二三四五六七八九十0-9]+季/ig, ' ')
      .replace(/\bS\d{1,2}(?:E\d{1,2})?\b/ig, ' ')
      .replace(/\bSeason\s*\d+\b/ig, ' ')
      .replace(/\bEpisode\s*\d+\b/ig, ' ')
      .replace(/\b\d{4}\b/g, ' ')
      .replace(/[|｜].*$/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Prefer the English tail when available, e.g. "黑袍纠察队 The Boys" -> "The Boys".
    const en = q.match(/[A-Za-z][A-Za-z0-9:'’!?.&\- ]{2,}$/);
    if (en && en[0].trim().length >= 3) q = en[0].trim();
    return q;
  }

  function looksLikeSeriesTitle(raw) {
    const t = text(raw);
    return /第[一二三四五六七八九十0-9]+季|Season\s*\d+|\bS\d{1,2}(?:E\d{1,2})?\b|Episode\s*\d+|剧集|电视剧|迷你剧|限定剧/i.test(t);
  }


  function chineseSeasonNumber(raw) {
    const s = text(raw);
    const digit = s.match(/[0-9]+/);
    if (digit) return Number(digit[0]);
    const map = { '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10 };
    if (s === '十') return 10;
    if (s.startsWith('十')) return 10 + (map[s.slice(1)] || 0);
    if (s.includes('十')) {
      const parts = s.split('十');
      return (map[parts[0]] || 1) * 10 + (map[parts[1]] || 0);
    }
    return map[s] || 0;
  }

  function explicitSeasonNumber(raw) {
    const t = text(raw);
    let m = t.match(/第\s*([0-9]+)\s*季/i);
    if (m) return Number(m[1]);
    m = t.match(/第\s*([一二三四五六七八九十]+)\s*季/i);
    if (m) return chineseSeasonNumber(m[1]);
    m = t.match(/\bSeason\s*0*([0-9]+)\b/i);
    if (m) return Number(m[1]);
    m = t.match(/\bS0*([0-9]{1,2})(?:E\d{1,3})?\b/i);
    if (m) return Number(m[1]);
    return 0;
  }

  function isFirstSeasonSeriesTitle(raw) {
    const n = explicitSeasonNumber(raw);
    if (n === 1) return true;
    return /第一季|第\s*1\s*季|\bSeason\s*0?1\b|\bS0?1(?:E\d{1,3})?\b/i.test(text(raw));
  }

  function shouldNormalizeSeriesImdb(raw) {
    const n = explicitSeasonNumber(raw);
    // Only non-first seasons need IMDb normalization. First season must keep
    // Douban's own default IMDb ID; otherwise first-season searches can be
    // redirected to the wrong series-level IMDb title.
    return n > 1 && !isFirstSeasonSeriesTitle(raw);
  }

  function shouldRunSeriesSearchFlow(raw) {
    // The global decision layer deliberately separates two concepts:
    // 1) whether this title should enter the series-search handling pipeline;
    // 2) whether the IMDb ID should be replaced by a series/first-season ID.
    // First-season titles still need the pipeline because some targets (BTN, etc.)
    // require us to fill/submit an IMDb field, but they must use Douban's own IMDb.
    return looksLikeSeriesTitle(raw);
  }

  async function getSeriesSearchImdb(originalImdb, titleHint) {
    const original = (text(originalImdb).match(/tt\d{6,10}/i) || [''])[0] || '';
    if (!original) return '';
    if (!shouldRunSeriesSearchFlow(titleHint)) return original;
    if (!shouldNormalizeSeriesImdb(titleHint)) return original;
    return await resolveBtnSeriesImdbId(original, titleHint).catch(() => original) || original;
  }

  async function imdbSuggestSeriesId(titleHint) {
    const q = cleanSeriesTitleHint(titleHint);
    if (!q) return '';
    try {
      const first = encodeURIComponent(q[0].toLowerCase());
      const url = 'https://v3.sg.media-imdb.com/suggestion/' + first + '/' + encodeURIComponent(q) + '.json';
      const data = await fetchJson(url);
      const items = data && Array.isArray(data.d) ? data.d : [];
      const series = items.find(x => x && /^tt\d+$/i.test(x.id || '') && /series/i.test(String(x.q || x.ql || '')) && !/episode/i.test(String(x.q || x.ql || '')))
        || items.find(x => x && /^tt\d+$/i.test(x.id || '') && /tv series/i.test(String(x.s || '') + ' ' + String(x.l || '')))
        || items.find(x => x && /^tt\d+$/i.test(x.id || '') && !/episode/i.test(String(x.q || x.ql || x.s || '')));
      return series ? series.id : '';
    } catch (_) { return ''; }
  }

  async function resolveBtnSeriesImdbId(imdb, titleHint) {
    imdb = (text(imdb).match(/tt\d{6,10}/i) || [])[0] || '';
    if (!imdb) return '';
    if (!shouldNormalizeSeriesImdb(titleHint)) return imdb;
    try {
      const cacheKey = 'popcorn_btn_series_imdb_' + imdb + '_' + cleanSeriesTitleHint(titleHint).toLowerCase();
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) return cached;
      const fromDoubanSeries = await doubanSeriesImdbFromTitle(titleHint).catch(() => '');
      if (fromDoubanSeries && fromDoubanSeries.toLowerCase() !== imdb.toLowerCase()) {
        sessionStorage.setItem(cacheKey, fromDoubanSeries);
        return fromDoubanSeries;
      }
      const fromSuggestFirst = await imdbSuggestSeriesId(titleHint).catch(() => '');
      if (fromSuggestFirst && fromSuggestFirst.toLowerCase() !== imdb.toLowerCase()) {
        sessionStorage.setItem(cacheKey, fromSuggestFirst);
        return fromSuggestFirst;
      }
      const candidates = [];
      const add = (id, weight) => {
        id = (text(id).match(/tt\d{6,10}/i) || [])[0] || '';
        if (!id || id.toLowerCase() === imdb.toLowerCase()) return;
        candidates.push({ id, weight: weight || 1 });
      };
      const pages = [
        'https://www.imdb.com/title/' + imdb + '/',
        'https://www.imdb.com/title/' + imdb + '/reference'
      ];
      for (const page of pages) {
        let html = '';
        try { html = await fetchText(page); } catch (_) { continue; }
        const strongPatterns = [
          /"parentTitle"[\s\S]{0,900}?"id"\s*:\s*"(tt\d{6,10})"/ig,
          /"parentTitleId"\s*:\s*"(tt\d{6,10})"/ig,
          /"seriesId"\s*:\s*"(tt\d{6,10})"/ig,
          /"partOfSeries"[\s\S]{0,900}?\/title\/(tt\d{6,10})\//ig,
          /\/title\/(tt\d{6,10})\/episodes/ig,
          /href="\/title\/(tt\d{6,10})\/[^"#]*"[^>]*>\s*(?:<[^>]+>\s*)*(?:Series|TV Series|All episodes|Episode guide)/ig
        ];
        for (const re of strongPatterns) { let m; while ((m = re.exec(html))) add(m[1], 10); }
        // Fallback: count repeated title links. On IMDb episode pages the parent series
        // appears repeatedly; unrelated recommendations generally appear once.
        const counts = {};
        let m;
        const any = /\/title\/(tt\d{6,10})\//ig;
        while ((m = any.exec(html))) {
          const id = m[1];
          if (id.toLowerCase() === imdb.toLowerCase()) continue;
          counts[id] = (counts[id] || 0) + 1;
        }
        Object.entries(counts).forEach(([id, count]) => { if (count >= 2) add(id, Math.min(8, count)); });
      }
      let picked = '';
      if (candidates.length) {
        const score = new Map();
        candidates.forEach(x => score.set(x.id, (score.get(x.id) || 0) + x.weight));
        picked = Array.from(score.entries()).sort((a,b) => b[1]-a[1])[0][0];
      }
      const suggested = await imdbSuggestSeriesId(titleHint);
      if (suggested && suggested.toLowerCase() !== imdb.toLowerCase()) picked = suggested;
      if (!picked) picked = imdb;
      sessionStorage.setItem(cacheKey, picked);
      return picked;
    } catch (_) {
      return (await imdbSuggestSeriesId(titleHint)) || imdb;
    }
  }



  function cleanPopcornTitleHint(raw) {
    return text(raw)
      .replace(/快速搜索[：:][\s\S]*$/g, '')
      .replace(/PTP\s*\|\s*BHD\s*\|[\s\S]*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getDoubanPageTitleHint() {
    let raw = '';
    const h1 = document.querySelector('#content h1');
    if (h1) {
      const clone = h1.cloneNode(true);
      clone.querySelectorAll('a,.search_urls,.popcorn-btn-douban-score,.popcorn-quick-search').forEach(el => { try { el.remove(); } catch (_) {} });
      raw = clone.textContent || '';
    }
    return cleanPopcornTitleHint(raw || document.title || '');
  }

  function getDoubanPageImdbId() {
    return extractImdbFromDoubanHtml(document.documentElement && document.documentElement.innerHTML || document.body && document.body.innerHTML || '')
      || ((document.body && document.body.textContent || '').match(/tt\d{6,10}/i) || [''])[0];
  }


  function popcornSeriesCacheKey(id) { return 'popcorn_series_resolved_' + text(id).toLowerCase(); }
  function popcornSeriesGet(id) {
    id = (text(id).match(/tt\d{6,10}/i) || [''])[0] || '';
    if (!id) return null;
    try {
      const v = window.GM_getValue(popcornSeriesCacheKey(id));
      if (!v) return null;
      const o = typeof v === 'string' ? JSON.parse(v) : v;
      if (!o || !o.resolved || !/^tt\d{6,10}$/i.test(o.resolved)) return null;
      if (o.at && Date.now() - Number(o.at) > 14 * 24 * 3600 * 1000) return null;
      return o;
    } catch (_) { return null; }
  }
  function popcornSeriesSet(original, resolved, subjectId, titleHint) {
    original = (text(original).match(/tt\d{6,10}/i) || [''])[0] || '';
    resolved = (text(resolved).match(/tt\d{6,10}/i) || [''])[0] || '';
    if (!original || !resolved || original.toLowerCase() === resolved.toLowerCase()) return;
    try { window.GM_setValue(popcornSeriesCacheKey(original), { resolved, subjectId: text(subjectId), titleHint: cleanSeriesTitleHint(titleHint), at: Date.now() }); } catch (_) {}
  }
  function popcornRedirectCleanSearch(siteKey, resolved) {
    if (!resolved) return false;
    const url = new URL(location.href);
    if (siteKey === 'BHD') {
      url.hostname = 'beyond-hd.me';
      url.pathname = '/torrents';
      url.search = '?search=' + encodeURIComponent(resolved);
    } else if (siteKey === 'BTN') {
      url.pathname = '/torrents.php';
      url.search = '?action=advanced&searchstr=&searchtags=&tags_type=1&groupdesc=&imdbid=' + encodeURIComponent(resolved);
    } else if (siteKey === 'CHD') {
      url.protocol = 'https:';
      url.hostname = 'ptchdbits.co';
      url.pathname = '/torrents.php';
      url.search = '?incldead=0&spstate=0&inclbookmarked=0&search=' + encodeURIComponent(resolved) + '&search_area=4&search_mode=0';
    } else if (siteKey === 'BLU') {
      url.protocol = 'https:';
      url.hostname = 'blutopia.cc';
      url.pathname = '/torrents';
      const imdbNo = String(resolved || '').replace(/^tt/i, '');
      url.search = '?imdbid=' + encodeURIComponent(imdbNo) + '&perPage=25&imdbId=' + encodeURIComponent(imdbNo);
    } else if (siteKey === 'ADE') {
      ['search','searchstr','imdb','imdbid','q'].forEach(k => {
        const v = url.searchParams.get(k);
        if (v && /tt\d{6,10}/i.test(v)) url.searchParams.set(k, resolved);
      });
      url.href = url.href.replace(/tt\d{6,10}/ig, resolved);
    }
    location.replace(url.href);
    return true;
  }

  function selectedSeriesSearchSites() {
    const fallback = ['BHD', 'BTN', 'ADE'];
    let raw = null;
    try { raw = window.GM_getValue('__popcorn_series_search_sites'); } catch (_) {}
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === 'string') {
      try { const parsed = JSON.parse(raw); arr = Array.isArray(parsed) ? parsed : String(parsed || '').split(','); }
      catch (_) { arr = raw.split(','); }
    }
    arr = arr.map(x => String(x || '').trim()).filter(Boolean);
    return new Set(arr.length ? arr : fallback);
  }

  function siteKeyFromAnchor(a) {
    const name = text(a && a.textContent).trim();
    const href = text(a && a.href).toLowerCase();
    if (/^BHD$/i.test(name) || href.includes('beyond-hd.me')) return 'BHD';
    if (/^BTN$/i.test(name) || href.includes('broadcasthe.net') || href.includes('backup.landof.tv')) return 'BTN';
    if (/^CHD$/i.test(name) || href.includes('ptchdbits.co') || href.includes('chdbits.co') || href.includes('chddiy.xyz')) return 'CHD';
    if (/^BLU$/i.test(name) || href.includes('blutopia.cc')) return 'BLU';
    if (/^ADE$/i.test(name) || href.includes('audiences.me')) return 'ADE';
    if (/^PTP$/i.test(name) || href.includes('passthepopcorn.me')) return 'PTP';
    if (/^GPW$/i.test(name) || href.includes('greatposterwall.com')) return 'GPW';
    if (/豆瓣|douban/i.test(name) || href.includes('douban.com')) return '豆瓣';
    return name || href;
  }

  function selectedSeriesAnchors() {
    const selected = selectedSeriesSearchSites();
    return Array.from(document.querySelectorAll('a[href*="tt"]')).filter(a => selected.has(siteKeyFromAnchor(a)));
  }

  function rewriteLinkForSeriesSite(a, originalImdb, resolved, subjectId, titleHint) {
    try {
      const key = siteKeyFromAnchor(a);
      const url = new URL(a.href);
      const replaceAll = (value) => text(value).replace(new RegExp(originalImdb, 'ig'), resolved);
      if (key === 'BHD') {
        url.hostname = 'beyond-hd.me';
        url.pathname = '/torrents';
        url.search = '?search=' + encodeURIComponent(resolved);
      } else if (key === 'BTN') {
        url.pathname = '/torrents.php';
        url.search = '?action=advanced&searchstr=&searchtags=&tags_type=1&groupdesc=&imdbid=' + encodeURIComponent(resolved);
      } else if (key === 'CHD') {
        url.protocol = 'https:';
        url.hostname = 'ptchdbits.co';
        url.pathname = '/torrents.php';
        url.search = '?incldead=0&spstate=0&inclbookmarked=0&search=' + encodeURIComponent(resolved) + '&search_area=4&search_mode=0';
      } else if (key === 'BLU') {
        url.protocol = 'https:';
        url.hostname = 'blutopia.cc';
        url.pathname = '/torrents';
        const imdbNo = String(resolved || '').replace(/^tt/i, '');
        url.search = '?imdbid=' + encodeURIComponent(imdbNo) + '&perPage=25&imdbId=' + encodeURIComponent(imdbNo);
      } else {
        ['search','searchstr','imdb','imdbid','q'].forEach(k => {
          const v = url.searchParams.get(k);
          if (v && /tt\d{6,10}/i.test(v)) url.searchParams.set(k, replaceAll(v));
        });
        url.href = url.href.replace(new RegExp(originalImdb, 'ig'), resolved);
        
      }
      a.href = url.href;
      a.dataset.popcornSeriesImdb = resolved;
    } catch (_) {
      try { a.href = text(a.href).replace(new RegExp(originalImdb, 'ig'), resolved); } catch (e) {}
    }
  }

  async function rewriteDoubanSelectedSeriesLinks() {
    if (!location.href.match(/^https?:\/\/movie\.douban\.com\/subject\//i)) return;
    const titleHint = getDoubanPageTitleHint();
    if (!shouldRunSeriesSearchFlow(titleHint)) return;
    const subjectId = subjectIdFromText(location.href);
    const originalImdb = getDoubanPageImdbId();
    if (!originalImdb) return;
    const anchors = selectedSeriesAnchors();
    if (!anchors.length) return;
    // Add metadata immediately, before async IMDb resolution finishes. This keeps CHD/ADE
    // target-page fallback working even if the user clicks very quickly.
    anchors.forEach(a => {
      try {
        const url = new URL(a.href);
        
        a.href = url.href;
      } catch (_) {}
    });
    const cacheKey = 'popcorn_selected_series_imdb_' + subjectId + '_' + originalImdb + '_' + cleanSeriesTitleHint(titleHint).toLowerCase();
    let resolved = '';
    try { resolved = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey) || ''; } catch (_) {}
    if (!resolved) {
      resolved = await getSeriesSearchImdb(originalImdb, titleHint) || originalImdb;
      if (resolved && resolved.toLowerCase() !== originalImdb.toLowerCase()) {
        try { sessionStorage.setItem(cacheKey, resolved); localStorage.setItem(cacheKey, resolved); } catch (_) {}
        popcornSeriesSet(originalImdb, resolved, subjectId, titleHint);
      }
    }
    if (!resolved || resolved.toLowerCase() === originalImdb.toLowerCase()) return;
    popcornSeriesSet(originalImdb, resolved, subjectId, titleHint);
    anchors.forEach(a => rewriteLinkForSeriesSite(a, originalImdb, resolved, subjectId, titleHint));
  }

  async function normalizeDoubanSeriesImdbForAllQuickLinks() {
    if (!location.href.match(/^https?:\/\/movie\.douban\.com\/subject\//i)) return;
    const titleHint = getDoubanPageTitleHint();
    const subjectId = subjectIdFromText(location.href);
    const originalImdb = getDoubanPageImdbId();
    if (!originalImdb || !shouldRunSeriesSearchFlow(titleHint)) return;
    const cacheKey = 'popcorn_global_series_imdb_' + subjectId + '_' + originalImdb + '_' + cleanSeriesTitleHint(titleHint).toLowerCase();
    let resolved = '';
    try { resolved = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey) || ''; } catch (_) {}
    if (!resolved) {
      resolved = await getSeriesSearchImdb(originalImdb, titleHint) || originalImdb;
      try { sessionStorage.setItem(cacheKey, resolved); localStorage.setItem(cacheKey, resolved); } catch (_) {}
    }
    if (!resolved) return;
    popcornSeriesSet(originalImdb, resolved, subjectId, titleHint);
    document.querySelectorAll('a[href*="tt"], a[href*="imdb"], a[href*="search"], a[href*="torrents"]').forEach(a => {
      try {
        if (!a.href || /movie\.douban\.com|imdb\.com\/title/i.test(a.href)) return;
        const oldHref = a.href;
        let next = oldHref.replace(new RegExp(originalImdb, 'ig'), resolved);
        const url = new URL(next);
        // Add durable metadata for target-site fixups; harmless for sites that ignore unknown params.
        // If the site has an IMDb-specific parameter but still contains the original ID elsewhere, normalize those too.
        ['imdbid','imdb','search','searchstr','q'].forEach(k => {
          const v = url.searchParams.get(k);
          if (v && /tt\d{6,10}/i.test(v)) url.searchParams.set(k, v.replace(/tt\d{6,10}/ig, resolved));
        });
        a.href = url.href;
        a.dataset.popcornSeriesImdb = resolved;
        if (a.title) a.title = a.title.replace(new RegExp(originalImdb, 'ig'), resolved);
      } catch (_) {}
    });
  }

  async function enhanceBtnSeriesTitleWithDouban() {
    if (!location.href.match(/^https:\/\/(broadcasthe\.net|backup\.landof\.tv)\/series\.php\?id=\d+/i)) return;
    document.querySelectorAll('a').forEach(a => { if ((a.textContent || '').trim() === '[Douban]') a.textContent = '[豆瓣]'; });
    const titleEl = await waitForCondition(() => document.querySelector('h1') || document.querySelector('.series_title, #series_title, .page__title'), 12000, 300);
    if (!titleEl || titleEl.dataset.popcornBtnTitleDoubanV30 === '1') return;
    titleEl.querySelectorAll('.popcorn-btn-douban-score').forEach(el => { try { el.remove(); } catch (_) {} });
    let baseTitle = (titleEl.textContent || document.title || '')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/豆瓣\[[^\]]*\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const imdb = await waitForCondition(() => getPageImdbId(document), 12000, 300);
    let info = null;
    if (imdb) info = await findDoubanInfo({ imdb, title: baseTitle }).catch(() => null);
    if (!info || (!info.average && !info.title)) {
      const titleQueries = Array.from(new Set([
        baseTitle,
        cleanSeriesTitleHint(baseTitle),
        cleanTitleForSearch(baseTitle),
        cleanSeriesTitleHint(document.title || '')
      ].filter(x => x && x.length >= 2)));
      for (const q of titleQueries) {
        info = await doubanBySuggest(q).catch(() => null) || await doubanByMobileSearch(q).catch(() => null);
        if (info && (info.average || info.title)) break;
      }
    }
    if (!info) return;
    titleEl.dataset.popcornBtnTitleDoubanV30 = '1';
    titleEl.dataset.popcornBtnTitleDoubanV29 = '1';
    const a = document.createElement('a');
    a.href = info.url || '#';
    a.target = '_blank';
    a.className = 'popcorn-btn-douban-score';
    a.style.cssText = 'margin-left:10px;font-size:0.82em;color:#d3d3d3;text-decoration:none;font-weight:600;';
    const zhTitle = cleanDoubanTitleForBhd(info.title || '').replace(/\s*\(.*?\)\s*$/g, '').trim();
    a.textContent = zhTitle ? ` ${zhTitle}[${formatScore(info)}]` : ` 豆瓣[${formatScore(info)}]`;
    titleEl.appendChild(a);
  }


  function rewriteDoubanBhdLinks() {
    if (!selectedSeriesSearchSites().has('BHD')) return;
    if (!location.href.match(/^https?:\/\/movie\.douban\.com\/subject\//i)) return;
    const subjectId = subjectIdFromText(location.href);
    const titleHint = getDoubanPageTitleHint();
    document.querySelectorAll('a[href*="beyond-hd.me/torrents"]').forEach(a => {
      try {
        const old = new URL(a.href);
        const raw = old.searchParams.get('search') || old.searchParams.get('imdbid') || old.searchParams.get('imdb') || old.searchParams.get('q') || '';
        const imdb = (raw.match(/tt\d{6,10}/i) || [])[0] || raw;
        old.pathname = '/torrents';
        old.search = '?search=' + encodeURIComponent(imdb);
        a.href = old.href;
      } catch (_) {}
    });
  }

  async function fixBhdSeriesSearchImdb() {
    if (!selectedSeriesSearchSites().has('BHD')) return;
    if (!location.href.match(/^https:\/\/beyond-hd\.me\/torrents/i)) return;
    const params = new URLSearchParams(location.search);
    const raw = params.get('search') || params.get('imdbid') || params.get('imdb') || '';
    const originalImdb = (raw.match(/tt\d{6,10}/i) || [])[0] || '';
    if (!originalImdb) return;
    let titleHint = params.get('popcorn_title') || '';
    const paramDouban = params.get('popcorn_douban') || '';
    if (paramDouban) {
      try {
        const refInfo = await doubanBySubjectId(paramDouban);
        if (refInfo && refInfo.title) titleHint = refInfo.title;
      } catch (_) {}
    }
    if (!titleHint && /movie\.douban\.com\/subject\//.test(document.referrer || '')) {
      try {
        const refInfo = await doubanBySubjectId(subjectIdFromText(document.referrer));
        if (refInfo && refInfo.title) titleHint = refInfo.title;
      } catch (_) {}
    }
    if (!shouldRunSeriesSearchFlow(titleHint)) return;
    const cacheKey = 'popcorn_bhd_series_imdb_fixed_' + originalImdb + '_' + cleanSeriesTitleHint(titleHint).toLowerCase();
    if (sessionStorage.getItem(cacheKey)) return;
    const resolved = await getSeriesSearchImdb(originalImdb, titleHint);
    if (!resolved || resolved.toLowerCase() === originalImdb.toLowerCase()) return;
    sessionStorage.setItem(cacheKey, resolved);
    popcornSeriesSet(originalImdb, resolved, '', titleHint);
    const url = new URL(location.href);
    url.pathname = '/torrents';
    url.search = '?search=' + encodeURIComponent(resolved);
    location.replace(url.href);
  }

  function rewriteDoubanBtnLinks() {
    if (!selectedSeriesSearchSites().has('BTN')) return;
    if (!location.href.match(/^https?:\/\/movie\.douban\.com\/subject\//i)) return;
    const subjectId = subjectIdFromText(location.href);
    const titleHint = getDoubanPageTitleHint();
    document.querySelectorAll('a[href*="broadcasthe.net/torrents.php"], a[href*="backup.landof.tv/torrents.php"]').forEach(a => {
      try {
        const old = new URL(a.href);
        const raw = old.searchParams.get('imdbid') || old.searchParams.get('imdb') || old.searchParams.get('searchstr') || '';
        const imdb = (raw.match(/tt\d{6,10}/i) || [])[0] || '';
        old.pathname = '/torrents.php';
        old.search = '?action=advanced&searchstr=&searchtags=&tags_type=1&groupdesc=&imdbid=' + encodeURIComponent(imdb);
        a.href = old.href;
      } catch (_) {}
    });
  }

  async function fixBtnSearchImdbField() {
    if (!selectedSeriesSearchSites().has('BTN')) return;
    if (!location.href.match(/^https:\/\/(broadcasthe\.net|backup\.landof\.tv)\/torrents\.php/i)) return;
    const params = new URLSearchParams(location.search);
    const raw = params.get('imdbid') || params.get('imdb') || params.get('searchstr') || params.get('search') || params.get('q') || '';
    const originalImdb = (raw.match(/tt\d{6,10}/i) || [])[0];
    let titleHint = params.get('popcorn_title') || params.get('seriesname') || params.get('title') || params.get('searchstr') || '';
    const paramDouban = params.get('popcorn_douban') || '';
    if (paramDouban) {
      try {
        const refInfo = await doubanBySubjectId(paramDouban);
        if (refInfo && refInfo.title) titleHint = refInfo.title;
      } catch (_) {}
    }
    if (!titleHint && /movie\.douban\.com\/subject\//.test(document.referrer || '')) {
      try {
        const refInfo = await doubanBySubjectId(subjectIdFromText(document.referrer));
        if (refInfo && refInfo.title) titleHint = refInfo.title;
      } catch (_) {}
    }
    if (!originalImdb || sessionStorage.getItem('popcorn_btn_imdb_fixed_' + originalImdb + '_' + cleanSeriesTitleHint(titleHint))) return;

    // Use the global series IMDb decision layer. First seasons keep Douban's IMDb
    // but still continue through BTN's field-fill and submit pipeline.
    const imdb = await getSeriesSearchImdb(originalImdb, titleHint) || originalImdb;
    popcornSeriesSet(originalImdb, imdb, '', titleHint);

    // If a quick-search link lands on BTN basic search, redirect to the advanced form first.
    if (params.get('action') !== 'advanced') {
      sessionStorage.setItem('popcorn_btn_imdb_redirect_' + originalImdb, '1');
      const url = new URL(location.href);
      url.pathname = '/torrents.php';
      url.search = '?action=advanced&searchstr=&searchtags=&tags_type=1&groupdesc=&imdbid=' + encodeURIComponent(imdb);
      location.replace(url.href);
      return;
    }

    const setInputValue = (input, value) => {
      if (!input) return false;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles:true }));
      input.dispatchEvent(new Event('change', { bubbles:true }));
      return true;
    };

    const allInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), input[type="search"]'));
    let imdbInput = document.querySelector('input[name="imdbid"], input[name="imdb"], input[id*="imdb" i], input[name*="imdb" i]');
    if (!imdbInput) {
      const labels = Array.from(document.querySelectorAll('label, td, th, div, span')).filter(el => /^\s*IMDB\s*ID\s*:?\s*$/i.test(el.textContent || '') || /IMDB\s*ID/i.test(el.textContent || ''));
      for (const label of labels) {
        const row = label.closest('tr, .row, div') || label.parentElement;
        const found = row && row.querySelector('input[type="text"], input:not([type]), input[type="search"]');
        if (found) { imdbInput = found; break; }
      }
    }
    if (!imdbInput) return;

    const searchTerm = allInputs.find(inp => inp !== imdbInput && /search|term|name/i.test((inp.name || '') + ' ' + (inp.id || '') + ' ' + (inp.placeholder || ''))) || allInputs[0];
    if (searchTerm && searchTerm !== imdbInput && /tt\d{6,10}/i.test(searchTerm.value || '')) setInputValue(searchTerm, '');
    setInputValue(imdbInput, imdb);

    const form = imdbInput.closest('form');
    sessionStorage.setItem('popcorn_btn_imdb_fixed_' + originalImdb + '_' + cleanSeriesTitleHint(titleHint), '1');
    const submit = form && (form.querySelector('input[type="submit"], button[type="submit"], button:not([type])'));
    setTimeout(() => {
      if (submit) submit.click();
      else if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
    }, 250);
  }


  async function fixSelectedSeriesTargetSearchImdb() {
    const href = location.href;
    let key = '';
    if (/^https:\/\/(ptchdbits\.co|chdbits\.co|[^\/]+\.chddiy\.xyz)\/torrents\.php/i.test(href)) key = 'CHD';
    if (/^https:\/\/blutopia\.cc\/torrents/i.test(href)) key = 'BLU';
    if (/^https:\/\/audiences\.me\/torrents\.php/i.test(href)) key = 'ADE';
    if (!key || !selectedSeriesSearchSites().has(key)) return;
    const params = new URLSearchParams(location.search);
    const raw = params.get('search') || params.get('searchstr') || params.get('imdbid') || params.get('imdb') || '';
    const originalImdb = (raw.match(/tt\d{6,10}/i) || [])[0] || '';
    if (!originalImdb) return;
    let titleHint = params.get('popcorn_title') || '';
    const paramDouban = params.get('popcorn_douban') || '';
    if (paramDouban) {
      try { const refInfo = await doubanBySubjectId(paramDouban); if (refInfo && refInfo.title) titleHint = refInfo.title; } catch (_) {}
    }
    if (!titleHint && /movie\.douban\.com\/subject\//.test(document.referrer || '')) {
      try { const refInfo = await doubanBySubjectId(subjectIdFromText(document.referrer)); if (refInfo && refInfo.title) titleHint = refInfo.title; } catch (_) {}
    }
    if (!shouldRunSeriesSearchFlow(titleHint)) return;
    const cacheKey = 'popcorn_' + key.toLowerCase() + '_series_imdb_fixed_' + originalImdb + '_' + cleanSeriesTitleHint(titleHint).toLowerCase();
    if (sessionStorage.getItem(cacheKey)) return;
    const resolved = await getSeriesSearchImdb(originalImdb, titleHint);
    if (!resolved || resolved.toLowerCase() === originalImdb.toLowerCase()) return;
    sessionStorage.setItem(cacheKey, resolved);
    popcornSeriesSet(originalImdb, resolved, '', titleHint);
    const url = new URL(location.href);
    if (key === 'CHD') {
      url.protocol = 'https:';
      url.hostname = 'ptchdbits.co';
      url.pathname = '/torrents.php';
      url.search = '?incldead=0&spstate=0&inclbookmarked=0&search=' + encodeURIComponent(resolved) + '&search_area=4&search_mode=0';
    } else if (key === 'BLU') {
      url.protocol = 'https:';
      url.hostname = 'blutopia.cc';
      url.pathname = '/torrents';
      const imdbNo = String(resolved || '').replace(/^tt/i, '');
      url.search = '?imdbid=' + encodeURIComponent(imdbNo) + '&perPage=25&imdbId=' + encodeURIComponent(imdbNo);
    } else {
      ['search','searchstr','imdb','imdbid','q'].forEach(k => {
        const v = url.searchParams.get(k);
        if (v && /tt\d{6,10}/i.test(v)) url.searchParams.set(k, v.replace(/tt\d{6,10}/ig, resolved));
      });
      url.href = url.href.replace(new RegExp(originalImdb, 'ig'), resolved);
    }
    location.replace(url.href);
  }



  let popcornTmSeq = 1;
  const popcornTmPending = new Map();
  function popcornExtRequest(type, payload) {
    return new Promise((resolve, reject) => {
      const id = 'popcorn_tm_' + Date.now() + '_' + (popcornTmSeq++);
      const timer = setTimeout(() => {
        popcornTmPending.delete(id);
        reject(new Error('请求超时：' + type));
      }, 120000);
      popcornTmPending.set(id, { resolve, reject, timer });
      window.dispatchEvent(new CustomEvent('auto_feed_ext_request', { detail: { id, type, payload } }));
    });
  }
  window.addEventListener('auto_feed_ext_response', (event) => {
    const detail = event.detail || {};
    const id = detail.id;
    if (!id || !popcornTmPending.has(id)) return;
    const item = popcornTmPending.get(id);
    popcornTmPending.delete(id);
    clearTimeout(item.timer);
    const resp = detail.response || {};
    if (resp.ok === false) item.reject(new Error(resp.error || '扩展请求失败'));
    else item.resolve(resp.data);
  });

  function tmParseCsv(value, fallback) {
    if (value == null || value === '') return fallback || [];
    let v = value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) {} }
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return v.split(',').map(x => x.trim()).filter(Boolean);
    return fallback || [];
  }
  function tmAnchorName(html) {
    const m = String(html || '').match(/>([^<>]+)<\/a>/i);
    return m ? m[1].trim() : '';
  }
  function tmAnchorHref(html) {
    const m = String(html || '').match(/href=["']([^"']+)/i);
    return m ? m[1] : '';
  }
  function tmKnownKeyFromHtml(html) {
    const name = tmAnchorName(html).toLowerCase();
    const href = tmAnchorHref(html).toLowerCase();
    const nameMap = { ptp:'PTP', bhd:'BHD', blu:'BLU', chd:'CHD', chdbits:'CHD', ade:'ADE', audiences:'ADE', gpw:'GPW', btn:'BTN', douban:'豆瓣', '豆瓣':'豆瓣' };
    if (nameMap[name]) return nameMap[name];
    if (href.includes('passthepopcorn')) return 'PTP';
    if (href.includes('broadcasthe') || href.includes('landof.tv')) return 'BTN';
    if (href.includes('beyond-hd')) return 'BHD';
    if (href.includes('blutopia.cc')) return 'BLU';
    if (href.includes('chdbits') || href.includes('chddiy')) return 'CHD';
    if (href.includes('audiences')) return 'ADE';
    if (href.includes('greatposterwall')) return 'GPW';
    if (href.includes('douban.com')) return '豆瓣';
    return tmAnchorName(html);
  }
  function tmCurrentSiteKeys() {
    const host = location.hostname.toLowerCase();
    const keys = new Set();
    if (host.includes('passthepopcorn.me')) keys.add('PTP');
    if (host.includes('broadcasthe.net') || host.includes('landof.tv')) keys.add('BTN');
    if (host.includes('beyond-hd.me')) keys.add('BHD');
    if (host.includes('blutopia.cc')) keys.add('BLU');
    if (host.includes('ptchdbits.co') || host.includes('chdbits') || host.includes('chddiy')) keys.add('CHD');
    if (host.includes('audiences.me')) keys.add('ADE');
    if (host.includes('greatposterwall.com')) keys.add('GPW');
    if (host.includes('m-team') || host.includes('m-team.cc')) keys.add('MTeam');
    if (host.includes('orpheus.network')) keys.add('OPS');
    if (host.includes('ourbits.club')) keys.add('OurBits');
    if (host.includes('redacted.')) keys.add('RED');
    if (host.includes('totheglory.')) keys.add('TTG');
    const lines = tmParseCsv(typeof GM_getValue === 'function' ? GM_getValue('used_search_list', '') : '', []);
    lines.forEach(line => {
      try {
        const href = tmAnchorHref(line);
        if (!href) return;
        const u = new URL(href.replace(/\{[^}]+\}/g, 'tt0000000'));
        const h = u.hostname.toLowerCase();
        if (host === h || host.endsWith('.' + h) || h.endsWith('.' + host)) keys.add(tmKnownKeyFromHtml(line));
      } catch (_) {}
    });
    return keys;
  }
  function transmissionSiteEnabledHere() {
    try {
      if (typeof GM_getValue === 'function' && Number(GM_getValue('__popcorn_tm_enabled', 0)) !== 1) return false;
      const picked = tmParseCsv(typeof GM_getValue === 'function' ? GM_getValue('__popcorn_tm_sites', '') : '', ['PTP','BHD','BLU','CHD','ADE','GPW','BTN']);
      const pickedSet = new Set((picked.length ? picked : ['PTP','BHD','BLU','CHD','ADE','GPW','BTN']).map(String));
      const here = tmCurrentSiteKeys();
      for (const k of here) if (pickedSet.has(k)) return true;
    } catch (_) {}
    return false;
  }
  function isBhdHost() {
    return /(^|\.)beyond-hd\.me$/i.test(location.hostname || '');
  }
  function isIconStyleTorrentAnchor(a) {
    if (!a || a.dataset.popcornTmBound === '1') return false;
    const href = a.getAttribute('href') || '';
    if (!href || /^javascript:/i.test(href)) return false;
    const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return false;
    if (!a.querySelector('img, svg, .fa, [class*="icon" i]')) return false;
    return /(download|download\.php|download\.asp|download\.do|gettorrent|torrent\/download|downloadtorrent|dl\.php|\btorrentid=|[?&]torrent=|[?&]id=)/i.test(href);
  }
  function isBluHost() {
    return /(^|\.)blutopia\.cc$/i.test(location.hostname || '');
  }
  function isBluTorrentDetailPage() {
    if (!isBluHost()) return false;
    try {
      const url = new URL(location.href);
      // UNIT3D detail pages are /torrents/<id>/<slug>. The search/list page is exactly /torrents.
      if (/^\/torrents\/?$/i.test(url.pathname)) return false;
      if (/^\/torrents\/[^\/?#]+(?:\/[^?#]*)?\/?$/i.test(url.pathname)) return true;
      // Some BLU detail pages expose a name=download form/button; use it as a strong detail signal.
      return !!document.querySelector('[name="download"]');
    } catch (_) {
      return /blutopia\.cc\/torrents\/[^\/?#]+/i.test(location.href) || !!document.querySelector('[name="download"]');
    }
  }
  function bluTorrentIdFromLocation() {
    try {
      const m = String(location.pathname || '').match(/^\/torrents\/([0-9]+)(?:\/|$)/i);
      return m ? m[1] : '';
    } catch (_) { return ''; }
  }
  function getBluControlUrl(el) {
    if (!el) return '';
    const direct = (el.getAttribute && (el.getAttribute('href') || el.getAttribute('formaction') || el.getAttribute('data-url') || el.getAttribute('data-href'))) || el.href || '';
    if (direct && !/^javascript:/i.test(direct)) return direct;
    const form = el.form || (el.closest && el.closest('form'));
    const action = form && (form.getAttribute('action') || form.action);
    if (action && !/^javascript:/i.test(action)) return action;
    const tid = bluTorrentIdFromLocation();
    return tid ? (location.origin + '/torrents/download/' + tid) : '';
  }
  function isBluBadActionControl(el) {
    const hay = [
      el && el.getAttribute && (el.getAttribute('name') || ''),
      el && el.getAttribute && (el.getAttribute('title') || ''),
      el && el.getAttribute && (el.getAttribute('aria-label') || ''),
      el && el.getAttribute && (el.getAttribute('class') || ''),
      el && (el.textContent || ''),
      el && (el.innerHTML || '')
    ].join(' ');
    return /bookmark|favorite|favourite|watch|rss|comment|thank|report|history|rating|收藏|fa-bookmark|icon-bookmark/i.test(hay);
  }
  function isBluVisibleActionControl(el) {
    if (!el || !el.getAttribute) return false;
    if (/^hidden$/i.test(el.getAttribute('type') || '')) return false;
    if (el.disabled) return false;
    try {
      const cs = window.getComputedStyle(el);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    } catch (_) {}
    try {
      const r = el.getBoundingClientRect && el.getBoundingClientRect();
      if (r && r.width === 0 && r.height === 0) return false;
    } catch (_) {}
    return true;
  }
  function isBluDownloadControl(el) {
    if (!el || !isBluHost()) return false;
    if (el.classList && el.classList.contains('popcorn-tm-btn')) return false;
    if (!isBluVisibleActionControl(el)) return false;
    if (isBluBadActionControl(el)) return false;
    const href = getBluControlUrl(el);
    let url = null;
    try { url = href ? new URL(href, location.href) : null; } catch (_) { url = null; }
    const path = url ? url.pathname : href;
    const name = (el.getAttribute && el.getAttribute('name')) || '';
    const value = (el.getAttribute && el.getAttribute('value')) || '';
    const label = (el.textContent || value || (el.getAttribute && (el.getAttribute('title') || el.getAttribute('aria-label'))) || '').replace(/\s+/g, ' ').trim();
    // This is the route that made the first BLU version work; keep it for both list/search and detail rows.
    if (/(\/torrents\/download(?:_check)?\/[^\/?#]+|\/download(?:_check)?\/[^\/?#]+|\/torrents\/[^\/?#]+\/download)/i.test(path)) return true;
    // On the BLU detail page the visible button can be name="download" without an href.
    if (/^download$/i.test(name) && isBluTorrentDetailPage()) return true;
    if (/^(DL|Download|下载|Torrent|下载种子)$/i.test(label) && /download/i.test(path + ' ' + name)) return true;
    return false;
  }
  function isUnit3dTorrentDownloadAnchor(a) {
    return isBluDownloadControl(a);
  }
  function findBluDownloadControls() {
    if (!isBluHost()) return [];
    const controls = Array.from(document.querySelectorAll('a[href],button,input, [role="button"], [name="download"], [data-url], [data-href]'));
    const seen = new Set();
    const out = [];
    controls.forEach(el => {
      if (!isBluDownloadControl(el)) return;
      const url = getBluControlUrl(el);
      if (url && el.dataset) el.dataset.popcornTorrentUrl = /^https?:/i.test(url) ? url : new URL(url, location.href).href;
      if (seen.has(el)) return;
      seen.add(el);
      out.push(el);
    });
    return out;
  }
  function findBluDownloadAnchor() {
    const arr = findBluDownloadControls();
    return arr.length ? arr[0] : null;
  }
  function isTorrentDownloadAnchor(a) {
    if (!a || a.dataset.popcornTmBound === '1') return false;
    const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
    const href = a.getAttribute('href') || '';
    // 文字站点只给真正显示为 DL 的下载链接加 TM/TV。
    // 图标式 NexusPHP 站点用 href + 图标识别，避免破坏原来的四宫格布局。
    return (/^\[?\s*DL\s*\]?$/i.test(text) && !!href && !/^javascript:/i.test(href)) || isUnit3dTorrentDownloadAnchor(a) || isIconStyleTorrentAnchor(a);
  }
  async function pushTorrentToTransmission(btn, dlAnchor, target) {
    const old = btn.textContent;
    const label = target === 'tv' ? 'TV' : 'TM';
    try {
      const href = (dlAnchor && dlAnchor.dataset && dlAnchor.dataset.popcornTorrentUrl)
        || (dlAnchor && dlAnchor.getAttribute && dlAnchor.getAttribute('href'))
        || (dlAnchor && dlAnchor.getAttribute && dlAnchor.getAttribute('formaction'))
        || (dlAnchor && dlAnchor.href)
        || getBluControlUrl(dlAnchor)
        || '';
      const torrentUrl = new URL(href, location.href).href;
      btn.textContent = label + '...';
      btn.classList.add('is-working');

      // 先尝试外网(WAN)，失败后尝试局域网(LAN)
      let result = null;
      let lastError = null;
      const addresses = ['wan', 'lan']; // 默认先外网后局域网

      for (const address of addresses) {
        try {
          result = await popcornExtRequest('transmission_add', {
            torrentUrl,
            target: target === 'tv' ? 'tv' : 'movie',
            address: address // 指定使用 WAN 或 LAN 地址
          });
          // 推送成功，停止尝试另一个地址
          break;
        } catch (e) {
          lastError = e;
          // 本地址失败，继续尝试下一个
          continue;
        }
      }

      // 如果所有地址都失败，抛出最后一个错误
      if (!result && lastError) {
        throw lastError;
      }

      btn.classList.remove('is-working');
      btn.classList.add('is-ok');
      const addressLabel = result && result.address === 'wan' ? ' (外网)' : result && result.address === 'lan' ? ' (局域网)' : '';
      btn.textContent = result && result.status === 'duplicate' ? '已存在' : '已推送';
      btn.title = (result && result.name ? result.name : '已推送到 Transmission') + addressLabel;
      setTimeout(() => { btn.textContent = old; btn.classList.remove('is-ok'); }, 5000);
    } catch (e) {
      btn.classList.remove('is-working');
      btn.classList.add('is-bad');
      btn.textContent = '失败';
      btn.title = '外网和局域网都推送失败';
      setTimeout(() => { btn.textContent = old; btn.classList.remove('is-bad'); }, 8000);
    }
  }
  function createTmPushButton(text, title, target, dlAnchor) {
    const btn = document.createElement('a');
    btn.href = '#';
    btn.className = 'popcorn-tm-btn popcorn-tm-btn-' + (target === 'tv' ? 'tv' : 'movie');
    btn.textContent = text;
    btn.title = title;
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      pushTorrentToTransmission(btn, dlAnchor, target);
    }, true);
    return btn;
  }
  function isIconActionGroup(parent, dlAnchor) {
    if (!parent || !dlAnchor) return false;
    if (isIconStyleTorrentAnchor(dlAnchor)) return true;
    const imgs = parent.querySelectorAll ? parent.querySelectorAll('img, svg, .fa, [class*="icon" i]') : [];
    const links = parent.querySelectorAll ? parent.querySelectorAll('a[href]') : [];
    return imgs.length >= 2 && links.length >= 2 && !(dlAnchor.textContent || '').trim();
  }
  function insertIconTmButtons(parent, dlAnchor) {
    if (!parent || !dlAnchor || parent.querySelector('.popcorn-tm-btn')) return;
    const wrap = document.createElement('span');
    wrap.className = 'popcorn-tm-icon-stack';
    const isChd = /(^|\.)(ptchdbits\.co|chdbits\.co|[^.]+\.chddiy\.xyz)$/i.test(location.hostname || '');
    let isChdSingleColumn = false;
    if (isChd) {
      wrap.classList.add('popcorn-tm-icon-stack-chd');
      try {
        const iconLinks = Array.from(parent.querySelectorAll('a[href]')).filter(a => a !== dlAnchor && !(a.textContent || '').trim());
        isChdSingleColumn = iconLinks.length <= 1;
      } catch (_) {}
      if (isChdSingleColumn) wrap.classList.add('popcorn-tm-icon-stack-chd-singlecol');
    }
    const tm = createTmPushButton('TM', '推送到 Transmission 电影路径', 'movie', dlAnchor);
    const tv = createTmPushButton('TV', '推送到 Transmission 剧集路径', 'tv', dlAnchor);
    wrap.appendChild(tm);
    wrap.appendChild(tv);
    try {
      const currentPosition = window.getComputedStyle(parent).position;
      if (!currentPosition || currentPosition === 'static') parent.style.position = 'relative';
      parent.style.overflow = 'visible';
      if (isChd) {
        const currentPaddingLeft = parseFloat(window.getComputedStyle(parent).paddingLeft || '0') || 0;
        const minPaddingLeft = isChdSingleColumn ? 24 : 19;
        if (currentPaddingLeft < minPaddingLeft) parent.style.paddingLeft = minPaddingLeft + 'px';
      }
    } catch (_) {}
    parent.appendChild(wrap);
  }
  function insertTextTmButtons(parent, dlAnchor) {
    if (!parent || !dlAnchor || parent.querySelector('.popcorn-tm-btn')) return;
    try { parent.style.whiteSpace = 'nowrap'; } catch (_) {}
    const wrap = document.createElement('span');
    wrap.className = 'popcorn-tm-inline-wrap';
    const tm = createTmPushButton('TM', '推送到 Transmission 电影路径', 'movie', dlAnchor);
    const tv = createTmPushButton('TV', '推送到 Transmission 剧集路径', 'tv', dlAnchor);
    wrap.appendChild(tm);
    wrap.appendChild(document.createTextNode(' | '));
    wrap.appendChild(tv);
    wrap.appendChild(document.createTextNode(' | '));
    parent.insertBefore(wrap, dlAnchor);
  }
  function cleanupBluTransmissionControls() {
    if (!isBluHost()) return;
    try {
      // Remove old generic BLU controls from earlier builds, but keep the new TM-only buttons.
      Array.from(document.querySelectorAll('.popcorn-tm-inline-wrap, .popcorn-tm-icon-stack')).forEach(el => {
        if (el.closest && !el.closest('body')) return;
        try { el.remove(); } catch (_) {}
      });
      Array.from(document.querySelectorAll('.popcorn-tm-btn-tv, .popcorn-tm-btn:not(.popcorn-tm-blu-detail-tm)')).forEach(el => {
        const prev = el.previousSibling;
        const next = el.nextSibling;
        if (prev && prev.nodeType === 3) prev.nodeValue = String(prev.nodeValue || '').replace(/[\s|]+$/, ' ');
        if (next && next.nodeType === 3) next.nodeValue = String(next.nodeValue || '').replace(/^[\s|]+/, ' ');
        try { el.remove(); } catch (_) {}
      });
      Array.from(document.querySelectorAll('td,th,div,span,form')).forEach(el => {
        Array.from(el.childNodes || []).forEach(n => {
          if (n.nodeType === 3 && /TM\s*\|\s*TV\s*\|?/i.test(n.nodeValue || '')) {
            n.nodeValue = String(n.nodeValue || '').replace(/\s*TM\s*\|\s*TV\s*\|?\s*/ig, ' ').replace(/\s{2,}/g, ' ');
          }
        });
      });
    } catch (_) {}
  }
  function bluHasTmImmediatelyAfter(dlAnchor) {
    let n = dlAnchor && dlAnchor.nextSibling;
    while (n && n.nodeType === 3 && !String(n.nodeValue || '').trim()) n = n.nextSibling;
    return !!(n && n.nodeType === 1 && n.classList && n.classList.contains('popcorn-tm-blu-detail-tm'));
  }
  function insertBluTmButton(parent, dlAnchor) {
    if (!parent || !dlAnchor) return;
    if (bluHasTmImmediatelyAfter(dlAnchor)) return;
    try { parent.style.whiteSpace = 'nowrap'; } catch (_) {}
    const tm = createTmPushButton('TM', '推送到 Transmission 电影路径', 'movie', dlAnchor);
    tm.classList.add('popcorn-tm-blu-detail-tm');
    tm.dataset.popcornBluTm = '1';
    try {
      dlAnchor.insertAdjacentText('afterend', ' ');
      dlAnchor.insertAdjacentElement('afterend', tm);
    } catch (_) {
      if (dlAnchor.nextSibling) parent.insertBefore(tm, dlAnchor.nextSibling);
      else parent.appendChild(tm);
    }
  }
  function addBluTmOnlyButtons() {
    if (!isBluHost()) return;
    cleanupBluTransmissionControls();
    // On single torrent detail pages, skip TM/TV entirely — only keep 转发种子.
    // The extra TM buttons clutter the layout and cause repeated API calls.
    if (isBluTorrentDetailPage()) {
      Array.from(document.querySelectorAll('.popcorn-tm-blu-detail-tm, .popcorn-tm-btn')).forEach(el => {
        try { el.remove(); } catch (_) {}
      });
      Array.from(document.querySelectorAll('td,th,div,span,form')).forEach(el => {
        Array.from(el.childNodes || []).forEach(n => {
          if (n.nodeType === 3 && /TM\s*\|\s*TV\s*\|?/i.test(n.nodeValue || '')) {
            n.nodeValue = String(n.nodeValue || '').replace(/\s*TM\s*\|\s*TV\s*\|?\s*/ig, ' ').replace(/\s{2,}/g, ' ');
          }
        });
      });
      return;
    }
    const controls = findBluDownloadControls();
    controls.forEach(dl => {
      const parent = dl.parentNode || (dl.closest && dl.closest('form,td,th,div,span'));
      if (!parent) return;
      if (dl.dataset) dl.dataset.popcornTmBound = '1';
      insertBluTmButton(parent, dl);
    });
  }
  function findBracketSideTextNode(node, side) {
    let current = node;
    while (current) {
      if (current.nodeType === 3) {
        const value = String(current.nodeValue || '');
        if (!value.trim()) {
          current = side === 'left' ? current.previousSibling : current.nextSibling;
          continue;
        }
        if (side === 'left' ? /\[\s*$/.test(value) : /^\s*\]/.test(value)) return current;
        return null;
      }
      if (current.nodeType === 1 && !String(current.textContent || '').trim()) {
        current = side === 'left' ? current.previousSibling : current.nextSibling;
        continue;
      }
      return null;
    }
    return null;
  }
  function stripBracketSideTextNode(node, side) {
    if (!node || node.nodeType !== 3) return;
    const value = String(node.nodeValue || '');
    const nextValue = side === 'left' ? value.replace(/\[\s*$/, '') : value.replace(/^\s*\]/, '');
    if (nextValue) node.nodeValue = nextValue;
    else if (node.parentNode) node.parentNode.removeChild(node);
  }
  function isBtnBracketDlAnchor(dlAnchor) {
    if (!dlAnchor) return false;
    const originalText = (dlAnchor.textContent || '').replace(/\s+/g, ' ').trim();
    if (/^\[\s*DL\s*\]$/i.test(originalText)) return true;
    if (!/^DL$/i.test(originalText)) return false;
    const leftNode = findBracketSideTextNode(dlAnchor.previousSibling, 'left');
    const rightNode = findBracketSideTextNode(dlAnchor.nextSibling, 'right');
    return !!(leftNode && rightNode);
  }
  function insertBtnBracketTmButtons(parent, dlAnchor) {
    if (!parent || !dlAnchor || parent.querySelector('.popcorn-tm-btn')) return;
    try { parent.style.whiteSpace = 'nowrap'; } catch (_) {}
    if (!isBtnBracketDlAnchor(dlAnchor)) {
      insertTextTmButtons(parent, dlAnchor);
      return;
    }
    const originalText = (dlAnchor.textContent || '').replace(/\s+/g, ' ').trim();
    if (!/^\[\s*DL\s*\]$/i.test(originalText)) {
      stripBracketSideTextNode(findBracketSideTextNode(dlAnchor.previousSibling, 'left'), 'left');
      stripBracketSideTextNode(findBracketSideTextNode(dlAnchor.nextSibling, 'right'), 'right');
    }
    const wrap = document.createElement('span');
    wrap.className = 'popcorn-tm-inline-wrap popcorn-tm-btn-bracket-wrap';
    try { wrap.style.color = window.getComputedStyle(dlAnchor).color; } catch (_) {}
    dlAnchor.textContent = 'DL';
    const tm = createTmPushButton('TM', '推送到 Transmission 电影路径', 'movie', dlAnchor);
    const tv = createTmPushButton('TV', '推送到 Transmission 剧集路径', 'tv', dlAnchor);
    parent.insertBefore(wrap, dlAnchor);
    wrap.appendChild(document.createTextNode('[ '));
    wrap.appendChild(tm);
    wrap.appendChild(document.createTextNode(' | '));
    wrap.appendChild(tv);
    wrap.appendChild(document.createTextNode(' | '));
    wrap.appendChild(dlAnchor);
    wrap.appendChild(document.createTextNode(' ]'));
  }
  function isPtpPosterArea(parent, dlAnchor) {
    if (!/(^|\.)passthepopcorn\.me$/i.test(location.hostname || '')) return false;
    const cell = (dlAnchor && dlAnchor.closest && (dlAnchor.closest('td, th, li, div') || dlAnchor.closest('tr'))) || parent;
    const scope = cell || parent;
    if (!scope) return false;
    if (scope.querySelector && scope.querySelector('img')) return true;
    const hostCell = dlAnchor && dlAnchor.closest ? dlAnchor.closest('td, th') : null;
    if (hostCell && hostCell !== scope && hostCell.querySelector && hostCell.querySelector('img')) return true;
    return false;
  }
  function isPtpDetailPage() {
    if (!/(^|\.)passthepopcorn\.me$/i.test(location.hostname || '')) return false;
    try {
      const url = new URL(location.href);
      return /\/torrents\.php$/i.test(url.pathname) && !!url.searchParams.get('id');
    } catch (_) {
      return /^https?:\/\/passthepopcorn\.me\/torrents\.php\?id=/i.test(location.href);
    }
  }
  function isPtpTorrentDownloadAnchor(a) {
    if (!a || !/(^|\.)passthepopcorn\.me$/i.test(location.hostname || '')) return false;
    if (a.dataset.popcornTmBound === '1') return false;
    const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
    const href = a.getAttribute('href') || '';
    if (!/^\[?\s*DL\s*\]?$/i.test(text)) return false;
    try {
      const url = new URL(href, location.href);
      return /(^|\.)passthepopcorn\.me$/i.test(url.hostname)
        && /\/torrents\.php$/i.test(url.pathname)
        && /^download$/i.test(url.searchParams.get('action') || '')
        && !!url.searchParams.get('id');
    } catch (_) {
      return /torrents\.php\?[^#]*action=download[^#]*[?&]id=\d+/i.test(href);
    }
  }
  function addTransmissionButtons() {
    if (/(^|\.)passthepopcorn\.me$/i.test(location.hostname || '') && !isPtpDetailPage()) return;
    if (!transmissionSiteEnabledHere()) return;
    try {
      if (typeof GM_addStyle === 'function' && !document.getElementById('popcorn-tm-style')) {
        const st = GM_addStyle(`
.popcorn-tm-btn{font:inherit!important;font-size:inherit!important;font-weight:inherit!important;line-height:inherit!important;color:inherit!important;text-decoration:none!important;cursor:pointer!important}
.popcorn-tm-btn.is-working{opacity:.7}.popcorn-tm-btn.is-ok{color:#0a8f3c!important}.popcorn-tm-btn.is-bad{color:#c1121f!important}
.popcorn-tm-icon-stack{position:absolute!important;left:-28px!important;top:50%!important;transform:translateY(-50%)!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:4px!important;width:24px!important;min-width:24px!important;height:42px!important;margin:0!important;padding:0!important;line-height:1!important;white-space:nowrap!important;z-index:3!important;pointer-events:auto!important}
.popcorn-tm-icon-stack .popcorn-tm-btn{display:block!important;width:24px!important;text-align:center!important;font-size:11.5px!important;font-weight:600!important;line-height:14px!important;opacity:.94!important;margin:0!important;padding:0!important}
.popcorn-tm-icon-stack-chd{left:8px!important;gap:0!important;width:19px!important;min-width:19px!important;height:31px!important}
.popcorn-tm-icon-stack-chd .popcorn-tm-btn{width:19px!important;font-size:13px!important;line-height:13px!important;opacity:.98!important}
.popcorn-tm-icon-stack-chd .popcorn-tm-btn-movie{position:relative!important;top:-2px!important;margin-bottom:3px!important}
.popcorn-tm-icon-stack-chd .popcorn-tm-btn-tv{position:relative!important;top:0!important}
.popcorn-tm-icon-stack-chd-singlecol{left:8px!important}
.popcorn-tm-blu-detail-tm{display:inline-flex!important;align-items:center!important;margin-left:8px!important;margin-right:0!important;font-weight:600!important;text-decoration:none!important;vertical-align:middle!important;white-space:nowrap!important}
`);
        if (st) st.id = 'popcorn-tm-style';
      }
    } catch (_) {}
    if (isBluHost()) {
      addBluTmOnlyButtons();
      return;
    }
    Array.from(document.querySelectorAll('a[href]')).forEach(a => {
      const isPtp = /(^|\.)passthepopcorn\.me$/i.test(location.hostname || '');
      if (isPtp) {
        if (!isPtpTorrentDownloadAnchor(a)) return;
        const parent = a.parentNode;
        if (!parent) return;
        if (parent.querySelector && parent.querySelector('.popcorn-tm-btn')) return;
        a.dataset.popcornTmBound = '1';
        insertTextTmButtons(parent, a);
        return;
      }
      if (!isTorrentDownloadAnchor(a)) return;
      a.dataset.popcornTmBound = '1';
      const parent = a.parentNode;
      if (!parent) return;
      if (isPtpPosterArea(parent, a)) return;
      if (parent.querySelector && parent.querySelector('.popcorn-tm-btn')) return;
      const isBtn = /(^|\.)(broadcasthe\.net|backup\.landof\.tv)$/i.test(location.hostname || '');
      if (isBtn && isBtnBracketDlAnchor(a)) insertBtnBracketTmButtons(parent, a);
      else if (isIconActionGroup(parent, a)) insertIconTmButtons(parent, a);
      else insertTextTmButtons(parent, a);
    });
  }

  function cleanupExclusiveStatus() {
    document.querySelectorAll('#checking').forEach(el => { try { el.remove(); } catch (_) {} });
  }
  function runSoon() {
    clearExpiredDoubanCache();
    rewriteDoubanBhdLinks();
    rewriteDoubanBtnLinks();
    rewriteDoubanSelectedSeriesLinks().catch(e => console.debug('[Popcorn] selected Douban series IMDb normalize skipped', e));
    cleanupExclusiveStatus();
    cleanupBhdTitleAndSearch();
    fixBluTitleDouban().catch(e => console.debug('[Popcorn] BLU Douban enhance skipped', e));
    addGpwFallbackDisplay();
    cleanupAllDoubanControls();
    addChdDetailSearchFallback();
    addTransmissionButtons();
    setTimeout(() => {
      rewriteDoubanBhdLinks();
      rewriteDoubanBtnLinks();
      rewriteDoubanSelectedSeriesLinks().catch(e => console.debug('[Popcorn] selected Douban series IMDb normalize skipped', e));
      cleanupExclusiveStatus();
      cleanupBhdTitleAndSearch();
      fixBhdTitleDouban().catch(e => console.debug('[Popcorn] BHD cleanup skipped', e));
      fixBluTitleDouban().catch(e => console.debug('[Popcorn] BLU Douban enhance skipped', e));
      fixBhdSeriesSearchImdb().catch(e => console.debug('[Popcorn] BHD series IMDb search fix skipped', e));
      fixBtnSearchImdbField().catch(e => console.debug('[Popcorn] BTN IMDb search fix skipped', e)); fixSelectedSeriesTargetSearchImdb().catch(e => console.debug('[Popcorn] selected target IMDb search fix skipped', e));
      fixSelectedSeriesTargetSearchImdb().catch(e => console.debug('[Popcorn] selected target IMDb search fix skipped', e));
      fixBtnSeriesDouban().catch(e => console.debug('[Popcorn] BTN Douban fix skipped', e));
      enhanceBtnSeriesTitleWithDouban().catch(e => console.debug('[Popcorn] BTN title Douban enhance skipped', e));
      addGpwFallbackDisplay();
      cleanupAllDoubanControls();
      addChdDetailSearchFallback();
      addTransmissionButtons();
    }, 800);
    // 增加 2 次额外重试确保豆瓣信息稳定同步
    setTimeout(() => { fixBhdTitleDouban().catch(e => console.debug('[Popcorn] BHD Douban retry 1 skipped', e)); fixBluTitleDouban().catch(e => console.debug('[Popcorn] BLU Douban retry 1 skipped', e)); fixBtnSeriesDouban().catch(e => console.debug('[Popcorn] BTN Douban retry 1 skipped', e)); }, 2500);
    setTimeout(() => { fixBhdTitleDouban().catch(e => console.debug('[Popcorn] BHD Douban retry 2 skipped', e)); fixBluTitleDouban().catch(e => console.debug('[Popcorn] BLU Douban retry 2 skipped', e)); fixBtnSeriesDouban().catch(e => console.debug('[Popcorn] BTN Douban retry 2 skipped', e)); }, 5000);
    if (isBluHost()) {
      [8000, 12000, 18000, 25000].forEach(ms => setTimeout(() => {
        cleanupBluTransmissionControls();
        cleanupAllDoubanControls();
        addTransmissionButtons();
        // BLU 每次重试都强制清空缓存，确保豆瓣信息稳定同步
        const titleEl = findBluTitleElement();
        if (titleEl) {
          getBluDoubanInfo(titleEl, true).then(info => {
            if (info && (info.average || info.title || info.summary)) {
              if (!bluHasTitleInfo()) applyBluTitleInfo(titleEl, info);
              if (!bluHasChineseSummary()) applyBluChineseSummary(info);
            }
          }).catch(e => console.debug('[Popcorn] BLU Douban retry failed', e));
        }
      }, ms));
    }
  }
  runSoon();
  try {
    let tmTimer = null;
    const mo = new MutationObserver(() => {
      clearTimeout(tmTimer);
      tmTimer = setTimeout(() => {
        cleanupAllDoubanControls();
        cleanupBhdTitleAndSearch();
        addTransmissionButtons();
        if (isBluHost()) fixBluTitleDouban().catch(e => console.debug('[Popcorn] BLU Douban enhance observer skipped', e));
      }, 600);
    });
    mo.observe(document.documentElement || document.body, { childList:true, subtree:true });
  } catch (_) {}
  try { /* v20: no BHD quick-search observer; original userscript layout is preserved. */ } catch (_) {}
})();
