// MAIN-world Tampermonkey compatibility shim for auto_feed.
(() => {
  const init = window.__AUTO_FEED_EXT_INIT__ || { storage:{}, extensionBase:'' };
  window.unsafeWindow = window;
  const cache = Object.assign(Object.create(null), init.storage || {});
  if (!cache.host_link) {
    try { cache.host_link = location.origin + '/usercp.php?action=personal'; } catch (e) {}
  }
  let seq = 1;
  const pending = new Map();

  function request(type, payload) {
    const id = 'af_' + Date.now() + '_' + (seq++);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.dispatchEvent(new CustomEvent('auto_feed_ext_request', { detail: { id, type, payload } }));
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error('auto_feed extension request timeout: ' + type));
      }, 120000);
    });
  }

  window.addEventListener('auto_feed_ext_response', (event) => {
    const { id, response } = event.detail || {};
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (response && response.ok === false) p.reject(new Error(response.error || 'extension error'));
    else p.resolve(response ? response.data : undefined);
  });


  // Extension mode: original script creates links like host_link#setting. In standalone mode,
  // open the extension options page instead of relying on a NexusPHP host page.
  document.addEventListener('click', (event) => {
    const a = event.target && event.target.closest ? event.target.closest('a') : null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const id = a.id || '';
    const text = (a.textContent || '').trim();
    if (id === 'setting_link' || id === 'reset_host' || text === '脚本设置' || text === '重置托管' || /#setting(?:$|\?)/.test(href)) {
      event.preventDefault();
      event.stopPropagation();
      request('open_options', { section:'settings' }).catch(console.error);
    }
  }, true);

  window.addEventListener('auto_feed_ext_storage_changed', (event) => {
    const delta = event.detail || {};
    for (const [k, v] of Object.entries(delta)) {
      if (typeof v === 'undefined') delete cache[k];
      else cache[k] = v;
    }
  });

  async function serializeBody(data) {
    if (!data) return { kind:'empty' };
    if (data instanceof FormData) {
      const entries = [];
      for (const [key, val] of data.entries()) {
        if (val instanceof Blob) {
          entries.push({ key, isBlob:true, name:val.name || 'blob', type:val.type || '', bytes:Array.from(new Uint8Array(await val.arrayBuffer())) });
        } else {
          entries.push({ key, value:String(val) });
        }
      }
      return { kind:'formData', entries };
    }
    if (data instanceof Blob) {
      return { kind:'blob', type:data.type || '', bytes:Array.from(new Uint8Array(await data.arrayBuffer())) };
    }
    if (data instanceof ArrayBuffer) {
      return { kind:'arrayBuffer', bytes:Array.from(new Uint8Array(data)) };
    }
    return { kind:'text', text:String(data) };
  }

  function decodeResponse(res, responseType) {
    if (!res) return res;
    if (responseType === 'blob') {
      const bytes = new Uint8Array(res.responseBytes || []);
      res.response = new Blob([bytes], { type: res.mimeType || '' });
    } else if (responseType === 'arraybuffer') {
      res.response = new Uint8Array(res.responseBytes || []).buffer;
    }
    delete res.responseBytes;
    return res;
  }

  window.GM_getValue = function(key, defaultValue) {
    if (key === 'host_link' && !Object.prototype.hasOwnProperty.call(cache, key)) {
      try { return location.origin + '/usercp.php?action=personal'; } catch (e) {}
    }
    return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : defaultValue;
  };
  window.GM_setValue = function(key, value) {
    cache[key] = value;
    request('storage_set', { key, value }).catch(console.error);
  };
  window.GM_deleteValue = function(key) {
    delete cache[key];
    request('storage_remove', { key }).catch(console.error);
  };
  window.GM_addStyle = function(css) {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
  };
  window.GM_setClipboard = function(text) {
    const value = String(text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).catch(() => request('clipboard', { text:value }).catch(console.error));
    } else {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
  };
  window.GM_download = function(options, name) {
    const payload = typeof options === 'string' ? { url:options, filename:name } : options;
    request('download', payload).catch(console.error);
  };
  window.GM_getResourceText = function(name) {
    // The latest repository does not ship hdroute as an @resource. Keep null to match a missing TM resource.
    return null;
  };
  window.GM_getResourceURL = function(name) { return null; };
  window.GM_xmlhttpRequest = function(details) {
    details = details || {};
    (async () => {
      if (!details.url) {
        throw new Error('GM_xmlhttpRequest missing url');
      }
      const responseType = details.responseType || 'text';
      const payload = {
        method: details.method || 'GET',
        url: String(details.url),
        headers: details.headers || {},
        responseType,
        timeout: details.timeout || 0,
        data: await serializeBody(details.data)
      };
      const res = decodeResponse(await request('xhr', payload), payload.responseType) || {};
      // Some original callbacks assume these are always present, as in Tampermonkey.
      if (typeof res.responseText !== 'string') res.responseText = '';
      if (typeof res.responseHeaders !== 'string') res.responseHeaders = '';
      if (typeof res.finalUrl !== 'string') res.finalUrl = payload.url;
      if (typeof res.statusText !== 'string') res.statusText = '';
      if (payload.responseType === 'json') {
        if (typeof res.response === 'undefined') {
          try { res.response = res.responseText ? JSON.parse(res.responseText) : null; } catch (e) { res.response = null; }
        }
      } else if (!payload.responseType || payload.responseType === 'text') {
        if (typeof res.response !== 'string') res.response = res.responseText;
      }
      if (details.onreadystatechange) {
        try { details.onreadystatechange(res); } catch (e) { console.error('[auto_feed onreadystatechange]', e); }
      }
      if (details.onload) {
        try { details.onload(res); } catch (e) {
          const msg = String(e && (e.message || e) || '');
          if (/Cannot read properties of undefined \(reading '(?:match|replace)'\)|Cannot read property '(?:match|replace)' of undefined/.test(msg)) {
            console.debug('[auto_feed onload ignored empty optional string method]', e);
          } else {
            console.error('[auto_feed onload]', e);
          }
        }
      }
    })().catch((err) => {
      if (/timeout/i.test(String(err && err.message || err)) && details.ontimeout) details.ontimeout(err);
      else if (details.onerror) details.onerror(err);
      else console.warn('[auto_feed GM_xmlhttpRequest]', err);
    });
    return { abort(){} };
  };
  window.GM = {
    getValue: (k,d) => Promise.resolve(window.GM_getValue(k,d)),
    setValue: (k,v) => Promise.resolve(window.GM_setValue(k,v)),
    deleteValue: (k) => Promise.resolve(window.GM_deleteValue(k)),
    xmlHttpRequest: (d) => window.GM_xmlhttpRequest(d),
    setClipboard: (t) => Promise.resolve(window.GM_setClipboard(t)),
    addStyle: (c) => window.GM_addStyle(c)
  };
  window.GM_info = { script: { name:'Popcorn', version:'2.1.0.9' }, scriptHandler:'Popcorn' };
})();
