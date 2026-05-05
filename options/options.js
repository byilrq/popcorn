const $ = (id) => document.getElementById(id);
const $$ = (sel, root=document) => root ? Array.from(root.querySelectorAll(sel)) : [];
const D = window.AUTO_FEED_DEFAULTS;
let current = {};
let quickSearchLibrary = [];

const QUICK_DEFAULT_KEYS = ['PTP','BHD','CHD','ADE','GPW','BTN','豆瓣'];
const QUICK_SITE_KEY_MAP = { PTP:'PTP', BHD:'BHD', CHD:'CHD', ADE:'ADE', GPW:'GPW', BTN:'BTN', '豆瓣':'豆瓣', Douban:'豆瓣' };
const DEFAULT_SERIES_SEARCH_SITES = ['BHD','BTN'];
const FORWARD_SITE_ALLOWLIST = ['Audiences','BHD','BTN','CHDBits','GPW','HDB','KG','MTeam','OPS','OurBits','PTP','RED','TTG'];
function isForwardSettingSite(k){ return FORWARD_SITE_ALLOWLIST.includes(k); }
function seriesKeyFromHtml(html){
  const known = quickSiteKeyFromHtml(html);
  if (known) return known;
  return extractAnchorName(html).trim();
}
function normalizeSeriesSearchSites(list, searchList){
  const available = Array.from(new Set((searchList || []).map(seriesKeyFromHtml).filter(Boolean)));
  let picked = Array.isArray(list) ? list.map(x => String(x || '').trim()).filter(Boolean) : [];
  if (!picked.length) picked = DEFAULT_SERIES_SEARCH_SITES.slice();
  return Array.from(new Set(picked)).filter(k => available.includes(k));
}
const LEGACY_QUICK_KEYS = ['PTP','BHD','GPW','BLU','TTG','MTeam','KG'];
function normalizeSearchList(lines){
  const list = (Array.isArray(lines) ? lines : []).map(x => String(x || '').trim()).filter(Boolean);
  const keys = list.map(quickKeyFromHtml).filter(Boolean);
  const looksLegacy = LEGACY_QUICK_KEYS.every(k => keys.includes(k)) && !keys.includes('CHD') && !keys.includes('ADE') && !keys.includes('BTN') && !keys.includes('豆瓣');
  if (!list.length || looksLegacy) return structuredClone(D.default_search_list);
  return list;
}
function quickItemHtml(key){
  const item = quickSearchLibrary.find(x => x.name.toLowerCase() === String(key).toLowerCase());
  if (item && item.html) return item.html;
  const fallback = {
    "PTP": "<a href=\"https://passthepopcorn.me/torrents.php?searchstr={imdbid}\" target=\"_blank\">PTP</a>",
    "BHD": "<a href=\"https://beyond-hd.me/torrents?search={imdbid}\" target=\"_blank\">BHD</a>",
    "CHD": "<a href=\"https://ptchdbits.co/torrents.php?incldead=0&spstate=0&inclbookmarked=0&search={imdbid}&search_area=4&search_mode=0\" target=\"_blank\">CHD</a>",
    "ADE": "<a href=\"https://audiences.me/torrents.php?cat401=1&cat402=1&cat403=1&incldead=0&spstate=0&inclbookmarked=0&search={imdbid}&search_area=4\" target=\"_blank\">ADE</a>",
    "GPW": "<a href=\"https://greatposterwall.com/torrents.php?searchstr={imdbid}\" target=\"_blank\">GPW</a>",
    "BTN": "<a href=\"https://broadcasthe.net/torrents.php?action=advanced&searchstr=&searchtags=&tags_type=1&groupdesc=&imdbid={imdbid}\" target=\"_blank\">BTN</a>",
    "豆瓣": "<a href=\"https://search.douban.com/movie/subject_search?search_text={imdbid}&cat=1002\" target=\"_blank\">豆瓣</a>"
  };
  return fallback[key] || '';
}
function quickKeyFromHtml(html){
  const name = extractAnchorName(html).toLowerCase();
  const href = extractAnchorHref(html).toLowerCase();
  const nameMap = { ptp:'PTP', bhd:'BHD', chd:'CHD', chdbits:'CHD', ade:'ADE', audiences:'ADE', gpw:'GPW', btn:'BTN', douban:'豆瓣', '豆瓣':'豆瓣' };
  if (nameMap[name]) return nameMap[name];
  if (href.includes('passthepopcorn')) return 'PTP';
  if (href.includes('beyond-hd')) return 'BHD';
  if (href.includes('chdbits') || href.includes('chddiy')) return 'CHD';
  if (href.includes('audiences')) return 'ADE';
  if (href.includes('greatposterwall')) return 'GPW';
  if (href.includes('broadcasthe')) return 'BTN';
  if (href.includes('douban.com')) return '豆瓣';
  return '';
}
function quickSiteKeyFromHtml(html){
  const key = quickKeyFromHtml(html);
  if (QUICK_SITE_KEY_MAP[key]) return QUICK_SITE_KEY_MAP[key];
  const name = extractAnchorName(html);
  const found = quickSearchLibrary.find(x => x.name.toLowerCase() === name.toLowerCase());
  return found ? (QUICK_SITE_KEY_MAP[found.name] || found.name) : '';
}
function syncQuickTextareaFromToggles(){ /* v12: no checkbox sync; current list is the source of truth. */ }
function renderQuickToggles(st){ /* v12: no toggle UI. */ }

function setStatus(id, s, bad=false){ const el=$(id); if(!el) return; el.textContent=s; el.classList.toggle('bad', !!bad); }
function parseMaybeJson(v, fallback){ if (v == null || v === '') return fallback; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fallback; } }
function parseCsvJson(v, fallback){ const x=parseMaybeJson(v,null); if (Array.isArray(x)) return x; if (typeof x==='string') return x ? x.split(',').filter(Boolean) : []; return fallback; }
function stringifyCsv(arr){ return JSON.stringify((arr||[]).join(',')); }
function num(v, d=0){ return v === undefined || v === null || v === '' ? d : Number(v); }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function normalizeUrl(u){
  u = String(u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); return x.href; } catch { return ''; }
}

const KEEPALIVE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function formatSigninTime(iso){
  if (!iso) return '从未成功';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('zh-CN', { hour12:false });
}
function formatNextKeepaliveTime(iso){
  if (!iso) return '等待首次成功';
  const last = new Date(iso);
  if (Number.isNaN(last.getTime())) return '时间无效';
  const next = new Date(last.getTime() + KEEPALIVE_INTERVAL_MS);
  const now = Date.now();
  if (next.getTime() <= now) return '已到期，下次启动会执行';
  return next.toLocaleString('zh-CN', { hour12:false });
}
function signinStatusText(x){
  if (!x || !x.lastStatus) return '未运行';
  if (x.lastStatus === 'success') return '成功';
  if (x.lastStatus === 'running') return '运行中';
  if (x.lastStatus === 'timeout') return '超时';
  if (x.lastStatus === 'failed') return '失败';
  return x.lastStatus;
}
function signinStatusClass(x){
  const st = x && x.lastStatus;
  if (st === 'success') return 'ok';
  if (st === 'running') return 'running';
  if (st === 'failed' || st === 'timeout') return 'bad';
  return 'idle';
}
function extractAnchorName(html){
  const m = String(html || '').match(/>([^<>]+)<\/a>/i);
  return m ? m[1].trim() : String(html || '').slice(0, 40);
}
function extractAnchorHref(html){
  const m = String(html || '').match(/href=["']([^"']+)/i);
  return m ? m[1] : '';
}

function defaultsState(data){
  const hidden = parseCsvJson(data.__auto_feed_hidden_sites, []);
  const usedSiteInfo = parseMaybeJson(data.used_site_info, structuredClone(D.default_site_info));
  for (const [k,v] of Object.entries(D.default_site_info)) if (!usedSiteInfo[k]) usedSiteInfo[k]=structuredClone(v);
  for (const k of hidden) if (usedSiteInfo[k]) usedSiteInfo[k].enable = 0;
  const siteOrderRaw = parseCsvJson(data.site_order, Object.keys(D.default_site_info).sort());
  const siteOrder = siteOrderRaw.filter(k=>D.default_site_info[k] && !hidden.includes(k));
  for (const k of Object.keys(D.default_site_info).sort()) if (!siteOrder.includes(k) && !hidden.includes(k)) siteOrder.push(k);
  let common = parseCsvJson(data.used_common_sites, D.default_common_sites).filter(k=>!hidden.includes(k));
  const rawShowSearch = parseMaybeJson(data.show_search_urls, structuredClone(D.default_show_search_urls));
  const showSearch = {};
  for (const k of Object.keys(D.default_show_search_urls)) showSearch[k] = rawShowSearch && rawShowSearch[k] !== 0 ? 1 : 0;
  const extra = parseMaybeJson(data.extra_settings, structuredClone(D.default_extra_settings));
  for (const [k,v] of Object.entries(D.default_extra_settings)) if (!extra[k]) extra[k]=structuredClone(v);
  const rehost = parseMaybeJson(data.used_rehost_img_info, structuredClone(D.default_rehost_img_info));
  for (const [k,v] of Object.entries(D.default_rehost_img_info)) if (!rehost[k]) rehost[k]=structuredClone(v);
  const searchList = normalizeSearchList(parseCsvJson(data.used_search_list, D.default_search_list));
  const derivedCommon = Array.from(new Set(searchList.map(quickSiteKeyFromHtml).filter(Boolean))).filter(k=>!hidden.includes(k));
  if (!common.length || JSON.stringify(common) !== JSON.stringify(derivedCommon)) common = derivedCommon;
  const signinSites = parseMaybeJson(data.__auto_feed_keepalive_sites, []);
  const seriesSites = normalizeSeriesSearchSites(parseCsvJson(data.__popcorn_series_search_sites, DEFAULT_SERIES_SEARCH_SITES), searchList);
  return { usedSiteInfo, siteOrder, common, showSearch, extra, rehost, searchList, hidden, signinSites, seriesSites };
}

function renderQuickSelected(st){
  const box = $('quick_selected_list');
  if (!box) return;
  const items = st.searchList.map((html, idx) => ({ idx, html, name: extractAnchorName(html), href: extractAnchorHref(html) }));
  if (!items.length) { box.innerHTML = '<span class="muted small">当前没有快速搜索站点。</span>'; return; }
  box.innerHTML = items.map(x => `<span class="chip" title="${esc(x.href)}"><b>${esc(x.name)}</b><button data-remove-quick="${x.idx}">移除</button></span>`).join('');
}
function renderSeriesSearchSites(st){
  const box = $('series_search_sites');
  if (!box) return;
  const items = Array.from(new Map(st.searchList.map(html => {
    const key = seriesKeyFromHtml(html);
    return [key, { key, name: extractAnchorName(html), href: extractAnchorHref(html) }];
  }).filter(([k]) => !!k)).values());
  if (!items.length) { box.innerHTML = '<span class="muted small">当前没有可配置的快速搜索站点。</span>'; return; }
  box.innerHTML = items.map(x => `<label class="chip" title="${esc(x.href)}"><input type="checkbox" class="series-search-site" data-series-site="${esc(x.key)}" ${st.seriesSites.includes(x.key) ? 'checked' : ''}> <b>${esc(x.name)}</b></label>`).join('');
}

function renderSignin(st){
  $('keepalive_enabled').checked = !!num(current.__auto_feed_keepalive_enabled, 0);
  $('keepalive_autoclose').checked = current.__auto_feed_keepalive_autoclose === undefined ? true : !!num(current.__auto_feed_keepalive_autoclose, 1);
  $('keepalive_close_delay').value = Number(current.__auto_feed_keepalive_close_delay || 2);
  const rows = (st.signinSites || []).map((x, i) => `
    <div class="signin-row" data-index="${i}" data-last-success-at="${esc(x.lastSuccessAt || '')}" data-last-success-date="${esc(x.lastSuccessDate || '')}" data-last-attempt-at="${esc(x.lastAttemptAt || '')}" data-last-status="${esc(x.lastStatus || '')}" data-last-error="${esc(x.lastError || '')}">
      <label><input type="checkbox" class="signin-enabled" ${x.enabled !== false ? 'checked':''}>启用</label>
      <input class="signin-name locked" value="${esc(x.name || '')}" placeholder="站点名" readonly>
      <input class="signin-url locked" value="${esc(x.url || '')}" placeholder="https://example.com/" readonly>
      <span class="signin-state ${signinStatusClass(x)}" title="${esc(x.lastError || '')}">${signinStatusText(x)}</span>
      <span class="signin-time">最近成功：${esc(formatSigninTime(x.lastSuccessAt))}</span>
      <span class="signin-time">下次保活：${esc(formatNextKeepaliveTime(x.lastSuccessAt))}</span>
      <button class="remove-signin" type="button">删除</button>
    </div>`).join('');
  $('signin_sites').innerHTML = rows || '<p class="muted small">还没有添加保活站点。</p>';
}

function renderFromData(data){
  current = data || {};
  const st = defaultsState(current);
  $('used_tmdb_key').value = current.used_tmdb_key ?? '0f79586eb9d92afa2b7266f7928b055c';
  $('used_ptp_img_key').value = current.used_ptp_img_key ?? '';
  $('used_tl_rss_key').value = current.used_tl_rss_key ?? '';
  $('if_uplver').checked = !!num(current.if_uplver, 1);
  $('if_douban_jump').checked = !!num(current.if_douban_jump, 1);
  $('if_imdb_jump').checked = !!num(current.if_imdb_jump, 1);
  $('hdb_hide_douban').checked = !!num(current.hdb_hide_douban, 0);
  $('chd_use_backup_url').checked = !!num(current.chd_use_backup_url, 0);
  $('nhd_use_v6_url').checked = !!num(current.nhd_use_v6_url, 0);
  setRadio('imdb2db', String(current.imdb2db_chosen ?? 0));
  setRadio('ptgen', String(current.api_chosen ?? 3));
  setRadio('tldomain', String(current.tldomain ?? 0));

  $('site_grid').innerHTML = st.siteOrder.filter(isForwardSettingSite).map(k=>`<label><input type="checkbox" class="support_site" data-site="${esc(k)}" ${st.usedSiteInfo[k]?.enable ? 'checked':''}><span>${esc(k)}</span></label>`).join('');
  renderQuickToggles(st);
  $('extra_grid').innerHTML = Object.entries(st.extra).map(([k,v])=>`<label><input type="checkbox" class="extra" data-key="${esc(k)}" ${v.enable ? 'checked':''}>${esc(v.title || k)}</label>`).join('');
  $('rehost_keys').innerHTML = Object.entries(st.rehost).filter(([k])=>k!=='catbox').map(([k,v])=>`<label>${esc(k)} apikey<input class="rehost_key" data-key="${esc(k)}" value="${esc(v['api-key']||'')}"></label>`).join('');
  $('used_search_list').value = st.searchList.join('\n');
  renderQuickSelected(st);
  renderSeriesSearchSites(st);
  renderSignin(st);
  $('json').value = JSON.stringify(current, null, 2);
}
function setRadio(name, value){ const el=document.querySelector(`input[name="${name}"][value="${value}"]`); if(el) el.checked=true; }
function getRadio(name, fallback){ return document.querySelector(`input[name="${name}"]:checked`)?.value ?? fallback; }

async function loadQuickSearchLibrary(){
  try { quickSearchLibrary = await fetch('../data/quick_search_library.json').then(r=>r.json()); } catch(e) { quickSearchLibrary = []; }
  const dl = $('quick_search_library');
  if (dl) dl.innerHTML = quickSearchLibrary.map(x=>`<option value="${esc(x.name)}">${esc(x.href)}</option>`).join('');
}
function selectedQuickSearch(){
  const v = $('quick_search_pick')?.value?.trim();
  if (!v) return null;
  return quickSearchLibrary.find(x=>x.name.toLowerCase()===v.toLowerCase()) || quickSearchLibrary.find(x=>x.name.toLowerCase().includes(v.toLowerCase()));
}
async function load(){ await loadQuickSearchLibrary(); const data = await chrome.storage.local.get(null); renderFromData(data); const st = defaultsState(data); const normalizedSearch = stringifyCsv(st.searchList); const normalizedCommon = stringifyCsv(st.common); const normalizedSeries = stringifyCsv(st.seriesSites); if (data.used_search_list !== normalizedSearch || data.used_common_sites !== normalizedCommon || data.__popcorn_series_search_sites !== normalizedSeries) { await chrome.storage.local.set({ used_search_list: normalizedSearch, used_common_sites: normalizedCommon, __popcorn_series_search_sites: normalizedSeries }); current = { ...data, used_search_list: normalizedSearch, used_common_sites: normalizedCommon, __popcorn_series_search_sites: normalizedSeries }; renderFromData(current); } setStatus('global_status','已加载当前设置'); }
function collect(){
  const st = defaultsState(current);
  const data = {...current};
  const siteOrder = st.siteOrder;
  const usedSiteInfo = st.usedSiteInfo;
  $$('.support_site').forEach(cb => { const k=cb.dataset.site; usedSiteInfo[k] = usedSiteInfo[k] || structuredClone(D.default_site_info[k]); usedSiteInfo[k].enable = cb.checked ? 1 : 0; });
  const quickLines = $('used_search_list').value.split('\n').map(s=>s.trim()).filter(Boolean);
  const common = Array.from(new Set(quickLines.map(quickSiteKeyFromHtml).filter(Boolean)));
  const showSearch = {...st.showSearch};
  for (const k of Object.keys(showSearch)) showSearch[k] = 0;
  for (const line of quickLines) {
    const key = quickKeyFromHtml(line);
    if (key) showSearch[key] = 1;
  }
  const extra = st.extra; $$('.extra').forEach(cb=>{ extra[cb.dataset.key]=extra[cb.dataset.key]||{}; extra[cb.dataset.key].enable=cb.checked?1:0; });
  const rehost = st.rehost; $$('.rehost_key').forEach(inp=>{ rehost[inp.dataset.key]=rehost[inp.dataset.key]||{}; rehost[inp.dataset.key]['api-key']=inp.value.trim(); });
  const signinSites = $$('.signin-row').map(row => ({
    enabled: row.querySelector('.signin-enabled').checked,
    name: row.querySelector('.signin-name').value.trim(),
    url: normalizeUrl(row.querySelector('.signin-url').value),
    lastSuccessAt: row.dataset.lastSuccessAt || '',
    lastSuccessDate: row.dataset.lastSuccessDate || '',
    lastAttemptAt: row.dataset.lastAttemptAt || '',
    lastStatus: row.dataset.lastStatus || '',
    lastError: row.dataset.lastError || ''
  })).filter(x => x.name || x.url).map(x => ({...x, name: x.name || new URL(x.url).hostname}));
  const seriesSites = $$('.series-search-site').filter(cb => cb.checked).map(cb => cb.dataset.seriesSite).filter(Boolean);
  data.site_order = stringifyCsv(siteOrder);
  data.used_site_info = JSON.stringify(usedSiteInfo);
  data.used_common_sites = stringifyCsv(common);
  data.show_search_urls = JSON.stringify(showSearch);
  data.extra_settings = JSON.stringify(extra);
  data.used_search_list = stringifyCsv($('used_search_list').value.split('\n').map(s=>s.trim()).filter(Boolean));
  data.used_tmdb_key = $('used_tmdb_key').value.trim();
  data.used_ptp_img_key = $('used_ptp_img_key').value.trim();
  data.used_tl_rss_key = $('used_tl_rss_key').value.trim();
  data.imdb2db_chosen = getRadio('imdb2db', '0');
  data.api_chosen = getRadio('ptgen', '3');
  data.tldomain = getRadio('tldomain', '0');
  data.if_uplver = $('if_uplver').checked ? 1 : 0;
  data.if_douban_jump = $('if_douban_jump').checked ? 1 : 0;
  data.if_imdb_jump = $('if_imdb_jump').checked ? 1 : 0;
  data.hdb_hide_douban = $('hdb_hide_douban').checked ? 1 : 0;
  data.chd_use_backup_url = $('chd_use_backup_url').checked ? 1 : 0;
  data.nhd_use_v6_url = $('nhd_use_v6_url').checked ? 1 : 0;
  data.used_rehost_img_info = JSON.stringify(rehost);
  data.__auto_feed_keepalive_enabled = $('keepalive_enabled').checked ? 1 : 0;
  data.__auto_feed_keepalive_autoclose = $('keepalive_autoclose').checked ? 1 : 0;
  data.__auto_feed_keepalive_close_delay = Math.max(1, Math.min(30, Number($('keepalive_close_delay').value || 2)));
  data.__auto_feed_keepalive_sites = signinSites;
  data.__popcorn_series_search_sites = stringifyCsv(seriesSites);
  return data;
}
async function saveAll(){
  const data=collect();
  await chrome.storage.local.set(data);
  renderFromData(await chrome.storage.local.get(null));
  setStatus('global_status','已保存。刷新目标 PT 页面后生效');
}

$$('.tabs button').forEach(btn=>btn.onclick=()=>{ $$('.tabs button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); $$('.tab-panel').forEach(p=>p.classList.remove('active')); $(`tab-${btn.dataset.tab}`).classList.add('active'); });
$('reload').onclick=load;
$('save_all').onclick=saveAll;
$('select_all').onclick=()=>$$('.support_site').forEach(cb=>cb.checked=true);
$('unselect_all').onclick=()=>$$('.support_site').forEach(cb=>cb.checked=false);
$('delete_selected_sites').onclick=async()=>{
  const selected = $$('.support_site').filter(cb=>cb.checked).map(cb=>cb.dataset.site);
  if (!selected.length) { setStatus('global_status','请先勾选要删除/隐藏的站点', true); return; }
  if (!confirm(`确定从设置页隐藏 ${selected.length} 个站点？可通过“恢复已删除站点”找回。`)) return;
  const st = defaultsState(current);
  const hidden = Array.from(new Set([...(st.hidden||[]), ...selected]));
  const usedSiteInfo = st.usedSiteInfo;
  selected.forEach(k => { if (usedSiteInfo[k]) usedSiteInfo[k].enable = 0; });
  await chrome.storage.local.set({ __auto_feed_hidden_sites: stringifyCsv(hidden), used_site_info: JSON.stringify(usedSiteInfo), site_order: stringifyCsv(st.siteOrder.filter(k=>!selected.includes(k))) });
  await load(); document.querySelector('[data-tab="sites"]').click();
  setStatus('global_status', '已隐藏选中的转发站点');
};
$('restore_deleted_sites').onclick=async()=>{ await chrome.storage.local.set({ __auto_feed_hidden_sites: stringifyCsv([]) }); await load(); document.querySelector('[data-tab="sites"]').click(); setStatus('global_status','已恢复所有隐藏站点'); };
$('site_grid').addEventListener('change',()=>{ const data=collect(); current=data; renderFromData(data); document.querySelector('[data-tab="sites"]').click(); });
$('used_search_list').addEventListener('input',()=>{ const data=collect(); current=data; const st=defaultsState(data); renderQuickToggles(st); renderQuickSelected(st); renderSeriesSearchSites(st); });
if ($('series_search_sites')) $('series_search_sites').addEventListener('change',()=>{ const data=collect(); current=data; const st=defaultsState(data); renderSeriesSearchSites(st); });
$('quick_selected_list').addEventListener('click',(e)=>{
  const btn = e.target.closest('[data-remove-quick]');
  if (!btn) return;
  const idx = Number(btn.dataset.removeQuick);
  const lines = $('used_search_list').value.split('\n').map(s=>s.trim()).filter(Boolean);
  lines.splice(idx, 1);
  $('used_search_list').value = lines.join('\n');
  const data=collect(); current=data; const st=defaultsState(data); renderQuickToggles(st); renderQuickSelected(st);
  setStatus('global_status','已从快速搜索列表移除，记得保存全部设置');
});
$('save_json').onclick=async()=>{ try{ const data=JSON.parse($('json').value); await chrome.storage.local.clear(); await chrome.storage.local.set(data); renderFromData(data); setStatus('json_status','已保存 JSON，刷新目标页面后生效'); }catch(e){ setStatus('json_status','JSON 格式错误：'+e.message,true); } };
$('reset').onclick=async()=>{ if(!confirm('确定清空当前设置并恢复扩展内置备份？')) return; chrome.runtime.sendMessage({type:'reset_storage'}, async(resp)=>{ if(resp&&resp.ok){ await load(); setStatus('json_status','已恢复内置备份'); } else setStatus('json_status','恢复失败：'+(resp&&resp.error),true); }); };
$('export').onclick=()=>{ const blob=new Blob([$('json').value],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='popcorn.storage.export.json'; a.click(); URL.revokeObjectURL(url); };
$('import').onchange=async(e)=>{ const f=e.target.files[0]; if(!f)return; $('json').value=await f.text(); setStatus('json_status','已读取导入文件，点击“保存 JSON”后生效'); };

$('add_signin_site').onclick=()=>{
  const name = $('signin_name').value.trim();
  const url = normalizeUrl($('signin_url').value);
  if (!url) { setStatus('signin_status','请输入有效站点地址', true); return; }
  const st = defaultsState(collect());
  st.signinSites.push({ enabled:true, name: name || new URL(url).hostname, url, lastSuccessAt:'', lastSuccessDate:'', lastAttemptAt:'', lastStatus:'', lastError:'' });
  current = { ...collect(), __auto_feed_keepalive_sites: st.signinSites };
  $('signin_name').value = ''; $('signin_url').value = '';
  renderSignin(defaultsState(current));
  setStatus('signin_status','已添加，记得保存全部设置');
};
$('signin_sites').addEventListener('click',(e)=>{
  if (!e.target.classList.contains('remove-signin')) return;
  const row = e.target.closest('.signin-row');
  row.remove();
  setStatus('signin_status','已删除，记得保存全部设置');
});
$('run_keepalive_now').onclick=async()=>{
  await chrome.storage.local.set(collect());
  chrome.runtime.sendMessage({ type:'run_keepalive', payload:{ force:true } }, (resp)=>{
    if (resp && resp.ok) {
      const skipped = resp.data?.skippedCount || 0;
      setStatus('signin_status', `已访问 ${resp.data?.count || 0} 个站点${skipped ? `，跳过 ${skipped} 个 7 天内已成功站点` : ''}`);
      load();
    } else setStatus('signin_status', '执行失败：' + (resp && resp.error || '未知错误'), true);
  });
};

if ($('quick_search_pick')) $('quick_search_pick').addEventListener('input', () => {
  const item = selectedQuickSearch();
  $('quick_search_preview').textContent = item ? item.html : '';
});
if ($('add_quick_search')) $('add_quick_search').onclick = (e) => {
  e.preventDefault();
  const item = selectedQuickSearch();
  if (!item) { setStatus('global_status', '没有从内置网站库找到这个站点', true); return; }
  const ta = $('used_search_list');
  const currentText = ta.value.trim();
  const exists = currentText.includes(item.href) || currentText.includes('>'+item.name+'</a>');
  if (exists) { setStatus('global_status', '这个快速搜索站点看起来已经存在了'); return; }
  ta.value = currentText ? currentText + '\n' + item.html : item.html;
  const data=collect(); current=data; const st=defaultsState(data); renderQuickToggles(st); renderQuickSelected(st);
  setStatus('global_status', '已添加“' + item.name + '”，记得保存全部设置');
};

load();
