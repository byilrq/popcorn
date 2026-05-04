
(function popcornChdFinalGuardV40() {
  'use strict';

  const DEBUG = false;
  const log = (...args) => DEBUG && console.debug('[Popcorn CHD final guard v40]', ...args);

  if (!/movie\.douban\.com\/subject\/\d+/.test(location.href)) return;

  const CHD_HOST_RE = /(^|\.)ptchdbits\.co$|(^|\.)chdbits\.co$/i;
  const IMDB_RE = /tt\d{5,12}/g;
  const subjectMatch = location.href.match(/subject\/(\d+)/);
  const subjectId = subjectMatch && subjectMatch[1] || '';
  const CACHE_KEY = subjectId ? `popcorn:v40:finalSeriesImdb:${subjectId}` : '';
  let lockedFinalId = '';

  function cleanText(s) {
    return String(s || '')
      .replace(/快速搜索[:：][\s\S]*$/i, '')
      .replace(/Tools[\s\S]*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getTitleText() {
    const h1 = document.querySelector('h1')?.innerText || '';
    return cleanText(h1 || document.title || '');
  }

  function isSeriesPage() {
    const title = getTitleText();
    const body = (document.body && document.body.innerText || '').slice(0, 5000);
    return /第[一二三四五六七八九十百\d]+季|Season\s*\d+|S\d{1,2}\b|电视剧|剧集|集数|单集片长|首播/i.test(title + '\n' + body);
  }

  function getOriginalImdb() {
    const text = document.body && document.body.innerText || '';
    const m = text.match(IMDB_RE);
    return m && m[0] || '';
  }

  function idsFrom(value) {
    const m = String(value || '').match(IMDB_RE);
    return m ? Array.from(new Set(m)) : [];
  }

  function safeUrl(href) {
    try { return new URL(href, location.href); } catch (_) { return null; }
  }

  function readCache() {
    if (!CACHE_KEY) return '';
    try {
      const raw = sessionStorage.getItem(CACHE_KEY) || localStorage.getItem(CACHE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && data.id && /^tt\d{5,12}$/.test(data.id)) return data.id;
    } catch (_) {}
    return '';
  }

  function writeCache(id) {
    if (!CACHE_KEY || !/^tt\d{5,12}$/.test(id || '')) return;
    try {
      const raw = JSON.stringify({ id, t: Date.now() });
      sessionStorage.setItem(CACHE_KEY, raw);
      localStorage.setItem(CACHE_KEY, raw);
    } catch (_) {}
  }

  function isChdAnchor(a) {
    if (!a || !a.href) return false;
    const u = safeUrl(a.href);
    const text = cleanText(a.textContent || '').toUpperCase();
    return !!(u && CHD_HOST_RE.test(u.hostname)) || (text === 'CHD' && /torrents\.php/i.test(a.href));
  }

  function isPreferredResolvedAnchor(a) {
    if (!a || !a.href || isChdAnchor(a)) return false;
    const u = safeUrl(a.href);
    const host = u ? u.hostname : '';
    const text = cleanText(a.textContent || '').toUpperCase();
    // 这些站点在前面版本里已经能较稳定得到主剧集 IMDb；CHD 只复用最终结果，不参与候选。
    return /anthelion|audiences|beyond-hd|broadcasthe|btn|greatposterwall/i.test(host) ||
           /^(ADE|BHD|BTN|GPW|PTP)$/i.test(text);
  }

  function scoreCandidate(id, a) {
    const u = safeUrl(a.href);
    const host = u ? u.hostname : '';
    const text = cleanText(a.textContent || '').toUpperCase();
    let score = 0;
    if (/anthelion|audiences/i.test(host) || text === 'ADE') score += 120;
    if (/beyond-hd/i.test(host) || text === 'BHD') score += 100;
    if (/broadcasthe/i.test(host) || text === 'BTN') score += 90;
    if (/greatposterwall/i.test(host) || text === 'GPW') score += 40;
    if (/ptchdbits|chdbits/i.test(host) || text === 'CHD') score -= 1000;
    return score;
  }

  function candidateAnchors() {
    // 比 v36 少扫很多无关节点，降低 MutationObserver 触发时的开销。
    return Array.from(document.querySelectorAll(
      'a[href*="tt"],a[href*="beyond-hd"],a[href*="broadcasthe"],a[href*="anthelion"],a[href*="audiences"],a[href*="greatposterwall"]'
    ));
  }

  function pickFinalImdbFromPage() {
    if (!isSeriesPage()) return '';

    if (lockedFinalId) return lockedFinalId;

    const cached = readCache();
    if (cached) {
      lockedFinalId = cached;
      return cached;
    }

    const original = getOriginalImdb();
    const candidates = [];

    candidateAnchors().forEach(a => {
      if (!isPreferredResolvedAnchor(a)) return;
      idsFrom(a.href).forEach(id => {
        if (id && id !== original) candidates.push({ id, score: scoreCandidate(id, a) });
      });
    });

    // v36 兼容兜底：其它已生成的快捷搜索链接里，如果已经出现非豆瓣初始 IMDb，也可作为候选。
    if (!candidates.length) {
      document.querySelectorAll('a[href*="tt"]').forEach(a => {
        if (isChdAnchor(a)) return;
        const text = cleanText(a.textContent || '').toUpperCase();
        if (!/^(PTP|BHD|BTN|ADE|GPW|HDB|HDT)$/i.test(text)) return;
        idsFrom(a.href).forEach(id => {
          if (id && id !== original) candidates.push({ id, score: 10 });
        });
      });
    }

    if (!candidates.length) return '';

    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates[0].id;

    // 只锁定“非原始 IMDb”的最终候选，避免把豆瓣当前季/单集 IMDb 缓进去。
    if (chosen && chosen !== original) {
      lockedFinalId = chosen;
      writeCache(chosen);
    }
    return lockedFinalId || chosen;
  }

  function chdUrl(id) {
    return 'https://ptchdbits.co/torrents.php?incldead=0&spstate=0&inclbookmarked=0&search=' +
      encodeURIComponent(id) + '&search_area=4&search_mode=0';
  }

  function chdAnchors() {
    return Array.from(document.querySelectorAll('a[href*="chdbits"],a[href*="ptchdbits"],a[href*="torrents.php"]'))
      .filter(isChdAnchor);
  }

  function patchChdLinks() {
    const finalId = pickFinalImdbFromPage();
    if (!finalId) return false;

    chdAnchors().forEach(a => {
      const oldIds = idsFrom(a.href);
      if (oldIds[0] !== finalId || !/ptchdbits\.co/i.test(a.href)) {
        a.href = chdUrl(finalId);
        a.dataset.popcornFinalImdb = finalId;
        log('patched CHD href to final IMDb', finalId);
      }
    });
    return true;
  }

  async function waitForFinalImdb(timeoutMs) {
    const start = Date.now();
    let id = pickFinalImdbFromPage();

    while (!id && Date.now() - start < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 120));
      id = pickFinalImdbFromPage();
    }
    return id;
  }

  document.addEventListener('click', async function(e) {
    const a = e.target && e.target.closest && e.target.closest('a');
    if (!a || !isChdAnchor(a) || !isSeriesPage()) return;

    let finalId = pickFinalImdbFromPage();

    if (!finalId) {
      // 保留 v36 的可靠路径：点击过早时，等待最终主 IMDb 出现；不再打开 about:blank。
      e.preventDefault();
      e.stopImmediatePropagation();

      finalId = await waitForFinalImdb(2500);
      const fallback = idsFrom(a.href)[0] || getOriginalImdb();
      const targetId = finalId || fallback;
      const url = chdUrl(targetId);

      if (a.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) {
        window.open(url, '_blank', 'noopener');
      } else {
        window.location.href = url;
      }
      return;
    }

    a.href = chdUrl(finalId);
    a.dataset.popcornFinalImdb = finalId;
  }, true);

  let patchTimer = 0;
  function schedulePatch(delay = 80) {
    if (patchTimer) return;
    patchTimer = setTimeout(() => {
      patchTimer = 0;
      patchChdLinks();
    }, delay);
  }

  const mo = new MutationObserver(() => schedulePatch(80));
  try {
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
  } catch (_) {}

  // 预热：尽早、少量、多次，兼顾速度和异步生成链接。
  [0, 120, 300, 700, 1200, 2200, 3800].forEach(ms => setTimeout(patchChdLinks, ms));
})();
