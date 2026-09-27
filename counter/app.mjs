import { STORAGE_KEY, BREEDING, FREQUENCY_THRESHOLD_PP, parseLocation, chartURL, catalog, compatibleAlias,
  displayAlias, speciesList, sortSpecies, validateCache, parseHistogram, parseChartHTML, fetchChart,
  createSession, increment, elapsed, addFix, exportText, matchesQuery, readState, saveState } from './core.mjs';

const app = document.querySelector('#app');
let state, view = 'home', selectedId, month = new Date().getMonth(), watchId = null, noticeTimer;
let busy = new Set(), startValue = Date.now(), startTouched = false, locked = false;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const btn = (text, action, cls = '', extra = '') => `<button class="btn ${cls}" data-action="${action}" ${extra}>${text}</button>`;
const locById = id => state.locations.find(l => l.id === id);
const options = (list, value) => list.map(([v, label]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join('');
const localDate = time => { const d = new Date(time); return new Date(time - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const duration = ms => { const seconds = Math.floor(ms / 1000); return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':'); };
function notice(message) {
  const el = document.querySelector('#notice'); el.textContent = message; el.style.display = 'block';
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => el.style.display = 'none', 6500);
}
function save() {
  if (locked) return false;
  try { saveState(localStorage, state); document.querySelector('#storage-warning').hidden = true; return true; }
  catch { const el = document.querySelector('#storage-warning'); el.textContent = '儲存失敗！請保持此頁開啟並立即下載備份；重新載入可能遺失最新紀錄。'; el.hidden = false; return false; }
}
function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function sourceLabel(loc) {
  if (!loc.cache) return '<span class="warning">尚無頻率資料 · 可先使用助手鳥種清單計數</span>';
  const c = loc.cache;
  return `${c.source === 'personal' ? '個人' : '公開'}${c.fallbackReason ? '（fallback）' : ''} · ${c.transport === 'bundled' ? '隨附快取' : c.transport === 'import' ? '檔案匯入' : '即時資料'}<br>更新 ${esc(new Date(c.updatedAt).toLocaleString('zh-TW'))} · ${c.species.length} 個分類項目`;
}
function head(title, sub) { return `<header><div class="eyebrow">FIELD NOTES / EBIRD</div><h1>${title}</h1><p>${sub}</p></header>`; }
function home() {
  if (!locById(selectedId)) selectedId = state.locations[0]?.id;
  app.innerHTML = head('隨走隨記', '把注意力留給鳥。每一次點按，隨時保存。') +
    `<section class="card stack"><div class="kicker">開始一份新紀錄</div><label>今天去哪裡<select id="location">${options(state.locations.map(l => [l.id, l.alias]), selectedId)}</select></label>
    <div class="source">${selectedId ? sourceLabel(locById(selectedId)) : '請先新增地點'}</div>
    <label>開始時間<input id="start-time" type="datetime-local" value="${localDate(startValue)}" max="${localDate(Date.now())}"></label>
    <div class="chips">${[-60, -10, -1, 1, 10, 60].map(n => btn(`${n > 0 ? '+' : '−'}${Math.abs(n) === 60 ? '1時' : Math.abs(n) + '分'}`, 'adjust', 'small', `data-minutes="${n}"`)).join('')}</div>
    <div class="row between">${btn('回到現在', 'now', 'small')}<label class="inline-label"><input type="checkbox" id="gps" checked>記錄 GPS 距離</label></div>
    ${btn('開始計鳥 →', 'start', 'primary full', selectedId ? '' : 'disabled')}</section>
    <section class="card"><div class="row between"><h2>我的地點</h2>${btn('＋ 新增地點', 'add-location', 'small')}</div>${state.locations.map(l => `<div class="location"><strong>${esc(l.alias)}</strong><div class="source">${esc(l.id)} · ${sourceLabel(l)}</div><div class="row wrap">${btn('頻率 / 管理', 'manage', 'small', `data-id="${l.id}"`)}${btn('改名', 'rename', 'small', `data-id="${l.id}"`)}</div></div>`).join('')}</section>
    <section class="card stack">${btn('鳥種簡稱設定', 'aliases')}${btn('下載完整備份', 'backup')}<label>還原備份<input id="restore" type="file" accept=".json"></label><p>紀錄只存於這個瀏覽器。清除網站資料會移除紀錄，請定期下載備份。</p></section>`;
}
function manage() {
  const loc = locById(selectedId); if (!loc) { view = 'home'; return render(); }
  const sorted = sortSpecies(speciesList(loc.cache), month);
  app.innerHTML = head(esc(loc.alias), '全年頻率 · 地點管理') + `<section class="card stack">
    ${btn('← 返回', 'back')}<div class="source">${sourceLabel(loc)}</div>
    ${loc.lastError ? `<div class="warning">${esc(loc.lastError)}</div>` : ''}
    <div class="row wrap">${btn(busy.has(loc.id) ? '讀取中…' : '重新抓取', 'refresh', '', busy.has(loc.id) ? 'disabled' : '')}${btn('改名', 'rename', '', `data-id="${loc.id}"`)}${btn('刪除', 'delete', 'danger', `data-id="${loc.id}"`)}</div>
    <p>網站無法跨網域讀取時：開啟 eBird 全年圖表 → Download Histogram Data → 在下方匯入 TXT。個人資料請在 eBird 登入後下載。</p>
    <div class="row wrap"><a target="_blank" rel="noopener" href="${esc(chartURL(loc.id))}">開啟公開圖表 ↗</a><a target="_blank" rel="noopener" href="${esc(chartURL(loc.id, true))}">開啟個人圖表 ↗</a></div>
    <label>匯入檔案的資料來源<select id="import-source">${options([['public', '公開'], ['personal', '個人']], 'public')}</select></label>
    <label>匯入全年 Histogram TXT / 折線圖 HTML / 頻率 JSON<input type="file" id="import-data" accept=".txt,.tsv,.html,.htm,.json"></label>
    <p>TXT 不含來源標記，請自行確認上方選項。HTML 需包含全年折線圖；只有長條級距的頁面會要求補上精確資料。</p>
    <label>預覽月份<select id="month">${options(Array.from({ length: 12 }, (_, m) => [m, `${m + 1} 月`]), month)}</select></label>
    <p>差距不超過 ${FREQUENCY_THRESHOLD_PP} 個百分點的同組鳥種，依 eBird 原順序排列。「—」代表沒有樣本／尚無資料。</p>
    <div>${sorted.map(s => `<div class="preview-row"><span>${esc(displayAlias(s, state.aliases))}${compatibleAlias(s) ? '' : '<small class="muted"> · 未設定可解析簡稱</small>'}</span><b>${s.months[month] === null ? '—' : s.months[month].toFixed(1) + '%'}</b></div>`).join('')}</div></section>`;
}
function birdRow(s) {
  const c = state.session.counts[s.code] || { seen: 0, heard: 0, breeding: '' }, name = displayAlias(s, state.aliases);
  const countButton = (label, kind, delta, cls) => `<button class="${cls || ''}" data-action="count" data-code="${s.code}" data-kind="${kind}" data-delta="${delta}" aria-label="${esc(name)} ${kind === 'seen' ? '看到' : '聽到'} ${delta > 0 ? '加' : '減'} ${Math.abs(delta)}">${label}</button>`;
  return `<div class="bird-row ${c.seen + c.heard ? 'counted' : ''}" data-bird="${s.code}">
    ${countButton('+10', 'seen', 10, 'bulk')}${countButton('+5', 'seen', 5, 'bulk')}${countButton('+', 'seen', 1)}${countButton('−', 'seen', -1, 'minus')}
    <div class="bird-name" title="${esc(s.name)}">${esc(name)}${compatibleAlias(s) ? '' : '<small class="unmapped">未設定簡稱</small>'}<b class="count">${c.seen}</b></div>
    <select data-breeding="${s.code}" aria-label="${esc(name)} 繁殖">${options(BREEDING, c.breeding)}</select>
    <span class="heard">聽<b>${c.heard}</b></span>${countButton('+', 'heard', 1)}${countButton('−', 'heard', -1, 'minus')}</div>`;
}
function filterRows(query = state.session.query) {
  for (const s of state.session.species) {
    const el = app.querySelector(`[data-bird="${s.code}"]`); if (el) el.hidden = !matchesQuery(s, query, state.aliases);
  }
  const n = state.session.species.filter(s => matchesQuery(s, query, state.aliases)).length;
  app.querySelector('#no-match').hidden = n !== 0;
}
function counter() {
  const s = state.session;
  app.innerHTML = `<div class="toolbar"><div class="stats"><div><small>已耗時間</small><strong id="elapsed"></strong></div><div><small>已記錄距離</small><strong id="distance"></strong></div><b class="place">${esc(s.location.alias)}</b></div>
    <div class="search"><input id="query" type="search" value="${esc(s.query)}" placeholder="搜尋鳥名或簡稱…" aria-label="搜尋鳥名或簡稱" autocomplete="off"></div>
    <div class="list-info">左邊記看到、右邊記只聽到；同一隻勿重複計數。<br><span id="gps-status"></span></div></div>
    <div id="birds">${s.species.map(birdRow).join('')}</div><p id="no-match" class="empty" hidden>沒有符合的鳥種，試試其他字。</p>
    <div class="footer"><div>${btn('備份', 'backup', 'small')} <small id="totals"></small></div>${btn('停止 ■', 'stop', 'primary')}</div>`;
  filterRows(); tick();
}
function stopped() {
  const s = state.session, exported = exportText(s, state.aliases);
  app.innerHTML = head('這趟，記好了', esc(s.location.alias)) + `<section class="card stack">
    <div class="metrics"><div><small>觀察時間</small><b>${duration(elapsed(s))}</b></div><div><small>已記錄 GPS 距離</small><b>${(s.distanceM / 1000).toFixed(2)} km</b></div></div>
    <p>GPS 在背景可能暫停；無法還原暫停期間路線。${s.gpsGaps ? `已偵測 ${s.gpsGaps} 次定位中斷。` : ''}距離請在文字助手的努力量欄手動填寫。</p>
    ${exported.unmapped.length ? `<div class="warning"><strong>以下 ${exported.unmapped.length} 種未放入相容文字，請另行補填：</strong><ul>${exported.unmapped.map(x => `<li>${esc(x.name)}：看到 ${x.seen}、聽到 ${x.heard}${x.breeding ? '；' + esc(x.breeding) : ''}</li>`).join('')}</ul>本機簡稱不會自動新增到文字助手的解析表。完整資料仍在備份內。</div>` : ''}
    <label>可編輯的 eBird 文字<textarea id="output" rows="12" spellcheck="false">${esc(s.output)}</textarea></label>
    <p>輸出總數＝看到＋只聽到。新地點簡稱需在文字助手另設對應地點。除唱歌／求偶／一對外，繁殖細節可能要求助手人工確認。</p>
    ${btn(s.copied ? '已複製 ✓ 再複製' : '複製全部文字', 'copy', 'primary full')}
    <div class="row wrap">${btn('下載文字', 'download-text')}${btn('完整備份', 'backup')}${btn('重新產生文字', 'regenerate')}</div>
    <div class="row wrap">${btn('簡稱設定', 'aliases')}${btn('從頭開始', 'restart', 'danger')}</div></section>`;
}
function aliasView() {
  const species = new Map();
  for (const s of [...catalog(), ...state.locations.flatMap(l => l.cache?.species || []), ...(state.session?.species || [])]) species.set(s.code, s);
  app.innerHTML = head('鳥種簡稱', '本機顯示與搜尋設定') + `<section class="card stack">${btn('← 返回', 'back')}<p>可自訂顯示簡稱；輸出仍使用文字助手已知、且對應同一鳥種的簡稱。未知鳥種不會因任意取名而自動變成可解析。</p>${[...species.values()].map(s => `<label class="alias-row">${esc(s.name)}<input data-alias="${s.code}" value="${esc(state.aliases[s.code] || '')}" placeholder="${esc(compatibleAlias(s) || '未設定簡稱')}" maxlength="40"><small>相容輸出：${esc(compatibleAlias(s) || '尚無；停止頁會提醒另外補填')}</small></label>`).join('')}</section>`;
}
function render() {
  if (locked) return;
  if (view === 'manage') manage(); else if (view === 'aliases') aliasView();
  else if (state.session) state.session.stop === null ? counter() : stopped(); else home();
}
async function refresh(id) {
  if (busy.has(id)) return;
  busy.add(id); render();
  try {
    const data = await fetchChart(id);
    const loc = locById(id); if (!loc) return;
    loc.cache = data; delete loc.lastError; save(); notice('全年頻率已更新');
  } catch (error) {
    const loc = locById(id); if (loc) { loc.lastError = error.message; save(); }
    notice('即時讀取受限，已保留快取。可匯入 eBird 下載檔。');
  } finally { busy.delete(id); render(); }
}
function gpsStart() {
  if (watchId !== null || !state.session?.gpsEnabled || state.session.stop !== null) return;
  if (!navigator.geolocation) { state.session.gpsStatus = '此瀏覽器不支援 GPS'; save(); return; }
  watchId = navigator.geolocation.watchPosition(p => {
    const s = state.session; if (!s || s.stop !== null || locked) return;
    const accepted = addFix(s, { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, time: p.timestamp });
    s.gpsStatus = p.coords.accuracy > 50 ? '定位精度不足，暫不累計' : `GPS 誤差約 ${Math.round(p.coords.accuracy)} m`;
    if (accepted) save(); tick();
  }, e => { if (state.session) { state.session.gpsStatus = e.code === 1 ? '定位未授權；仍可正常計鳥' : '定位暫時不可用；仍可正常計鳥'; save(); tick(); } },
  { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
function gpsStop() { if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; }
function tick() {
  const s = state.session;
  if (s && s.stop === null && app.querySelector('#elapsed')) {
    app.querySelector('#elapsed').textContent = duration(elapsed(s));
    app.querySelector('#distance').textContent = `${(s.distanceM / 1000).toFixed(2)} km`;
    app.querySelector('#gps-status').textContent = s.gpsStatus + (s.gpsGaps ? ` · ${s.gpsGaps} 次定位中斷` : '');
    const values = Object.values(s.counts).filter(c => c.seen + c.heard);
    app.querySelector('#totals').textContent = `${values.length} 種 / ${values.reduce((n, c) => n + c.seen + c.heard, 0)} 隻`;
  } else if (!s && !startTouched && app.querySelector('#start-time')) {
    startValue = Date.now(); app.querySelector('#start-time').value = localDate(startValue); app.querySelector('#start-time').max = localDate(startValue);
  }
}
app.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]'); if (!target || locked) return;
  const action = target.dataset.action;
  try {
    if (action === 'adjust' || action === 'now') {
      startValue = action === 'now' ? Date.now() : Math.min(Date.now(), startValue + Number(target.dataset.minutes) * 60000);
      startTouched = action !== 'now'; app.querySelector('#start-time').value = localDate(startValue);
    } else if (action === 'start') {
      startValue = new Date(app.querySelector('#start-time').value).getTime();
      state.session = createSession(locById(selectedId), startValue, app.querySelector('#gps').checked);
      if (!save()) { state.session = null; return; } render(); gpsStart();
      navigator.storage?.persist?.().catch(() => {});
    } else if (action === 'count') {
      if (state.session.stop !== null) return;
      increment(state.session, target.dataset.code, target.dataset.kind, Number(target.dataset.delta)); save();
      const row = target.closest('.bird-row'), c = state.session.counts[target.dataset.code];
      row.querySelector('.count').textContent = c.seen; row.querySelector('.heard b').textContent = c.heard; row.classList.toggle('counted', c.seen + c.heard > 0); tick();
    } else if (action === 'stop') {
      state.session.stop = Date.now(); gpsStop(); state.session.output = exportText(state.session, state.aliases).text; save(); render();
    } else if (action === 'copy') {
      const text = state.session.output;
      try { await navigator.clipboard.writeText(text); if (text === state.session.output) { state.session.copied = true; save(); render(); } notice('已複製'); }
      catch { app.querySelector('#output').select(); notice('自動複製未成功，已選取文字，請手動複製。'); }
    } else if (action === 'restart') {
      if (!state.session.copied && !confirm('還沒複製輸出。確定清除這趟紀錄並從頭開始？')) return;
      state.session = null; startTouched = false; startValue = Date.now(); view = 'home'; save(); render();
    } else if (action === 'regenerate') {
      if (!confirm('重新產生會取代你手動編輯的文字，確定？')) return;
      state.session.output = exportText(state.session, state.aliases).text; state.session.copied = false; save(); render();
    } else if (action === 'backup') download(`ebird-counter-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2));
    else if (action === 'download-text') download('ebird-notes.txt', state.session.output, 'text/plain;charset=utf-8');
    else if (action === 'add-location') {
      const input = prompt('貼上 eBird barchart 網址或 L 開頭地點 ID'); if (input === null) return;
      const id = parseLocation(input); if (locById(id)) { selectedId = id; view = 'manage'; render(); return; }
      const alias = prompt('地點簡稱', id)?.trim(); if (!alias) return;
      if (alias.length > 80 || /[\r\n]/.test(alias)) throw new Error('簡稱請使用 80 字內單行文字。');
      state.locations.push({ id, alias }); selectedId = id; view = 'manage'; save(); await refresh(id);
    } else if (action === 'manage') { selectedId = target.dataset.id; view = 'manage'; render(); }
    else if (action === 'back') { view = 'home'; render(); }
    else if (action === 'aliases') { view = 'aliases'; render(); }
    else if (action === 'refresh') await refresh(selectedId);
    else if (action === 'rename') {
      const loc = locById(target.dataset.id), alias = prompt('地點簡稱', loc.alias)?.trim();
      if (alias) { if (alias.length > 80 || /[\r\n]/.test(alias)) throw new Error('簡稱請使用 80 字內單行文字。'); loc.alias = alias; save(); render(); }
    } else if (action === 'delete') {
      if (state.session?.location.id === target.dataset.id) throw new Error('這個地點仍有本次紀錄，請先完成並重新開始。');
      if (!confirm('刪除這個地點與本機頻率快取？')) return;
      state.locations = state.locations.filter(l => l.id !== target.dataset.id); save(); view = 'home'; render();
    }
  } catch (e) { notice(e.message); }
});
app.addEventListener('input', event => {
  if (locked) return;
  const el = event.target;
  if (el.id === 'query') { state.session.query = el.value; save(); filterRows(el.value); }
  if (el.id === 'output') { state.session.output = el.value; state.session.copied = false; save(); const b = app.querySelector('[data-action="copy"]'); if (b) b.textContent = '複製全部文字'; }
  if (el.dataset.alias) { const alias = el.value.trim(); if (alias) state.aliases[el.dataset.alias] = alias; else delete state.aliases[el.dataset.alias]; save(); }
});
for (const type of ['compositionupdate', 'compositionend']) app.addEventListener(type, event => {
  if (event.target.id === 'query') {
    // Browsers exposing the composing text in input.value filter on every input;
    // compositionupdate can arrive before input, so queue after the browser edit.
    queueMicrotask(() => filterRows(event.target.value));
  }
});
app.addEventListener('change', async event => {
  if (locked) return;
  const el = event.target;
  try {
    if (el.id === 'location') { selectedId = el.value; render(); }
    if (el.id === 'month') { month = Number(el.value); render(); }
    if (el.id === 'start-time') {
      const value = new Date(el.value).getTime();
      if (!Number.isFinite(value)) throw new Error('請輸入有效開始時間。');
      startValue = Math.min(Date.now(), value); startTouched = true; el.value = localDate(startValue);
      if (value > Date.now()) notice('開始時間已限制為現在');
    }
    if (el.dataset.breeding) {
      const c = state.session.counts[el.dataset.breeding] ||= { seen: 0, heard: 0, breeding: '' }; c.breeding = el.value; save();
    }
    if (el.id === 'import-data' && el.files[0]) {
      const id = selectedId, source = app.querySelector('#import-source').value, file = el.files[0];
      if (file.size > 12_000_000) throw new Error('檔案太大（上限 12 MB）');
      const text = await file.text(); let data;
      const filenameId = file.name.match(/ebird_(L\d+)_/i)?.[1];
      if (filenameId && filenameId.toUpperCase() !== id) throw new Error('檔名的地點 ID 不符，請切換到正確地點。');
      if (/^\s*\{/.test(text)) data = validateCache(JSON.parse(text), id);
      else if (/<!doctype|<html/i.test(text)) { data = parseChartHTML(text, id, source); if (data.codes) throw new Error('這是長條級距頁，請下載 Histogram TXT 或匯入含精確數值的全年折線圖 HTML。'); }
      else data = parseHistogram(text, id, source);
      const loc = locById(id); if (!loc) return;
      loc.cache = { ...data, transport: 'import' }; delete loc.lastError; save(); render(); notice('已匯入全年精確頻率');
    }
    if (el.id === 'restore' && el.files[0]) {
      if (el.files[0].size > 12_000_000) throw new Error('備份檔案太大');
      const text = await el.files[0].text(), restored = readState({ getItem: () => text });
      if (!confirm('還原會取代目前地點、簡稱與紀錄。確定？')) return;
      gpsStop(); state = restored; save(); view = 'home'; render(); gpsStart();
    }
  } catch (e) { notice(e.message); }
});
window.addEventListener('pagehide', () => { if (state) save(); });
document.addEventListener('visibilitychange', () => { if (state) save(); if (!document.hidden) tick(); });
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY && !locked) { locked = true; gpsStop(); app.innerHTML = '<section class="card warning">另一個分頁已更新紀錄。請關閉本頁，回到正在使用的計鳥頁，以免覆蓋資料。</section>'; }
});
async function boot() {
  try { state = readState(localStorage); }
  catch (error) {
    app.innerHTML = `<section class="card warning">${esc(error.message)}<p>原始資料尚未覆寫。</p><button id="raw-backup" class="btn">下載原始備份</button></section>`;
    app.querySelector('#raw-backup').onclick = () => download('ebird-recovery.json', localStorage.getItem(STORAGE_KEY) || '{}'); return;
  }
  render(); gpsStart(); setInterval(tick, 1000);
  try {
    const response = await fetch('./data/locations.json'); if (!response.ok) throw new Error();
    const bundled = await response.json();
    for (const cache of bundled) { const loc = locById(cache.id); if (loc && !loc.cache) loc.cache = validateCache(cache, loc.id); }
    save(); if (!state.session) render();
  } catch { /* The app remains usable offline even before the first cache download. */ }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => notice('離線頁面快取不可用；本機紀錄仍持續保存'));
}
if (navigator.locks) navigator.locks.request(STORAGE_KEY, { ifAvailable: true }, async lock => {
  if (!lock) { locked = true; app.innerHTML = '<section class="card warning">計鳥簿已在另一個分頁開啟，請回到原分頁繼續。</section>'; return; }
  await boot(); await new Promise(() => {});
}); else boot();
