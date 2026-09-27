import aliases from './aliases.mjs';

// Percentage points. Bands are anchored at the highest remaining frequency,
// not pairwise fuzzy comparisons (which would make sorting non-transitive).
export const FREQUENCY_THRESHOLD_PP = 2;
export const STORAGE_KEY = 'ebird-mobile-counter:v1';
export const DEFAULT_LOCATIONS = [
  { id: 'L16381971', alias: '後港新公園' },
  { id: 'L18412499', alias: '建國二路' },
  { id: 'L17621411', alias: '市場' },
];
export const BREEDING = [['', '繁殖'], ['唱歌', '唱歌'], ['求偶', '求偶'], ['一對', '一對'],
  ['適合的棲地', '棲地'], ['領域防衛', '領域'], ['造訪可能的巢位', '訪巢'],
  ['焦躁行為', '焦躁'], ['攜帶巢材', '巢材'], ['生理證據', '生理'],
  ['分散注意力展示', '誘敵'], ['使用過的巢', '舊巢'], ['剛離巢幼鳥', '離巢'],
  ['佔用巢位', '佔巢'], ['攜帶食物', '攜食'], ['餵食幼鳥', '餵雛'],
  ['巢中有蛋', '巢蛋'], ['巢中有幼鳥', '巢雛']];

export function parseLocation(input) {
  let id = String(input).trim();
  if (!/^L\d+$/i.test(id)) {
    let url;
    try { url = new URL(id.startsWith('ebird.org/') ? `https://${id}` : id, 'https://ebird.org'); }
    catch { throw new Error('請輸入 eBird barchart 網址或 L 開頭的地點 ID。'); }
    if (url.hostname !== 'ebird.org' || !/^\/(?:[^/]+\/)?barchart$/.test(url.pathname)) throw new Error('只接受 ebird.org 的 barchart 網址。');
    id = url.searchParams.get('r') || '';
  }
  if (!/^L\d+$/i.test(id)) throw new Error('請一次選一個 L 開頭的 eBird 地點。');
  return id.toUpperCase();
}
export function chartURL(id, personal = false, codes = []) {
  const url = new URL('https://ebird.org/barchart');
  url.search = new URLSearchParams({ r: parseLocation(id), byr: '1900', eyr: String(new Date().getFullYear()), bmo: '1', emo: '12' });
  if (personal) url.searchParams.set('personal', 'true');
  if (codes.length) url.searchParams.set('spp', codes.join(','));
  return url.href;
}
export function catalog() {
  const result = new Map();
  for (const [alias, spec] of Object.entries(aliases)) {
    if (!result.has(spec.code)) result.set(spec.code, { code: spec.code, name: spec.name, alias, months: Array(12).fill(null) });
    else if (alias.length < result.get(spec.code).alias.length) result.get(spec.code).alias = alias;
  }
  return [...result.values()];
}
export function compatibleAlias(spec, local = {}) {
  const matches = Object.entries(aliases).filter(([, a]) => (a.codes || [a.code]).includes(spec.code));
  const custom = local[spec.code];
  if (custom && matches.some(([name]) => name === custom)) return custom;
  return matches.sort((a, b) => a[0].length - b[0].length)[0]?.[0] || '';
}
export function displayAlias(spec, local = {}) { return local[spec.code] || compatibleAlias(spec) || spec.name; }
export function speciesList(cache) {
  const data = (cache?.species || []).map(s => ({ ...s }));
  const seen = new Set(data.map(s => s.code));
  for (const s of catalog()) {
    if (!data.some(x => { const a = aliases[compatibleAlias(x)]; return a && a.code === s.code; }) && !seen.has(s.code)) data.push(s);
  }
  return data.map((s, order) => ({ ...s, order }));
}
export function sortSpecies(species, month, threshold = FREQUENCY_THRESHOLD_PP) {
  if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isFinite(threshold) || threshold < 0) throw new Error('排序參數錯誤');
  const list = species.map((s, i) => ({ ...s, order: s.order ?? i })).sort((a, b) => (b.months[month] ?? -1) - (a.months[month] ?? -1) || a.order - b.order);
  const result = [];
  while (list.length) {
    const top = list.shift(), group = [top], value = top.months[month];
    while (list.length && ((value === null && list[0].months[month] === null) ||
      (value !== null && list[0].months[month] !== null && value - list[0].months[month] <= threshold))) group.push(list.shift());
    result.push(...group.sort((a, b) => a.order - b.order));
  }
  return result;
}

export function validateCache(data, id) {
  if (!data || data.id !== id || !['public', 'personal'].includes(data.source) || !Array.isArray(data.species) || !data.species.length || data.species.length > 5000) throw new Error('資料的地點、來源或鳥種清單不正確。');
  if (!Number.isFinite(Date.parse(data.updatedAt))) throw new Error('資料缺少更新時間。');
  const seen = new Set();
  for (const s of data.species) {
    if (!/^[a-z0-9]+$/.test(s.code) || !s.name || typeof s.name !== 'string' || s.name.length > 200 || seen.has(s.code) || !Array.isArray(s.months) || s.months.length !== 12 || s.months.some(n => n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100))) throw new Error('鳥種頻率格式不正確，必須為 12 個月的 0–100 百分比或 null。');
    seen.add(s.code);
  }
  return data;
}

export function parseHistogram(text, id, source = 'public') {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  const header = lines.find(l => /^\s*\tJan\t/.test(l));
  const monthNames = header?.split('\t').filter(Boolean);
  if (monthNames?.join(',') !== 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec') throw new Error('請匯入全年 1–12 月的 eBird Histogram TXT 檔。');
  const sampleIndex = lines.findIndex(l => /^Sample Size:\t/.test(l));
  if (sampleIndex < 0) throw new Error('檔案缺少 Sample Size。');
  const values = line => {
    const cells = line.split('\t').slice(1);
    while (cells.at(-1) === '') cells.pop();
    if (cells.length !== 48 || cells.some(v => !v.trim() || !Number.isFinite(Number(v)) || Number(v) < 0)) throw new Error('資料必須有完整的 48 個週區間數值。');
    return cells.map(Number);
  };
  const samples = values(lines[sampleIndex]);
  const normalize = name => name.normalize('NFKC').replace(/\([^)]*\)/g, '').replace(/台/g, '臺').replace(/\s/g, '');
  const species = lines.slice(sampleIndex + 1).map(line => {
    const name = line.split('\t')[0].trim(), weekly = values(line);
    if (weekly.some(n => n > 1)) throw new Error('Histogram 頻率必須介於 0 與 1。');
    const matches = Object.entries(aliases).filter(([key, value]) => normalize(key) === normalize(name) || normalize(value.name) === normalize(name));
    const codes = [...new Set(matches.map(([, value]) => value.code))];
    // Unknown taxa keep a stable local identity; never guess their assistant alias.
    const code = codes.length === 1 ? codes[0] : 'u' + [...name].map(c => c.codePointAt(0).toString(16)).join('');
    const months = Array.from({ length: 12 }, (_, m) => {
      let total = 0, reports = 0;
      for (let w = m * 4; w < m * 4 + 4; w++) { total += samples[w]; reports += samples[w] * weekly[w]; }
      return total ? reports / total * 100 : null;
    });
    return { code, name, months };
  });
  const expected = Number(lines.find(l => /^Number of taxa:/.test(l))?.split('\t')[1]);
  if (expected !== species.length || !samples.some(n => n > 0)) throw new Error('檔案鳥種數不符或沒有樣本。');
  return validateCache({ id, source, updatedAt: new Date().toISOString(), transport: 'import', species }, id);
}

// Parse only JSON embedded by the observed eBird line graph page. Never eval HTML.
export function parseChartHTML(html, id, source, Parser = globalThis.DOMParser) {
  const doc = new Parser().parseFromString(html, 'text/html');
  const download = [...doc.querySelectorAll('a[href]')].find(a => /\/barchartData\?/.test(a.getAttribute('href')));
  if (!download) throw new Error('不是可用的 eBird 圖表頁，可能需要登入或瀏覽器驗證。');
  const link = new URL(download.getAttribute('href'), 'https://ebird.org');
  if (link.searchParams.get('r') !== id || link.searchParams.get('bmo') !== '1' || link.searchParams.get('emo') !== '12') throw new Error('請使用這個地點的全年（1–12 月）圖表。');
  const actual = link.searchParams.get('personal') === 'true' ? 'personal' : 'public';
  if (source && source !== actual) throw new Error('eBird 回傳的資料來源與要求不同。');
  const rows = [...doc.querySelectorAll('#barchart-display tr')].filter(r => r.querySelector('a[title="Map"]'));
  const species = rows.map(r => ({ code: new URL(r.querySelector('a[title="Map"]').getAttribute('href'), 'https://ebird.org').pathname.split('/').pop(), name: r.querySelector('.SpeciesName')?.textContent.trim() }));
  if (!species.length) throw new Error('這個地點沒有可用鳥種資料。');
  const script = [...doc.querySelectorAll('script')].find(s => /\bvar lgRaw\s*=/.test(s.textContent));
  if (!script) return { codes: species.map(s => s.code), source: actual };
  const match = script.textContent.match(/\bvar lgRaw\s*=\s*(\{[\s\S]*?\}),\s*numWeeks/);
  if (!match) throw new Error('eBird 折線圖資料結構已變更。');
  const raw = JSON.parse(match[1]);
  if (!Array.isArray(raw.xLabels) || raw.xLabels.length !== 48 || raw.xLabels.some((label, i) => label !== `${Math.floor(i / 4) + 1}/${[1, 8, 15, 22][i % 4]}`)) throw new Error('折線圖必須包含全年 48 個週區間。');
  const series = raw.lineGraphs.find(g => g.type === 'freq')?.series;
  if (!series?.length) throw new Error('圖表沒有頻率資料。');
  for (const s of species) {
    const matches = series.filter(x => x.seriesName.trim() === s.name);
    if (matches.length !== 1) throw new Error(`無法對應 ${s.name} 的頻率。`);
    const item = matches[0];
    s.months = Array.from({ length: 12 }, (_, m) => {
      let total = 0, reports = 0;
      for (let w = m * 4 + 1; w <= m * 4 + 4; w++) {
        const n = Number(item.values_N[w] ?? 0), f = Number(item.values[w] ?? 0);
        if (!Number.isFinite(n) || n < 0 || !Number.isFinite(f) || f < 0 || f > 100) throw new Error('頻率或樣本數無效。');
        total += n; reports += n * f / 100;
      }
      return total ? reports / total * 100 : null;
    });
  }
  if (!species.some(s => s.months.some(n => n !== null && n > 0))) throw new Error('頻率資料為空。');
  return validateCache({ id, source: actual, updatedAt: new Date().toISOString(), species }, id);
}

export async function fetchChart(id, fetcher = fetch, Parser = globalThis.DOMParser) {
  const failures = [];
  for (const source of ['personal', 'public']) {
    try {
      const get = async codes => {
        const url = chartURL(id, source === 'personal', codes);
        const response = await fetcher(url, { credentials: source === 'personal' ? 'include' : 'omit', signal: AbortSignal.timeout(15000) });
        if (!response.ok || (response.url && new URL(response.url).hostname !== 'ebird.org')) throw new Error('需要登入或網路請求失敗');
        return parseChartHTML(await response.text(), id, source, Parser);
      };
      let data = await get([]);
      if (data.codes) data = await get(data.codes);
      if (!data.species) throw new Error('缺少精確頻率');
      return { ...data, fallbackReason: failures.join('；'), transport: 'live' };
    } catch (e) { failures.push(`${source === 'personal' ? '個人' : '公開'}：${e.message}`); }
  }
  throw new Error('eBird 無法直接讀取（跨網域／登入／網路限制）。請開啟全年折線圖，另存 HTML 後匯入。' + failures.join('；'));
}

export function createSession(loc, start, gps, now = Date.now()) {
  if (!Number.isFinite(start) || start > now) throw new Error('開始時間不能在未來。');
  return { id: crypto.randomUUID(), location: { id: loc.id, alias: loc.alias }, start, stop: null,
    species: sortSpecies(speciesList(loc.cache), new Date(start).getMonth()), counts: {}, query: '',
    gpsEnabled: gps, distanceM: 0, lastFix: null, lastGpsTime: null, gpsGaps: 0, gpsStatus: gps ? '等待定位' : '未啟用 GPS', output: '', copied: false };
}
export function increment(session, code, kind, delta) {
  const count = session.counts[code] ||= { seen: 0, heard: 0, breeding: '' };
  count[kind] = Math.max(0, count[kind] + delta);
  session.copied = false;
}
export function elapsed(session, now = Date.now()) { return Math.max(0, (session.stop ?? now) - session.start); }
export function distance(a, b) {
  const rad = Math.PI / 180, dlat = (b.lat - a.lat) * rad, dlon = (b.lon - a.lon) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function addFix(session, fix) {
  if (!session.gpsEnabled || session.stop || ![fix.lat, fix.lon, fix.accuracy, fix.time].every(Number.isFinite) || Math.abs(fix.lat) > 90 || Math.abs(fix.lon) > 180 || fix.accuracy < 0 || fix.accuracy > 50) return false;
  const prev = session.lastFix;
  const lastGpsTime = session.lastGpsTime ?? prev?.time;
  if (lastGpsTime && fix.time <= lastGpsTime) return false;
  if (prev) {
    const dt = (fix.time - prev.time) / 1000, d = distance(prev, fix);
    if ((fix.time - lastGpsTime) / 1000 > 120) session.gpsGaps++;
    else if (d > Math.max(5, (prev.accuracy + fix.accuracy) / 2)) {
      if (d / dt > 12) return false;
      session.distanceM += d;
    } else { session.lastGpsTime = fix.time; return true; }
  }
  session.lastFix = fix; session.lastGpsTime = fix.time;
  return true;
}
export function exportText(session, local = {}) {
  const date = new Date(session.start), pad = n => String(n).padStart(2, '0');
  const lines = [`${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`, session.location.alias,
    `${pad(date.getHours())}:${pad(date.getMinutes())} 開始 ${Math.max(1, Math.round(elapsed(session) / 60000))} 分鐘`];
  const unmapped = [];
  for (const s of session.species) {
    const c = session.counts[s.code];
    if (!c || !(c.seen + c.heard)) continue;
    const alias = compatibleAlias(s, local);
    if (!alias) { unmapped.push({ ...s, ...c }); continue; }
    const details = [c.breeding, c.heard ? `${c.heard} 聽到` : ''].filter(Boolean).join('，');
    lines.push(`${alias} ${c.seen + c.heard}${details ? ' ' + details : ''}`);
  }
  return { text: lines.join('\n'), unmapped };
}
export function matchesQuery(spec, query, local = {}) {
  const haystack = `${spec.name} ${displayAlias(spec, local)} ${Object.entries(aliases).filter(([, a]) => (a.codes || [a.code]).includes(spec.code)).map(([k]) => k).join(' ')}`.normalize('NFKC').toLowerCase();
  return [...query.trim().normalize('NFKC').toLowerCase()].every(c => haystack.includes(c));
}

export function initialState() { return { version: 1, locations: DEFAULT_LOCATIONS.map(l => ({ ...l })), aliases: {}, session: null }; }
export function readState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return initialState();
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.locations) || !data.aliases || typeof data.aliases !== 'object' || Array.isArray(data.aliases)) throw new Error('本機備份格式無法辨識，請先下載原始備份。');
  const validAlias = v => typeof v === 'string' && v.trim() && v.length <= 80 && !/[\r\n]/.test(v);
  const ids = new Set();
  for (const l of data.locations) {
    if (!/^L\d+$/.test(l.id) || ids.has(l.id) || !validAlias(l.alias)) throw new Error('地點備份損壞');
    ids.add(l.id);
    if (l.cache) validateCache(l.cache, l.id);
  }
  for (const [code, alias] of Object.entries(data.aliases)) if (!/^[a-z0-9]+$/.test(code) || !validAlias(alias)) throw new Error('簡稱備份損壞');
  if (data.session) {
    const s = data.session;
    if (!Number.isFinite(s.start) || (s.stop !== null && (!Number.isFinite(s.stop) || s.stop < s.start)) || !s.location || !/^L\d+$/.test(s.location.id) || !validAlias(s.location.alias) || !s.counts || typeof s.counts !== 'object' || Array.isArray(s.counts) || typeof s.output !== 'string' || typeof s.query !== 'string' || typeof s.copied !== 'boolean' || typeof s.gpsEnabled !== 'boolean' || !Number.isFinite(s.distanceM) || s.distanceM < 0 || !Number.isInteger(s.gpsGaps) || s.gpsGaps < 0) throw new Error('計數備份損壞');
    validateCache({ id: s.location.id, source: 'public', updatedAt: new Date(s.start).toISOString(), species: s.species }, s.location.id);
    const codes = new Set(s.species.map(x => x.code));
    for (const [code, count] of Object.entries(s.counts)) if (!codes.has(code) || !count || !Number.isSafeInteger(count.seen) || count.seen < 0 || !Number.isSafeInteger(count.heard) || count.heard < 0 || !BREEDING.some(([value]) => value === count.breeding)) throw new Error('鳥種數量備份損壞');
    if (s.lastFix && (![s.lastFix.lat, s.lastFix.lon, s.lastFix.accuracy, s.lastFix.time].every(Number.isFinite) || Math.abs(s.lastFix.lat) > 90 || Math.abs(s.lastFix.lon) > 180 || s.lastFix.accuracy < 0)) throw new Error('GPS 備份損壞');
    if (s.lastGpsTime != null && !Number.isFinite(s.lastGpsTime)) throw new Error('GPS 時間備份損壞');
  }
  return data;
}
export function saveState(storage, state) { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
