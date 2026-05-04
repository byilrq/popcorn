// Isolated-world bridge. No inline script injection: page-world files are injected by the
// extension service worker via chrome.scripting.executeScript({ world: 'MAIN' }).
(() => {
  if (window.__AUTO_FEED_EXT_BRIDGE_INSTALLED__) return;
  window.__AUTO_FEED_EXT_BRIDGE_INSTALLED__ = true;

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
