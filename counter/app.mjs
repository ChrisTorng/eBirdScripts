import * as C from "./core.mjs";
import * as O from "./organization.mjs";
import { parsePersonalCSV, readPersonalFile } from "./personal.mjs";
const app = document.querySelector("#app"),
  API_KEY = "ebird-counter:api-key";
let state,
  publicData,
  species = [],
  view = "home",
  selectedId = "",
  point = null,
  gpsMessage = "",
  watchId = null;
let editMode = false,
  expanded = "",
  armedStop = false,
  locked = false,
  manualLocation = false;
let startValue = Date.now(),
  startTouched = false,
  gpsEnabled = true,
  noticeTimer,
  nearby = [],
  locationBusy = false;
const $ = (selector) => app.querySelector(selector),
  profile = () => state.profiles.global;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (label, action, attrs = "", cls = "") =>
  `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const options = (list, value) =>
  list
    .map(
      ([id, name]) =>
        `<option value="${esc(id)}" ${String(id) === String(value) ? "selected" : ""}>${esc(name)}</option>`,
    )
    .join("");
const localDate = (n) =>
  new Date(n - new Date(n).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const locationById = (id) => state.locations.find((l) => l.id === id),
  counts = () => state.session?.counts || {};
const nameOf = (s) => C.displayAlias(s, state.aliases),
  frequency = (s) => (s.annual == null ? "—" : `${s.annual.toFixed(1)}%`);
const emptyCount = () => ({ total: 0, heard: 0, breeding: "", note: "" });
function notice(message) {
  const el = document.querySelector("#notice");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (el.hidden = true), 5500);
}
function save() {
  if (locked) return false;
  try {
    C.saveState(localStorage, state);
    document.querySelector("#storage-warning").hidden = true;
    return true;
  } catch {
    const el = document.querySelector("#storage-warning");
    el.textContent = "儲存失敗，請保持此頁開啟並下載備份。";
    el.hidden = false;
    return false;
  }
}
function changed() {
  armedStop = false;
  if (state.session) state.session.copied = false;
  save();
}
function download(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function rebuild(reclassify = false) {
  species = O.sharedSpecies(state, publicData);
  O.syncGroups(profile(), species, reclassify);
  if (state.session?.stop === null)
    state.session.species = O.orderedSpecies(profile(), species);
}
function top(title, back = true) {
  return `<header class="page-bar">${back ? button("‹", "back", 'aria-label="返回"', "icon") : '<span class="brand-mark">◉</span>'}<h1>${esc(title)}</h1>${button("⚙", "settings", 'aria-label="設定"', "icon")}</header>`;
}
function dialog(title, body, accept = "確定") {
  return new Promise((resolve) => {
    const el = document.createElement("dialog");
    el.className = "sheet";
    el.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>${body}<div class="dialog-actions"><button value="cancel" formnovalidate>取消</button><button class="primary" value="ok">${accept}</button></div></form>`;
    document.body.appendChild(el);
    el.addEventListener("close", () => {
      const data = new FormData(el.querySelector("form")),
        yes = el.returnValue === "ok";
      el.remove();
      resolve(yes ? data : null);
    });
    el.showModal();
  });
}
async function confirmAction(title, detail) {
  return !!(await dialog(title, `<p>${esc(detail)}</p>`));
}
function sourceLabel(cache) {
  return cache
    ? `${cache.source === "personal" ? "個人完整鳥單" : "全台公開"} · ${cache.species.length} 項 · ${new Date(cache.updatedAt).toLocaleDateString("zh-TW")}`
    : "未載入";
}
function home() {
  app.innerHTML =
    top("計鳥", false) +
    `<section class="start-screen"><label class="start-label">日期與時間<input id="start-time" type="datetime-local" value="${localDate(startValue)}" max="${localDate(Date.now())}"></label><label class="start-label">地點<select id="location">${options([["", "選擇地點"], ...state.locations.map((l) => [l.id, l.alias])], selectedId)}</select></label><div class="home-tools">${button("⌖ 附近", "nearby")}${button("＋ 地點", "add-location")}<small id="location-status">${esc(gpsMessage)}</small></div><label class="gps-toggle">GPS 距離<input id="gps" type="checkbox" ${gpsEnabled ? "checked" : ""}></label>${button("開始計鳥", "start", selectedId ? "" : "disabled", "primary start-button")}<nav class="home-nav">${button("地點", "locations")}${button("鳥種 / 排序", "organize")}${button("設定", "settings")}</nav></section>`;
}
let dataLocationId = "";
const locationRequests = new Set();
function locationView() {
  app.innerHTML =
    top("地點") +
    `<section class="settings-list"><div class="line-actions">${button("＋ 新增", "add-location")}${button("⌖ 附近熱點", "nearby")}</div>${state.locations.map((l) => `<article class="location-item"><div><strong>${esc(l.alias)}</strong><small>${l.id}${Number.isFinite(l.lat) ? " · 已定位" : " · 未設座標"}</small></div><div class="line-actions">${button("頻率", "location-data", `data-id="${l.id}"`)}${button("編輯", "edit-location", `data-id="${l.id}"`)}</div></article>`).join("")}</section>`;
}
async function refreshLocation(id, quiet = false) {
  if (locationRequests.has(id)) return;
  locationRequests.add(id);
  try {
    const cache = await C.fetchChart(id);
    const current = locationById(id);
    if (current) {
      current.cache = cache;
      delete current.cacheError;
      save();
    }
  } catch (e) {
    const current = locationById(id);
    if (current) {
      current.cacheError = e.message;
      save();
    }
    if (!quiet) notice("網站資料不可用，可匯入全年 TXT");
  } finally {
    locationRequests.delete(id);
    if (view === "location-data" && dataLocationId === id) render();
  }
}
function locationData() {
  const loc = locationById(dataLocationId);
  if (!loc) {
    view = "locations";
    return locationView();
  }
  const cache = loc.cache,
    source = cache
      ? (cache.source === "personal" ? "個人" : "公開") +
        (cache.fallbackReason ? "（fallback）" : "")
      : "未載入";
  app.innerHTML =
    top(loc.alias + " · 頻率") +
    `<section class="settings-list"><p>${esc(source)}${cache ? " · " + new Date(cache.updatedAt).toLocaleString("zh-TW") : ""}</p>${button(locationRequests.has(loc.id) ? "更新中…" : "重新抓取", "refresh-location", locationRequests.has(loc.id) ? "disabled" : "")}<a href="${esc(C.chartURL(loc.id))}" target="_blank" rel="noopener">eBird 全年圖表 ↗</a><label>全年 Histogram TXT<input id="location-file" type="file" accept=".txt,.tsv"></label><select id="location-source" aria-label="檔案來源"><option value="public">公開資料</option><option value="personal">已確認是個人資料</option></select><select id="location-month" aria-label="地點月份">${options(
      Array.from({ length: 12 }, (_, i) => [i, `${i + 1} 月`]),
      new Date().getMonth(),
    )}</select><div id="location-preview"></div>${loc.cacheError ? '<small class="muted">線上讀取不可用，已保留原快取。</small>' : ""}</section>`;
  previewLocationMonth();
}
function previewLocationMonth() {
  const cache = locationById(dataLocationId)?.cache;
  if (!cache) return;
  const month = Number($("#location-month").value);
  $("#location-preview").innerHTML = C.sortSpecies(cache.species, month)
    .map(
      (s) =>
        `<div class="month-row"><span>${esc(nameOf(s))}</span><b>${s.months[month] == null ? "—" : s.months[month].toFixed(1) + "%"}</b></div>`,
    )
    .join("");
}
async function editLocation(id = "", candidate = null) {
  const loc = locationById(id) || candidate || {};
  const data = await dialog(
    id ? "編輯地點" : "新增地點",
    `<label>網址或 L ID<input name="id" value="${esc(loc.id || "")}" required ${id ? "readonly" : ""}></label><label>簡稱<input name="alias" value="${esc(loc.alias || loc.name || "")}" required maxlength="80"></label><div class="field-pair"><label>緯度<input name="lat" type="number" step="any" min="-90" max="90" value="${esc(loc.lat ?? "")}"></label><label>經度<input name="lon" type="number" step="any" min="-180" max="180" value="${esc(loc.lon ?? "")}"></label></div>${point ? '<label class="check"><input name="here" type="checkbox">以目前 GPS 位置設定座標</label>' : ""}${id ? '<label class="check danger"><input name="delete" type="checkbox">刪除此地點</label>' : ""}`,
  );
  if (!data) return;
  if (data.get("delete")) {
    if (state.session?.location.id === id)
      throw new Error("此地點仍有本次紀錄");
    state.locations = state.locations.filter((l) => l.id !== id);
    if (selectedId === id) selectedId = "";
    save();
    render();
    return;
  }
  const nextId = C.parseLocation(data.get("id")),
    alias = data.get("alias").trim();
  if (!alias || /[\r\n]/.test(alias)) throw new Error("請填單行簡稱");
  const next = { ...(locationById(nextId) || {}), id: nextId, alias },
    latText = data.get("lat").trim(),
    lonText = data.get("lon").trim();
  if (data.get("here") && point) {
    next.lat = point.lat;
    next.lon = point.lon;
  } else if (latText || lonText) {
    const lat = Number(latText),
      lon = Number(lonText);
    if (
      !latText ||
      !lonText ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      throw new Error("座標無效");
    next.lat = lat;
    next.lon = lon;
  } else {
    delete next.lat;
    delete next.lon;
  }
  const index = state.locations.findIndex((l) => l.id === nextId);
  if (index < 0) state.locations.push(next);
  else state.locations[index] = next;
  selectedId = nextId;
  manualLocation = true;
  view = state.session ? "locations" : "home";
  save();
  render();
  if (index < 0) void refreshLocation(nextId, true);
}
function nearbyView() {
  app.innerHTML =
    top("附近地點") +
    `<section class="settings-list"><div class="line-actions">${button(locationBusy ? "尋找中…" : "⌖ 重新定位", "locate", locationBusy ? "disabled" : "")}${button("讀取附近熱點", "load-nearby", !point || locationBusy ? "disabled" : "")}</div><p class="muted">${esc(gpsMessage)}</p><a href="${esc(O.nearbyMapURL(point))}" target="_blank" rel="noopener">開啟 eBird 附近地圖 ↗</a>${nearby.map((l, i) => `<article class="location-item"><div><strong>${esc(l.name)}</strong><small>${(l.meters / 1000).toFixed(2)} km</small></div>${button("選擇", "pick-nearby", `data-index="${i}"`)}</article>`).join("")}${button("貼上地點網址", "add-location", "", "wide")}</section>`;
}
function settings() {
  const freq = state.frequency.personal || state.frequency.public || publicData;
  app.innerHTML =
    top("設定") +
    `<section class="settings-list"><h2>共用排序頻率</h2><p class="muted">${esc(sourceLabel(freq))}</p><a href="https://ebird.org/downloadMyData" target="_blank" rel="noopener">下載我的 eBird 資料 ↗</a><label>匯入個人紀錄 ZIP / CSV<input type="file" id="personal-file" accept=".csv,.zip"></label><small class="muted">只在本機統計完整鳥單，不上傳。</small>${freq?.unmatched ? `<p class="warning">${freq.unmatched} 個名稱未列於全台索引，已保留可辨識的鳥種與原名。</p>` : ""}${state.frequency.personal ? button("改用全台頻率", "clear-personal") : ""}<details><summary>全台頻率</summary><label>更新全台 Histogram TXT<input type="file" id="public-file" accept=".txt,.tsv"></label>${button("嘗試線上更新", "refresh-public")}<a href="${esc(C.chartURL("TW"))}" target="_blank" rel="noopener">eBird 全台統計 ↗</a></details><details><summary>月份頻率</summary><select id="preview-month" aria-label="預覽月份">${options(
      Array.from({ length: 12 }, (_, i) => [i, `${i + 1} 月`]),
      new Date().getMonth(),
    )}</select>${button("顯示月份頻率", "preview-frequency")}<div id="month-preview"></div></details><h2>分組門檻</h2><div class="field-pair"><label>常見 ≥ %<input id="threshold-common" type="number" min="0.001" step="any" max="100" value="${profile().thresholds?.common ?? 20}"></label><label>少見 ≥ %<input id="threshold-uncommon" type="number" min="0.001" max="99" step="any" value="${profile().thresholds?.uncommon ?? 2}"></label></div><div id="threshold-preview" class="group-summary"></div><div class="line-actions">${button("自動抓 15 / 30 種", "suggest-groups")}${button("依門檻重建五區塊", "reset-groups")}</div>${button("編輯區塊 / 鳥種順序", "organize", "", "wide")}<details><summary>eBird 附近熱點 API</summary><label>API 金鑰<input id="api-key" type="password" autocomplete="off" value="${esc(localStorage.getItem(API_KEY) || "")}"></label><a href="https://ebird.org/api/keygen" target="_blank" rel="noopener">取得 eBird API 金鑰 ↗</a></details><details><summary>簡稱</summary><label>搜尋鳥名<input id="alias-query" type="search"></label><div id="alias-results"></div></details><details><summary>備份 / 還原</summary>${button("下載完整備份", "backup")}<label>還原 JSON<input id="restore" type="file" accept=".json"></label></details><small class="muted">文字助手需更新至 1.9.0，才能帶入描述與明確繁殖代碼。</small></section>`;
  previewThresholds();
}
function previewThresholds() {
  const common = Number($("#threshold-common").value),
    uncommon = Number($("#threshold-uncommon").value),
    el = $("#threshold-preview");
  if (!(common <= 100 && common > uncommon && uncommon > 0)) {
    el.textContent = "需為 100 ≥ 常見 > 少見 > 0";
    return;
  }
  const amounts = O.groupCounts(species, { common, uncommon });
  el.innerHTML = Object.entries(O.GROUP_NAMES)
    .map(([id, name]) => `<span>${name} <b>${amounts[id]}</b></span>`)
    .join("");
}
function breedLabel(value) {
  return O.BREEDING_OPTIONS.find((b) => b[0] === value)?.[2] || "繁殖";
}
function rowHTML(s, organizing = false) {
  const c = counts()[s.code] || emptyCount(),
    errors = C.recordErrors(c),
    name = nameOf(s);
  const inc = (label, field, delta) =>
    button(
      label,
      "count",
      `data-code="${s.code}" data-field="${field}" data-delta="${delta}" aria-label="${esc(name)} ${field === "total" ? "個體" : "聽到"} 加 ${delta}"`,
      field === "total" && delta === 1 ? "total-plus" : "",
    );
  return `<article class="bird ${C.hasInformation(c) ? "recorded" : ""} ${errors.length ? "invalid" : ""}" data-bird="${s.code}" title="${esc(errors.join("；"))}"><div class="bird-line ${editMode || organizing ? "reordering" : ""}">${editMode || organizing ? button("↕", "move-bird", `data-code="${s.code}" data-drag="bird" aria-label="移動 ${esc(name)}"`, "drag-handle") : ""}${organizing ? `<span class="organize-name">${esc(name)}</span><span class="frequency">${frequency(s)}</span>${button("移動", "move-bird", `data-code="${s.code}"`)}` : `${inc("+10", "total", 10)}${inc("+5", "total", 5)}${inc("+", "total", 1)}${button(`<b class="total">${c.total}</b><span class="bird-name">${esc(name)}${!C.compatibleAlias(s) ? '<small class="unmapped">未設定簡稱</small>' : ""}</span>`, "bird", `data-code="${s.code}" aria-label="${esc(name)} 個體數 ${c.total}"`, "bird-main")}${button(esc(breedLabel(c.breeding)), "breeding", `data-code="${s.code}" aria-label="${esc(name)} 繁殖"`, "breed")}${button(`<b>${c.heard}</b><span>聽</span>`, "bird", `data-code="${s.code}" aria-label="${esc(name)} 聽到 ${c.heard}"`, "heard")}${inc("+", "heard", 1)}`}</div><p class="bird-description" ${c.note ? "" : "hidden"}>${esc(c.note)}</p><div class="record-error" ${errors.length ? "" : "hidden"}>${esc(errors.join("；"))}</div></article>`;
}
function lists(organizing = false) {
  const byCode = new Map(species.map((s) => [s.code, s])),
    query = organizing ? "" : state.session?.query || "";
  return profile()
    .groups.map((g) => {
      const visible = g.codes
        .map((code) => byCode.get(code))
        .filter(Boolean)
        .filter((bird) =>
          O.rowVisible(
            bird,
            counts()[bird.code],
            g,
            query,
            false,
            state.aliases,
          ),
        );
      const hidden =
        !visible.length &&
        !!query.trim() &&
        C.numericQuery(query) === null &&
        !/^[+-]$/.test(query.trim());
      return `<section class="bird-group" data-group="${g.id}" ${hidden ? "hidden" : ""}><div class="group-heading">${editMode || organizing ? button("↕", "edit-group", `data-group="${g.id}" data-drag="group" aria-label="移動區塊 ${esc(g.name)}"`, "drag-handle") : ""}${button(`${g.collapsed ? "▸" : "▾"} ${esc(g.name)} <small>${g.codes.length}</small>`, "toggle-group", `data-group="${g.id}" aria-expanded="${!g.collapsed}"`, "group-toggle")}${button("⋯", "edit-group", `data-group="${g.id}" aria-label="編輯區塊 ${esc(g.name)}"`, "group-edit")}</div><div class="group-birds">${visible.map((s) => rowHTML(s, organizing)).join("")}</div></section>`;
    })
    .join("");
}
function refreshList() {
  if ($("#bird-list")) $("#bird-list").innerHTML = lists(view === "organize");
  filterRows();
}
function filterRows() {
  if (!state.session || view === "organize") return;
  const byCode = new Map(species.map((s) => [s.code, s])),
    s = state.session;
  for (const g of profile().groups) {
    let visible = 0;
    for (const code of g.codes) {
      const el = $(`[data-bird="${code}"]`),
        bird = byCode.get(code);
      if (!el || !bird) continue;
      const show = O.rowVisible(
        bird,
        s.counts[code],
        g,
        s.query,
        false,
        state.aliases,
      );
      el.hidden = !show;
      if (show) visible++;
    }
    const el = $(`section[data-group="${g.id}"]`);
    if (el)
      el.hidden =
        !visible && !!s.query.trim() && C.numericQuery(s.query) === null;
  }
  const number = C.numericQuery(s.query),
    hint = $("#number-hint");
  if (hint) {
    hint.hidden = number === null;
    hint.textContent = `點鳥名加入 ${number > 0 ? "+" : ""}${number}`;
  }
}
function counter() {
  const s = state.session;
  app.innerHTML = `<div class="counter-top"><div class="stats"><b id="elapsed"></b><span id="distance" title="${esc(s.gpsStatus)}"></span><span class="current-location">${esc(s.location.alias)}</span>${button("⚙", "settings", 'aria-label="設定"', "icon")}</div><div class="search"><input id="query" type="search" value="${esc(s.query)}" placeholder="鳥名 / 加減數量" aria-label="搜尋鳥名或輸入數量" autocomplete="off"><span id="number-hint" hidden></span></div>${editMode ? `<div class="edit-toolbar">${button("＋ 區塊", "add-group")}<small>拖動 ↕ 調整順序</small>${button("完成", "toggle-edit")}</div>` : ""}</div><div id="bird-list">${lists()}</div><footer class="counter-footer">${button(editMode ? "✓" : "↕", "toggle-edit", 'aria-label="調整排序"', "icon")}${button("⇩", "backup", 'aria-label="下載備份"', "icon")}${button("", "only-recorded", `aria-pressed="${profile().groups.every((g) => g.collapsed)}"`, "totals")}${button("停止", "stop", "", "primary stop")}</footer>`;
  filterRows();
  tick();
}
function organize() {
  app.innerHTML =
    top("鳥種 / 區塊排序") +
    `<div class="edit-toolbar">${button("＋ 區塊", "add-group")}<small>${state.frequency.personal ? "個人" : "全台"}全年頻率</small>${button("門檻", "settings")}</div><div id="bird-list" class="organizing">${lists(true)}</div>`;
}
function tick() {
  const s = state.session;
  if (s && $("#elapsed")) {
    $("#elapsed").textContent = C.formatDuration(C.elapsed(s));
    $("#distance").textContent = `${(s.distanceM / 1000).toFixed(2)} km`;
    $("#distance").title = s.gpsStatus;
    const values = Object.values(s.counts);
    $(".totals").textContent =
      `${values.filter(C.hasInformation).length}種 / ${values.reduce((n, c) => n + c.total, 0)}隻`;
    $(".totals").classList.toggle(
      "active",
      profile().groups.every((g) => g.collapsed),
    );
  } else if (!s && !startTouched && $("#start-time")) {
    startValue = Date.now();
    $("#start-time").value = localDate(startValue);
    $("#start-time").max = localDate(startValue);
  }
}
function updateRow(code, flash = false) {
  const el = $(`[data-bird="${code}"]`),
    c = counts()[code];
  if (!el || !c) return;
  el.querySelector(".total").textContent = c.total;
  el.querySelector(".heard b").textContent = c.heard;
  el.querySelector(".breed").textContent = breedLabel(c.breeding);
  const s = species.find((x) => x.code === code);
  el.querySelector(".bird-main").setAttribute(
    "aria-label",
    `${nameOf(s)} 個體數 ${c.total}`,
  );
  el.querySelector(".heard").setAttribute(
    "aria-label",
    `${nameOf(s)} 聽到 ${c.heard}`,
  );
  const note = el.querySelector(".bird-description");
  note.textContent = c.note;
  note.hidden = !c.note;
  const errors = C.recordErrors(c),
    err = el.querySelector(".record-error");
  err.textContent = errors.join("；");
  err.hidden = !errors.length;
  el.classList.toggle("invalid", !!errors.length);
  el.classList.toggle("recorded", C.hasInformation(c));
  if (flash) {
    el.classList.remove("heard-flash");
    void el.offsetWidth;
    el.classList.add("heard-flash");
  }
  const editor = el.querySelector(".bird-editor");
  if (editor)
    for (const field of ["total", "heard"]) {
      const input = editor.querySelector(`[data-direct="${field}"]`);
      if (input !== document.activeElement) input.value = c[field];
    }
  tick();
  filterRows();
}
function closeEditor() {
  $(".bird-editor")?.remove();
  expanded = "";
}
function openEditor(code) {
  if (expanded === code) {
    closeEditor();
    return;
  }
  closeEditor();
  expanded = code;
  const c = C.recordFor(state.session, code),
    el = $(`[data-bird="${code}"]`),
    panel = document.createElement("div");
  panel.className = "bird-editor";
  panel.innerHTML = `<div class="editor-grid ${editMode ? "reordering" : ""}">${editMode ? "<span></span>" : ""}${[-10, -5, -1].map((n) => button(n === -1 ? "−" : String(n), "count", `data-code="${code}" data-field="total" data-delta="${n}" aria-label="個體減 ${-n}"`)).join("")}<input aria-label="個體" type="number" inputmode="numeric" min="0" step="1" data-direct="total" data-code="${code}" value="${c.total}"><span></span><input aria-label="聽到" type="number" inputmode="numeric" min="0" step="1" data-direct="heard" data-code="${code}" value="${c.heard}">${button("−", "count", `data-code="${code}" data-field="heard" data-delta="-1" aria-label="聽減 1"`)}</div><div class="editor-note"><textarea data-note="${code}" aria-label="鳥種描述" placeholder="描述" rows="2" maxlength="5000">${esc(c.note)}</textarea>${button("完成", "close-editor", 'aria-label="關閉鳥種編輯"')}</div>`;
  el.appendChild(panel);
  panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function breeding(code) {
  closeEditor();
  const s = species.find((x) => x.code === code),
    c = C.recordFor(state.session, code),
    el = document.createElement("dialog");
  el.className = "sheet breeding-sheet";
  el.innerHTML = `<h2>${esc(nameOf(s))} · 繁殖</h2><div class="breeding-options">${O.BREEDING_OPTIONS.map(
    ([value, english, short, full]) => {
      const chars = new Set([...short]),
        highlighted = [...full]
          .map((char) =>
            chars.has(char) && /[\u3400-\u9fff]/.test(char)
              ? `<b>${esc(char)}</b>`
              : esc(char),
          )
          .join("");
      return `<button type="button" data-value="${esc(value)}" class="breeding-option ${c.breeding === value ? "selected" : ""}"><strong>${english || "—"}</strong><span>${full ? highlighted : "無繁殖代碼"}</span></button>`;
    },
  ).join("")}</div><button class="wide" data-cancel>取消</button>`;
  el.addEventListener("click", (e) => {
    const option = e.target.closest("[data-value]");
    if (option) {
      c.breeding = option.dataset.value;
      changed();
      updateRow(code);
      el.close();
    } else if (e.target.closest("[data-cancel]")) el.close();
  });
  el.addEventListener("close", () => el.remove());
  document.body.appendChild(el);
  el.showModal();
}
function stopSession() {
  const s = state.session,
    ordered = O.orderedSpecies(profile(), species),
    first = ordered.find((x) => C.recordErrors(s.counts[x.code]).length);
  if (first && !armedStop) {
    armedStop = true;
    s.query = "";
    s.onlyRecorded = false;
    closeEditor();
    counter();
    save();
    const el = $(`[data-bird="${first.code}"]`);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("warning-flash");
    notice("有紅色項目，請檢查；再按停止可繼續");
    return;
  }
  s.stop = Date.now();
  gpsStop();
  s.species = ordered;
  s.output = C.exportText(s, state.aliases).text;
  s.copied = false;
  save();
  render();
}
function stopped() {
  const s = state.session,
    { unmapped } = C.exportText(s, state.aliases),
    errors = s.species.filter((x) => C.recordErrors(s.counts[x.code]).length);
  app.innerHTML =
    top("紀錄", false) +
    `<section class="settings-list"><div class="summary-metrics"><b>${C.formatDuration(C.elapsed(s))}</b><span>${(s.distanceM / 1000).toFixed(2)} km</span><span>${esc(s.location.alias)}</span></div>${errors.length ? `<div class="warning danger">${errors.length} 項數量提醒未解決</div>` : ""}${unmapped.length ? `<details class="warning" open><summary>${unmapped.length} 項需另行補填</summary>${unmapped.map((x) => `<p>${esc(x.name)} ${x.total}，聽 ${x.heard}${x.note ? " · " + esc(x.note) : ""}</p>`).join("")}</details>` : ""}<textarea id="output" aria-label="eBird 輸出文字" rows="13">${esc(s.output)}</textarea>${button(s.copied ? "已複製 ✓" : "複製全部", "copy", "", "primary wide")}<div class="line-actions">${button("繼續計鳥", "resume")}${button("下載", "download-text")}${button("重新產生", "regenerate")}${button("從頭開始", "restart")}</div><small class="muted">距離 ${(s.distanceM / 1000).toFixed(2)} km 請填入助手努力量；背景 GPS 可能中斷。</small></section>`;
}
function render() {
  if (locked) return;
  closeEditor();
  if (view === "settings") settings();
  else if (view === "locations") locationView();
  else if (view === "location-data") locationData();
  else if (view === "nearby") nearbyView();
  else if (view === "organize") organize();
  else if (state.session) state.session.stop === null ? counter() : stopped();
  else home();
}
function locate() {
  if (!navigator.geolocation) {
    gpsMessage = "無法定位，請選地點";
    return render();
  }
  locationBusy = true;
  gpsMessage = "定位中";
  if (!state.session) render();
  navigator.geolocation.getCurrentPosition(
    (p) => {
      locationBusy = false;
      point = {
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        accuracy: p.coords.accuracy,
      };
      const nearest =
        p.coords.accuracy <= 500
          ? O.nearestSaved(state.locations, point)
          : null;
      if (!manualLocation && !state.session) selectedId = nearest?.id || "";
      gpsMessage = nearest
        ? `距 ${nearest.alias} ${Math.round(nearest.meters)} m`
        : "附近 500 m 無已設地點";
      if (p.coords.accuracy > 500) gpsMessage = "定位精度不足，請選地點";
      if (!state.session || view === "nearby") render();
    },
    () => {
      locationBusy = false;
      gpsMessage = "未取得定位，請選地點";
      if (!state.session || view === "nearby") render();
    },
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
  );
}
function gpsStart() {
  if (
    watchId !== null ||
    !state.session?.gpsEnabled ||
    state.session.stop !== null ||
    !navigator.geolocation
  )
    return;
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      const s = state.session;
      if (!s || s.stop !== null || locked) return;
      const accepted = C.addFix(s, {
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        accuracy: p.coords.accuracy,
        time: p.timestamp,
      });
      s.gpsStatus = `GPS ±${Math.round(p.coords.accuracy)}m`;
      if (accepted) save();
      tick();
    },
    (e) => {
      if (state.session) {
        state.session.gpsStatus =
          e.code === 1 ? "GPS 未授權" : "GPS 暫時不可用";
        save();
        tick();
      }
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
}
function gpsStop() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}
async function moveBirdDialog(code) {
  const group = profile().groups.find((g) => g.codes.includes(code)),
    s = species.find((x) => x.code === code),
    destinations = profile().groups.filter((g) => g !== group);
  if (!destinations.length) {
    notice("拖動 ↕ 調整區塊內順序");
    return;
  }
  const data = await dialog(
    `移動 ${nameOf(s)}`,
    `<label>區塊<select name="group">${options(destinations.map((g) => [g.id, g.name]))}</select></label>`,
  );
  if (!data) return;
  O.moveSpeciesAcross(profile(), code, data.get("group"));
  rebuild();
  save();
  render();
}
async function editGroup(id = "") {
  const g = profile().groups.find((g) => g.id === id),
    data = await dialog(
      g ? "編輯區塊" : "新增區塊",
      `<label>名稱<input name="name" required maxlength="80" value="${esc(g?.name || "")}"></label><label>位置<input name="position" type="number" required min="1" max="${profile().groups.length + (g ? 0 : 1)}" value="${g ? profile().groups.indexOf(g) + 1 : profile().groups.length + 1}"></label>${
        g && profile().groups.length > 1
          ? `<label class="check"><input name="delete" type="checkbox">刪除此區塊，鳥種移到</label><select name="destination">${options(
              profile()
                .groups.filter((x) => x !== g)
                .map((x) => [x.id, x.name]),
            )}</select>`
          : ""
      }`,
    );
  if (!data) return;
  if (g && data.get("delete"))
    O.deleteGroup(profile(), id, data.get("destination"));
  else {
    const name = data.get("name").trim(),
      position = Number(data.get("position"));
    if (!name || !Number.isSafeInteger(position) || position < 1)
      throw new Error("名稱或位置無效");
    const group = g || {
      id: `group-${crypto.randomUUID()}`,
      codes: [],
      collapsed: false,
    };
    group.name = name;
    if (!g) profile().groups.push(group);
    const others = profile().groups.filter((x) => x !== group);
    O.moveGroup(profile(), group.id, others[position - 1]?.id || null);
  }
  profile().customized = true;
  rebuild();
  save();
  render();
}
let drag = null,
  suppressClick = false;
app.addEventListener("pointerdown", (e) => {
  const handle = e.target.closest("[data-drag]");
  if (!handle || e.button !== 0) return;
  drag = {
    type: handle.dataset.drag,
    code: handle.dataset.code,
    group:
      handle.dataset.group ||
      handle.closest("section[data-group]").dataset.group,
    x: e.clientX,
    y: e.clientY,
    moved: false,
    target: null,
  };
  handle.setPointerCapture(e.pointerId);
});
function clearDrop() {
  document
    .querySelectorAll(".drop-target,.drop-after")
    .forEach((x) => x.classList.remove("drop-target", "drop-after"));
}
app.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7 && !drag.moved)
    return;
  drag.moved = true;
  e.preventDefault();
  if (e.clientY < 100) window.scrollBy(0, -12);
  else if (e.clientY > window.innerHeight - 80) window.scrollBy(0, 12);
  const hit = document.elementFromPoint(e.clientX, e.clientY),
    row = hit?.closest("[data-bird]"),
    group = hit?.closest("section[data-group]");
  clearDrop();
  drag.target = null;
  if (!group) return;
  const heading = group.querySelector(".group-heading"),
    marker = drag.type === "group" ? heading : row || heading,
    rect = marker.getBoundingClientRect(),
    after = e.clientY > rect.top + rect.height / 2;
  const g = profile().groups.find((g) => g.id === group.dataset.group);
  const before = row
    ? after
      ? g.codes[g.codes.indexOf(row.dataset.bird) + 1] || null
      : row.dataset.bird
    : after
      ? g.codes[0] || null
      : null;
  const beforeGroup = after
    ? profile().groups[profile().groups.indexOf(g) + 1]?.id || null
    : g.id;
  drag.target = { group: g.id, before, beforeGroup };
  marker.classList.add(after ? "drop-after" : "drop-target");
});
app.addEventListener("pointerup", () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  clearDrop();
  if (d.moved) {
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 150);
    if (d.target) {
      d.type === "group"
        ? O.moveGroup(profile(), d.group, d.target.beforeGroup)
        : O.moveSpecies(profile(), d.code, d.target.group, d.target.before);
      rebuild();
      save();
      render();
    }
  }
});
app.addEventListener("pointercancel", () => {
  drag = null;
  clearDrop();
});
document.addEventListener("click", (e) => {
  if (expanded && !e.target.closest(".bird")) closeEditor();
});
app.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || locked || suppressClick) return;
  const action = target.dataset.action;
  try {
    if (action === "start") {
      const loc = locationById(selectedId);
      if (!loc) throw new Error("請選地點");
      state.session = C.createSession(
        loc,
        startTouched ? new Date($("#start-time").value).getTime() : Date.now(),
        $("#gps").checked,
        Date.now(),
        O.orderedSpecies(profile(), species),
      );
      O.resetCollapsed(profile());
      if (!save()) {
        state.session = null;
        return;
      }
      view = "home";
      render();
      gpsStart();
      navigator.storage?.persist?.().catch(() => {});
    } else if (action === "count") {
      C.increment(
        state.session,
        target.dataset.code,
        target.dataset.field,
        Number(target.dataset.delta),
      );
      changed();
      updateRow(
        target.dataset.code,
        target.dataset.field === "heard" && Number(target.dataset.delta) > 0,
      );
    } else if (action === "bird") {
      const number = C.numericQuery(state.session.query);
      if (number !== null && target.classList.contains("bird-main")) {
        C.increment(state.session, target.dataset.code, "total", number);
        state.session.query = "";
        $("#query").value = "";
        changed();
        updateRow(target.dataset.code);
      } else openEditor(target.dataset.code);
    } else if (action === "close-editor") closeEditor();
    else if (action === "breeding") await breeding(target.dataset.code);
    else if (action === "stop") stopSession();
    else if (action === "only-recorded") {
      O.toggleAllCollapsed(profile());
      state.session.onlyRecorded = false;
      save();
      render();
    } else if (action === "toggle-group") {
      const g = profile().groups.find((g) => g.id === target.dataset.group);
      g.collapsed = !g.collapsed;
      save();
      render();
    } else if (action === "toggle-edit") {
      editMode = !editMode;
      render();
    } else if (action === "move-bird")
      await moveBirdDialog(target.dataset.code);
    else if (action === "edit-group") await editGroup(target.dataset.group);
    else if (action === "add-group") await editGroup();
    else if (["settings", "locations", "organize"].includes(action)) {
      view = action;
      if (view === "organize") {
        O.resetCollapsed(profile());
        save();
      }
      render();
    } else if (action === "back") {
      view = "home";
      render();
    } else if (action === "add-location") await editLocation();
    else if (action === "location-data") {
      dataLocationId = target.dataset.id;
      view = "location-data";
      render();
      const loc = locationById(dataLocationId);
      if (!loc.cache) {
        try {
          const response = await fetch("./data/locations.json");
          const bundled = (await response.json()).find((c) => c.id === loc.id);
          if (bundled) {
            loc.cache = C.validateCache(bundled, loc.id);
            save();
            if (view === "location-data") render();
          }
        } catch {}
      }
    } else if (action === "refresh-location")
      await refreshLocation(dataLocationId);
    else if (action === "edit-location") await editLocation(target.dataset.id);
    else if (action === "nearby") {
      view = "nearby";
      render();
      if (!point) locate();
      else if (localStorage.getItem(API_KEY)) {
        nearby = await O.fetchNearby(point, localStorage.getItem(API_KEY));
        render();
      }
    } else if (action === "locate") {
      manualLocation = false;
      locate();
    } else if (action === "load-nearby") {
      locationBusy = true;
      render();
      try {
        nearby = await O.fetchNearby(point, localStorage.getItem(API_KEY));
      } finally {
        locationBusy = false;
        render();
      }
    } else if (action === "pick-nearby")
      await editLocation("", nearby[Number(target.dataset.index)]);
    else if (action === "backup")
      download("ebird-counter.json", JSON.stringify(state, null, 2));
    else if (action === "download-text")
      download(
        "ebird-notes.txt",
        state.session.output,
        "text/plain;charset=utf-8",
      );
    else if (action === "copy") {
      const text = state.session.output;
      try {
        await navigator.clipboard.writeText(text);
        if (text === state.session.output) {
          state.session.copied = true;
          save();
          render();
        }
        notice("已複製");
      } catch {
        $("#output").select();
        notice("請手動複製已選取文字");
      }
    } else if (action === "restart") {
      if (
        !state.session.copied &&
        !(await confirmAction("尚未複製", "清除這趟紀錄並從頭開始？"))
      )
        return;
      state.session = null;
      startValue = Date.now();
      startTouched = false;
      view = "home";
      armedStop = false;
      manualLocation = false;
      selectedId = "";
      save();
      render();
      locate();
    } else if (action === "resume") {
      state.session.stop = null;
      state.session.copied = false;
      state.session.output = "";
      armedStop = false;
      rebuild();
      save();
      render();
      gpsStart();
    } else if (action === "regenerate") {
      if (await confirmAction("重新產生", "取代手動編輯的文字？")) {
        state.session.output = C.exportText(state.session, state.aliases).text;
        state.session.copied = false;
        save();
        render();
      }
    } else if (action === "clear-personal") {
      if (
        await confirmAction("全台頻率", "移除本機個人頻率？自訂排序會保留。")
      ) {
        delete state.frequency.personal;
        if (!profile().customized)
          profile().thresholds = O.suggestThresholds(
            O.sharedSpecies(state, publicData),
          );
        rebuild(!profile().customized);
        save();
        render();
      }
    } else if (action === "preview-frequency") {
      let cache =
        state.frequency.personal || state.frequency.public || publicData;
      if (cache.compact) {
        const response = await fetch("./data/taiwan.json");
        if (!response.ok) throw new Error("月份資料暫時無法讀取");
        cache = C.validateCache(await response.json(), "TW");
        state.frequency.public = cache;
        save();
      }
      const month = Number($("#preview-month").value),
        byCode = new Map(cache.species.map((s) => [s.code, s]));
      $("#month-preview").innerHTML =
        O.orderedSpecies(profile(), species)
          .filter((s) => (byCode.get(s.code)?.months[month] || 0) > 0)
          .map(
            (s) =>
              `<div class="month-row"><span>${esc(nameOf(s))}</span><b>${byCode.get(s.code).months[month].toFixed(1)}%</b></div>`,
          )
          .join("") || "此月無紀錄";
    } else if (action === "suggest-groups") {
      const suggested = O.suggestThresholds(species);
      $("#threshold-common").value = suggested.common;
      $("#threshold-uncommon").value = suggested.uncommon;
      previewThresholds();
    } else if (action === "reset-groups") {
      const common = Number($("#threshold-common").value),
        uncommon = Number($("#threshold-uncommon").value);
      if (!(common <= 100 && common > uncommon && uncommon > 0))
        throw new Error("需為 100 ≥ 常見 > 少見 > 0");
      if (
        !(await confirmAction(
          "重建區塊",
          "依新門檻重建五區塊，將取代自訂順序。",
        ))
      )
        return;
      profile().thresholds = { common, uncommon };
      rebuild(true);
      save();
      render();
    } else if (action === "refresh-public") {
      notice("正在讀取全台頻率");
      state.frequency.public = await C.fetchChart("TW", fetch, DOMParser, [
        "public",
      ]);
      if (!profile().customized)
        profile().thresholds = O.suggestThresholds(
          O.sharedSpecies(state, publicData),
        );
      rebuild(!profile().customized);
      save();
      render();
    }
  } catch (e) {
    notice(e.message);
  }
});
app.addEventListener("input", (event) => {
  if (locked) return;
  const el = event.target;
  if (el.id === "query") {
    state.session.query = el.value;
    closeEditor();
    save();
    refreshList();
  } else if (el.id === "threshold-common" || el.id === "threshold-uncommon")
    previewThresholds();
  else if (el.id === "output") {
    state.session.output = el.value;
    state.session.copied = false;
    save();
    $('[data-action="copy"]').textContent = "複製全部";
  } else if (el.dataset.direct) {
    const value = Number(el.value);
    if (el.value.trim() && Number.isSafeInteger(value) && value >= 0) {
      const c = C.recordFor(state.session, el.dataset.code),
        delta = value - c[el.dataset.direct];
      try {
        C.increment(state.session, el.dataset.code, el.dataset.direct, delta);
        changed();
        updateRow(el.dataset.code, el.dataset.direct === "heard" && delta > 0);
      } catch (e) {
        notice(e.message);
      }
    }
  } else if (el.dataset.note) {
    C.recordFor(state.session, el.dataset.note).note = el.value;
    changed();
    updateRow(el.dataset.note);
  } else if (el.id === "api-key")
    localStorage.setItem(API_KEY, el.value.trim());
  else if (el.id === "alias-query")
    $("#alias-results").innerHTML = species
      .filter((s) => el.value && C.matchesQuery(s, el.value, state.aliases))
      .slice(0, 40)
      .map(
        (s) =>
          `<label>${esc(s.name)}<input data-alias="${s.code}" value="${esc(state.aliases[s.code] || "")}" placeholder="${esc(C.compatibleAlias(s) || "本機簡稱")}" maxlength="40"></label>`,
      )
      .join("");
  else if (el.dataset.alias) {
    if (el.value.trim()) state.aliases[el.dataset.alias] = el.value.trim();
    else delete state.aliases[el.dataset.alias];
    save();
  }
});
for (const type of ["compositionupdate", "compositionend"])
  app.addEventListener(type, (e) => {
    if (e.target.id === "query")
      queueMicrotask(() => {
        state.session.query = e.target.value;
        refreshList();
      });
  });
app.addEventListener("change", async (event) => {
  if (locked) return;
  const el = event.target;
  try {
    if (el.id === "location-month") previewLocationMonth();
    else if (el.id === "location-file" && el.files[0]) {
      const loc = locationById(dataLocationId),
        file = el.files[0];
      if (file.size > 10_000_000) throw new Error("檔案超過 10 MB");
      const named = file.name.match(/ebird_(L\d+)_/i)?.[1];
      if (named && named.toUpperCase() !== loc.id)
        throw new Error("檔案地點不符");
      loc.cache = C.parseHistogram(
        await file.text(),
        loc.id,
        $("#location-source").value,
      );
      delete loc.cacheError;
      save();
      render();
    } else if (el.id === "location") {
      selectedId = el.value;
      manualLocation = true;
      $('[data-action="start"]').disabled = !selectedId;
    } else if (el.id === "gps") gpsEnabled = el.checked;
    else if (el.id === "start-time") {
      const time = new Date(el.value).getTime();
      if (!Number.isFinite(time)) throw new Error("時間無效");
      startValue = Math.min(Date.now(), time);
      startTouched = true;
      el.value = localDate(startValue);
    } else if (el.dataset.direct) {
      const value = Number(el.value);
      if (!el.value.trim() || !Number.isSafeInteger(value) || value < 0)
        throw new Error("請輸入 0 以上整數");
      const c = C.recordFor(state.session, el.dataset.code),
        delta = value - c[el.dataset.direct];
      C.increment(state.session, el.dataset.code, el.dataset.direct, delta);
      changed();
      updateRow(el.dataset.code, el.dataset.direct === "heard" && delta > 0);
    } else if (
      ["personal-file", "public-file", "restore"].includes(el.id) &&
      el.files[0]
    ) {
      if (el.files[0].size > 100_000_000) throw new Error("檔案超過 100 MB");
      const text =
        el.id === "personal-file"
          ? await readPersonalFile(el.files[0])
          : await el.files[0].text();
      if (el.id === "restore") {
        const restored = C.readState({ getItem: () => text });
        if (!(await confirmAction("還原備份", "取代目前的紀錄與所有設定？")))
          return;
        gpsStop();
        state = restored;
        rebuild();
        save();
        view = "home";
        render();
        gpsStart();
        return;
      }
      if (el.id === "personal-file") {
        const parsed = parsePersonalCSV(
          text,
          (state.frequency.public || publicData)?.species || species,
        );
        state.frequency.personal = parsed.cache;
        for (const l of parsed.locations) {
          const saved = locationById(l.id);
          if (saved && !Number.isFinite(saved.lat)) {
            saved.lat = l.lat;
            saved.lon = l.lon;
          }
        }
        notice(`已統計 ${parsed.cache.sampleSize} 份完整鳥單`);
      } else state.frequency.public = C.parseHistogram(text, "TW", "public");
      species = O.sharedSpecies(state, publicData);
      if (!profile().customized)
        profile().thresholds = O.suggestThresholds(species);
      rebuild(!profile().customized);
      save();
      render();
    }
  } catch (e) {
    notice(e.message);
  }
});
window.addEventListener("pagehide", () => {
  if (state) save();
});
document.addEventListener("visibilitychange", () => {
  if (state) save();
  if (!document.hidden) tick();
});
window.addEventListener("storage", (event) => {
  if (event.key === C.STORAGE_KEY && !locked) {
    locked = true;
    gpsStop();
    app.innerHTML =
      '<p class="warning">另一個分頁已更新紀錄，請回到原分頁。</p>';
  }
});
async function boot() {
  try {
    state = C.readState(localStorage);
  } catch (e) {
    app.innerHTML = `<p class="warning">${esc(e.message)}</p><button id="recovery">下載原始備份</button>`;
    $("#recovery").onclick = () =>
      download("recovery.json", localStorage.getItem(C.STORAGE_KEY) || "{}");
    return;
  }
  for (const loc of state.locations) {
    const preset = C.DEFAULT_LOCATIONS.find((l) => l.id === loc.id);
    if (!Number.isFinite(loc.lat) && preset?.lat) {
      loc.lat = preset.lat;
      loc.lon = preset.lon;
    }
  }
  try {
    const response = await fetch("./data/taiwan-index.json", {
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const data = await response.json();
      data.species = data.species.map((s) => ({
        ...s,
        months: Array(12).fill(null),
      }));
      publicData = C.validateCache(data, "TW");
    }
  } catch {}
  if (publicData && !state.frequency.public)
    state.frequency.public = publicData;
  rebuild();
  save();
  render();
  gpsStart();
  if (!state.session) locate();
  setInterval(tick, 1000);
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(() => {});
}
document.querySelector("#notice").hidden = true;
if (navigator.locks)
  navigator.locks.request(
    C.STORAGE_KEY,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) {
        locked = true;
        app.innerHTML = '<p class="warning">計鳥簿已在另一個分頁開啟。</p>';
        return;
      }
      await boot();
      await new Promise(() => {});
    },
  );
else boot();
