// Isolated-world bridge. No inline script injection: page-world files are injected by the
// extension service worker via chrome.scripting.executeScript({ world: 'MAIN' }).
(() => {

const AUTO_FEED_ALLOWED_HOSTS = [
  "1ptba.com",
  "3wmg.com",
  "52pt.site",
  "anthelion.me",
  "asiancinema.me",
  "assrt.net",
  "audiences.me",
  "avistaz.to",
  "azusa.wiki",
  "beyond-hd.me",
  "blutopia.cc",
  "blutopia.xyz",
  "broadcasthe.net",
  "byr.pt",
  "carpt.net",
  "cinemageddon.net",
  "cinematik.net",
  "cinemaz.to",
  "club.hares.top",
  "cyanbug.net",
  "dajiao.cyou",
  "dicmusic.com",
  "discfan.net",
  "douban.com",
  "dragonhd.xyz",
  "et8.org",
  "filelist.io",
  "gamegamept.com",
  "greatposterwall.com",
  "haidan.video",
  "hd-only.org",
  "hd-space.org",
  "hd-torrents.org",
  "hdarea.club",
  "hdatmos.club",
  "hdbits.org",
  "hdchina.org",
  "hdcity.city",
  "hddolby.com",
  "hdf.world",
  "hdfans.org",
  "hdfun.me",
  "hdhome.org",
  "hdmayi.com",
  "hdpt.xyz",
  "hdroute.org",
  "hdsky.me",
  "hdtime.org",
  "hdvideo.one",
  "hhanclub.top",
  "hitpt.com",
  "htpt.cc",
  "hudbt.hust.edu.cn",
  "icc2022.com",
  "imdb.com",
  "joyhd.net",
  "jptv.club",
  "karagarga.in",
  "kp.m-team.cc",
  "kufei.org",
  "leaves.red",
  "lemonhd.org",
  "m.douban.com",
  "monikadesign.uk",
  "morethantv.me",
  "movie.douban.com",
  "nanyangpt.com",
  "nebulance.io",
  "npupt.com",
  "nzbs.in",
  "okpt.net",
  "open.cd",
  "orpheus.network",
  "oshen.win",
  "ourbits.club",
  "pandapt.net",
  "passthepopcorn.me",
  "piggo.me",
  "privatehd.to",
  "pt.0ff.cc",
  "pt.2xfree.org",
  "pt.btschool.club",
  "pt.eastgame.org",
  "pt.gtk.pw",
  "pt.hd4fans.org",
  "pt.hdbd.us",
  "pt.hdpost.top",
  "pt.hdupt.com",
  "pt.itzmx.com",
  "pt.keepfrds.com",
  "pt.sjtu.edu.cn",
  "pt.soulvoice.club",
  "ptcafe.club",
  "ptchdbits.co",
  "ptchina.org",
  "pterclub.com",
  "pthome.net",
  "ptlsp.com",
  "ptsbao.club",
  "pttime.org",
  "redacted.ch",
  "resource.xidian.edu.cn",
  "rousi.zip",
  "search.douban.com",
  "secret-cinema.pw",
  "shadowthein.net",
  "springsunday.net",
  "srvfi.top",
  "tjupt.org",
  "totheglory.im",
  "tv-vault.me",
  "ubits.club",
  "uhdbits.org",
  "ultrahd.net",
  "wintersakura.net",
  "wukongwendao.top",
  "www.3wmg.com",
  "www.cinematik.net",
  "www.douban.com",
  "www.dragonhd.xyz",
  "www.gamegamept.com",
  "www.haidan.video",
  "www.hddolby.com",
  "www.hitpt.com",
  "www.htpt.cc",
  "www.icc2022.com",
  "www.imdb.com",
  "www.joyhd.net",
  "www.morethantv.me",
  "www.okpt.net",
  "www.oshen.win",
  "www.pthome.net",
  "www.ptlsp.com",
  "www.pttime.org",
  "www.tjupt.org",
  "xingtan.one",
  "xthor.tk",
  "zhuque.in",
  "zmk.pw",
  "zmpt.cc"
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

  if (shouldSkipAutoFeedInjection()) return;

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
})();
