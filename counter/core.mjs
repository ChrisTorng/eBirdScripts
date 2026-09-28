import historicalNames from "./historical-names.mjs";
import aliases from "./aliases.mjs";

// Percentage points. Bands are anchored at the highest remaining frequency,
// not pairwise fuzzy comparisons (which would make sorting non-transitive).
export const FREQUENCY_THRESHOLD_PP = 2;
export const STORAGE_KEY = "ebird-mobile-counter:v1";
export const DEFAULT_LOCATIONS = [
  {
    id: "L16381971",
    alias: "後港新公園",
    lat: 25.027864875233202,
    lon: 121.42652604701495,
  },
  {
    id: "L18412499",
    alias: "建國二路",
    lat: 25.027368404098322,
    lon: 121.431651854855,
  },
  { id: "L17621411", alias: "市場" },
];
export const BREEDING = [
  ["", "繁殖"],
  ["唱歌", "唱歌"],
  ["求偶", "求偶"],
  ["一對", "一對"],
  ["適合的棲地", "棲地"],
  ["領域防衛", "領域"],
  ["造訪可能的巢位", "訪巢"],
  ["焦躁行為", "焦躁"],
  ["攜帶巢材", "巢材"],
  ["生理證據", "生理"],
  ["分散注意力展示", "誘敵"],
  ["使用過的巢", "舊巢"],
  ["剛離巢幼鳥", "離巢"],
  ["佔用巢位", "佔巢"],
  ["攜帶食物", "攜食"],
  ["餵食幼鳥", "餵雛"],
  ["巢中有蛋", "巢蛋"],
  ["巢中有幼鳥", "巢雛"],
  ["[B]", "啄鷦築巢"],
  ["[NB]", "築巢"],
];
const BREEDING_CODES = [
  "",
  "S",
  "C",
  "P",
  "H",
  "T",
  "N",
  "A",
  "CN",
  "PE",
  "DD",
  "UN",
  "FL",
  "ON",
  "CF",
  "FY",
  "NE",
  "NY",
  "B",
  "NB",
];

export function parseLocation(input) {
  let id = String(input).trim();
  if (!/^L\d+$/i.test(id)) {
    let url;
    try {
      url = new URL(
        id.startsWith("ebird.org/") ? `https://${id}` : id,
        "https://ebird.org",
      );
    } catch {
      throw new Error("請輸入 eBird barchart 網址或 L 開頭的地點 ID。");
    }
    if (
      url.hostname !== "ebird.org" ||
      !/^\/(?:[^/]+\/)?barchart$/.test(url.pathname)
    )
      throw new Error("只接受 ebird.org 的 barchart 網址。");
    id = url.searchParams.get("r") || "";
  }
  if (!/^L\d+$/i.test(id))
    throw new Error("請一次選一個 L 開頭的 eBird 地點。");
  return id.toUpperCase();
}
export function chartURL(id, personal = false, codes = []) {
  const url = new URL("https://ebird.org/barchart");
  url.search = new URLSearchParams({
    r: id === "TW" ? "TW" : parseLocation(id),
    byr: "1900",
    eyr: String(new Date().getFullYear()),
    bmo: "1",
    emo: "12",
  });
  if (personal) url.searchParams.set("personal", "true");
  if (codes.length) url.searchParams.set("spp", codes.join(","));
  return url.href;
}
export function catalog() {
  const result = new Map();
  for (const [alias, spec] of Object.entries(aliases)) {
    if (!result.has(spec.code))
      result.set(spec.code, {
        code: spec.code,
        name: spec.name,
        alias,
        months: Array(12).fill(null),
      });
    else if (alias.length < result.get(spec.code).alias.length)
      result.get(spec.code).alias = alias;
  }
  return [...result.values()];
}
export function compatibleAlias(spec, local = {}) {
  const matches = Object.entries(aliases).filter(
    ([, a]) =>
      (a.codes || [a.code]).includes(spec.code) ||
      a.name.normalize("NFKC").replace(/\s/g, "") ===
        spec.name.normalize("NFKC").replace(/\s/g, ""),
  );
  const custom = local[spec.code];
  if (custom && matches.some(([name]) => name === custom)) return custom;
  return matches.sort((a, b) => a[0].length - b[0].length)[0]?.[0] || "";
}
export function displayAlias(spec, local = {}) {
  return local[spec.code] || compatibleAlias(spec) || spec.name;
}
export function speciesList(cache) {
  const data = (cache?.species || []).map((s) => ({ ...s }));
  const seen = new Set(data.map((s) => s.code));
  for (const s of catalog()) {
    if (
      !data.some((x) => {
        const a = aliases[compatibleAlias(x)];
        return a && a.code === s.code;
      }) &&
      !seen.has(s.code)
    )
      data.push(s);
  }
  return data.map((s, order) => ({ ...s, order }));
}
export function sortSpecies(
  species,
  month,
  threshold = FREQUENCY_THRESHOLD_PP,
) {
  if (
    !Number.isInteger(month) ||
    month < 0 ||
    month > 11 ||
    !Number.isFinite(threshold) ||
    threshold < 0
  )
    throw new Error("排序參數錯誤");
  const list = species
    .map((s, i) => ({ ...s, order: s.order ?? i }))
    .sort(
      (a, b) =>
        (b.months[month] ?? -1) - (a.months[month] ?? -1) || a.order - b.order,
    );
  const result = [];
  while (list.length) {
    const top = list.shift(),
      group = [top],
      value = top.months[month];
    while (
      list.length &&
      ((value === null && list[0].months[month] === null) ||
        (value !== null &&
          list[0].months[month] !== null &&
          value - list[0].months[month] <= threshold))
    )
      group.push(list.shift());
    result.push(...group.sort((a, b) => a.order - b.order));
  }
  return result;
}

export function validateCache(data, id) {
  if (
    !data ||
    data.id !== id ||
    !["public", "personal"].includes(data.source) ||
    !Array.isArray(data.species) ||
    !data.species.length ||
    data.species.length > 5000
  )
    throw new Error("資料的地點、來源或鳥種清單不正確。");
  if (!Number.isFinite(Date.parse(data.updatedAt)))
    throw new Error("資料缺少更新時間。");
  const seen = new Set();
  for (const s of data.species) {
    if (
      !/^[a-z0-9]+$/.test(s.code) ||
      !s.name ||
      typeof s.name !== "string" ||
      s.name.length > 200 ||
      seen.has(s.code) ||
      (s.months !== undefined &&
        (!Array.isArray(s.months) ||
          s.months.length !== 12 ||
          s.months.some(
            (n) =>
              n !== null &&
              (typeof n !== "number" ||
                !Number.isFinite(n) ||
                n < 0 ||
                n > 100),
          ))) ||
      (s.annual != null &&
        (!Number.isFinite(s.annual) || s.annual < 0 || s.annual > 100))
    )
      throw new Error(
        "鳥種頻率格式不正確，必須為 12 個月的 0–100 百分比或 null。",
      );
    seen.add(s.code);
  }
  return data;
}

export function identityForName(name) {
  const normalized = (text) =>
    text.normalize("NFKC").replace(/台/g, "臺").replace(/\s/g, "");
  const historical = Object.entries(historicalNames).find(
    ([key]) => normalized(key) === normalized(name),
  );
  if (historical) return { ...historical[1] };
  const loose = (text) => normalized(text).replace(/\([^)]*\)/g, "");
  const entries = Object.entries(aliases);
  const exact = entries.filter(
    ([key, value]) =>
      normalized(key) === normalized(name) ||
      normalized(value.name) === normalized(name),
  );
  const matches = exact.length
    ? exact
    : entries.filter(
        ([key, value]) =>
          loose(key) === loose(name) || loose(value.name) === loose(name),
      );
  const codes = [...new Set(matches.map(([, value]) => value.code))];
  return {
    code:
      codes.length === 1
        ? codes[0]
        : "u" + [...name].map((c) => c.codePointAt(0).toString(16)).join(""),
    name,
  };
}

export function parseHistogram(text, id, source = "public") {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const header = lines.find((l) => /^\s*\tJan\t/.test(l));
  const monthNames = header?.split("\t").filter(Boolean);
  if (
    monthNames?.join(",") !== "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec"
  )
    throw new Error("請匯入全年 1–12 月的 eBird Histogram TXT 檔。");
  const sampleIndex = lines.findIndex((l) => /^Sample Size:\t/.test(l));
  if (sampleIndex < 0) throw new Error("檔案缺少 Sample Size。");
  const values = (line) => {
    const cells = line.split("\t").slice(1);
    while (cells.at(-1) === "") cells.pop();
    if (
      cells.length !== 48 ||
      cells.some(
        (v) => !v.trim() || !Number.isFinite(Number(v)) || Number(v) < 0,
      )
    )
      throw new Error("資料必須有完整的 48 個週區間數值。");
    return cells.map(Number);
  };
  const samples = values(lines[sampleIndex]);
  const species = lines.slice(sampleIndex + 1).map((line) => {
    const name = line.split("\t")[0].trim(),
      weekly = values(line);
    if (weekly.some((n) => n > 1))
      throw new Error("Histogram 頻率必須介於 0 與 1。");
    const { code } = identityForName(name);
    const months = Array.from({ length: 12 }, (_, m) => {
      let total = 0,
        reports = 0;
      for (let w = m * 4; w < m * 4 + 4; w++) {
        total += samples[w];
        reports += samples[w] * weekly[w];
      }
      return total ? (reports / total) * 100 : null;
    });
    const sampleTotal = samples.reduce((a, b) => a + b, 0);
    const annual = sampleTotal
      ? (weekly.reduce((n, f, i) => n + f * samples[i], 0) / sampleTotal) * 100
      : null;
    return { code, name, months, annual };
  });
  const expected = Number(
    lines.find((l) => /^Number of taxa:/.test(l))?.split("\t")[1],
  );
  if (expected !== species.length || !samples.some((n) => n > 0))
    throw new Error("檔案鳥種數不符或沒有樣本。");
  return validateCache(
    {
      id,
      source,
      updatedAt: new Date().toISOString(),
      transport: "import",
      species,
    },
    id,
  );
}

// Parse only JSON embedded by the observed eBird line graph page. Never eval HTML.
export function parseChartHTML(
  html,
  id,
  source,
  Parser = globalThis.DOMParser,
) {
  const doc = new Parser().parseFromString(html, "text/html");
  const download = [...doc.querySelectorAll("a[href]")].find((a) =>
    /\/barchartData\?/.test(a.getAttribute("href")),
  );
  if (!download)
    throw new Error("不是可用的 eBird 圖表頁，可能需要登入或瀏覽器驗證。");
  const link = new URL(download.getAttribute("href"), "https://ebird.org");
  if (
    link.searchParams.get("r") !== id ||
    link.searchParams.get("bmo") !== "1" ||
    link.searchParams.get("emo") !== "12"
  )
    throw new Error("請使用這個地點的全年（1–12 月）圖表。");
  const actual =
    link.searchParams.get("personal") === "true" ? "personal" : "public";
  if (source && source !== actual)
    throw new Error("eBird 回傳的資料來源與要求不同。");
  const rows = [...doc.querySelectorAll("#barchart-display tr")].filter((r) =>
    r.querySelector('a[title="Map"]'),
  );
  const species = rows.map((r) => ({
    code: new URL(
      r.querySelector('a[title="Map"]').getAttribute("href"),
      "https://ebird.org",
    ).pathname
      .split("/")
      .pop(),
    name: r.querySelector(".SpeciesName")?.textContent.trim(),
  }));
  if (!species.length) throw new Error("這個地點沒有可用鳥種資料。");
  const script = [...doc.querySelectorAll("script")].find((s) =>
    /\bvar lgRaw\s*=/.test(s.textContent),
  );
  if (!script) return { codes: species.map((s) => s.code), source: actual };
  const match = script.textContent.match(
    /\bvar lgRaw\s*=\s*(\{[\s\S]*?\}),\s*numWeeks/,
  );
  if (!match) throw new Error("eBird 折線圖資料結構已變更。");
  const raw = JSON.parse(match[1]);
  if (
    !Array.isArray(raw.xLabels) ||
    raw.xLabels.length !== 48 ||
    raw.xLabels.some(
      (label, i) =>
        label !== `${Math.floor(i / 4) + 1}/${[1, 8, 15, 22][i % 4]}`,
    )
  )
    throw new Error("折線圖必須包含全年 48 個週區間。");
  const series = raw.lineGraphs.find((g) => g.type === "freq")?.series;
  if (!series?.length) throw new Error("圖表沒有頻率資料。");
  for (const s of species) {
    const matches = series.filter((x) => x.seriesName.trim() === s.name);
    if (matches.length !== 1) throw new Error(`無法對應 ${s.name} 的頻率。`);
    const item = matches[0];
    s.months = Array.from({ length: 12 }, (_, m) => {
      let total = 0,
        reports = 0;
      for (let w = m * 4 + 1; w <= m * 4 + 4; w++) {
        const n = Number(item.values_N[w] ?? 0),
          f = Number(item.values[w] ?? 0);
        if (
          !Number.isFinite(n) ||
          n < 0 ||
          !Number.isFinite(f) ||
          f < 0 ||
          f > 100
        )
          throw new Error("頻率或樣本數無效。");
        total += n;
        reports += (n * f) / 100;
      }
      return total ? (reports / total) * 100 : null;
    });
    let total = 0,
      reports = 0;
    for (let w = 1; w <= 48; w++) {
      const n = Number(item.values_N[w] || 0);
      total += n;
      reports += n * Number(item.values[w] || 0);
    }
    s.annual = total ? reports / total : null;
  }
  if (!species.some((s) => s.months.some((n) => n !== null && n > 0)))
    throw new Error("頻率資料為空。");
  return validateCache(
    { id, source: actual, updatedAt: new Date().toISOString(), species },
    id,
  );
}

export async function fetchChart(
  id,
  fetcher = fetch,
  Parser = globalThis.DOMParser,
  sources = ["personal", "public"],
) {
  const failures = [];
  for (const source of sources) {
    try {
      const get = async (codes) => {
        const url = chartURL(id, source === "personal", codes);
        const response = await fetcher(url, {
          credentials: source === "personal" ? "include" : "omit",
          signal: AbortSignal.timeout(15000),
        });
        if (
          !response.ok ||
          (response.url && new URL(response.url).hostname !== "ebird.org")
        )
          throw new Error("需要登入或網路請求失敗");
        return parseChartHTML(await response.text(), id, source, Parser);
      };
      let data = await get([]);
      if (data.codes) data = await get(data.codes);
      if (!data.species) throw new Error("缺少精確頻率");
      return {
        ...data,
        fallbackReason: failures.join("；"),
        transport: "live",
      };
    } catch (e) {
      failures.push(`${source === "personal" ? "個人" : "公開"}：${e.message}`);
    }
  }
  throw new Error(
    "eBird 無法直接讀取（跨網域／登入／網路限制）。請開啟全年折線圖，另存 HTML 後匯入。" +
      failures.join("；"),
  );
}

export function createSession(
  loc,
  start,
  gps,
  now = Date.now(),
  sharedSpecies = null,
) {
  if (!Number.isFinite(start) || start > now)
    throw new Error("開始時間不能在未來。");
  return {
    id: crypto.randomUUID(),
    location: { id: loc.id, alias: loc.alias },
    start,
    stop: null,
    species: sharedSpecies || speciesList(loc.cache),
    counts: {},
    query: "",
    onlyRecorded: false,
    gpsEnabled: gps,
    distanceM: 0,
    lastFix: null,
    lastGpsTime: null,
    gpsGaps: 0,
    gpsStatus: gps ? "等待定位" : "未啟用 GPS",
    output: "",
    copied: false,
  };
}
export function increment(session, code, kind, delta) {
  const count = recordFor(session, code);
  if (!Number.isSafeInteger(delta)) throw new Error("請輸入整數");
  const field = kind === "seen" ? "total" : kind;
  if (!["total", "heard"].includes(field)) throw new Error("計數欄位錯誤");
  if (
    !Number.isSafeInteger(count[field] + delta) ||
    (field === "heard" &&
      delta > 0 &&
      !Number.isSafeInteger(count.total + delta))
  )
    throw new Error("數字太大");
  count[field] = Math.max(0, count[field] + delta);
  if (field === "heard" && delta > 0) count.total += delta;
  session.copied = false;
}
export function recordFor(session, code) {
  return (session.counts[code] ||= {
    total: 0,
    heard: 0,
    breeding: "",
    note: "",
  });
}
export function hasInformation(c) {
  return !!c && !!(c.total || c.heard || c.breeding || c.note?.trim());
}
export function recordErrors(c) {
  if (!c) return [];
  const errors = [];
  if (c.total < c.heard) errors.push("個體數少於聽到數");
  if (c.breeding === "一對" && c.total < 2) errors.push("一對至少需要 2 隻");
  if ((c.breeding || c.note?.trim()) && !c.total)
    errors.push("已有資訊但個體數為 0");
  return errors;
}
export function formatDuration(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000),
    m = Math.floor(s / 60) % 60;
  return `${s >= 3600 ? Math.floor(s / 3600) + ":" : ""}${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function numericQuery(query) {
  const value = query.trim().normalize("NFKC").replace(/−/g, "-");
  return /^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}
export function elapsed(session, now = Date.now()) {
  return Math.max(0, (session.stop ?? now) - session.start);
}
export function distance(a, b) {
  const rad = Math.PI / 180,
    dlat = (b.lat - a.lat) * rad,
    dlon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function addFix(session, fix) {
  if (
    !session.gpsEnabled ||
    session.stop ||
    ![fix.lat, fix.lon, fix.accuracy, fix.time].every(Number.isFinite) ||
    Math.abs(fix.lat) > 90 ||
    Math.abs(fix.lon) > 180 ||
    fix.accuracy < 0 ||
    fix.accuracy > 50
  )
    return false;
  const prev = session.lastFix;
  const lastGpsTime = session.lastGpsTime ?? prev?.time;
  if (lastGpsTime && fix.time <= lastGpsTime) return false;
  if (prev) {
    const dt = (fix.time - prev.time) / 1000,
      d = distance(prev, fix);
    if ((fix.time - lastGpsTime) / 1000 > 120) session.gpsGaps++;
    else if (d > Math.max(5, (prev.accuracy + fix.accuracy) / 2)) {
      if (d / dt > 12) return false;
      session.distanceM += d;
    } else {
      session.lastGpsTime = fix.time;
      return true;
    }
  }
  session.lastFix = fix;
  session.lastGpsTime = fix.time;
  return true;
}
export function exportText(session, local = {}) {
  const date = new Date(session.start),
    pad = (n) => String(n).padStart(2, "0");
  const lines = [
    `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`,
    session.location.alias,
    `${pad(date.getHours())}:${pad(date.getMinutes())} 開始 ${Math.max(1, Math.round(elapsed(session) / 60000))} 分鐘`,
  ];
  const unmapped = [];
  for (const s of session.species) {
    const c = session.counts[s.code];
    if (!hasInformation(c)) continue;
    const alias = s.name;
    const breedingCode =
      BREEDING_CODES[BREEDING.findIndex(([value]) => value === c.breeding)];
    const details = [
      breedingCode ? BREEDING.find(([value]) => value === c.breeding)[1] : "",
      c.heard ? `${c.heard} 聽到` : "",
    ]
      .filter(Boolean)
      .join("，");
    lines.push(
      `${alias} ${c.total}${details ? " " + details : ""}${c.note?.trim() ? "；描述 " + JSON.stringify(c.note.trim()) : ""}`,
    );
  }
  return { text: lines.join("\n"), unmapped };
}
export function matchesQuery(spec, query, local = {}) {
  const haystack = `${spec.name} ${displayAlias(spec, local)} ${Object.entries(
    aliases,
  )
    .filter(([, a]) => (a.codes || [a.code]).includes(spec.code))
    .map(([k]) => k)
    .join(" ")}`
    .normalize("NFKC")
    .toLowerCase();
  return [...query.trim().normalize("NFKC").toLowerCase()].every((c) =>
    haystack.includes(c),
  );
}

export function initialState() {
  return {
    version: 2,
    locations: DEFAULT_LOCATIONS.map((l) => ({ ...l })),
    aliases: {},
    session: null,
    profiles: { global: { groups: [], customized: false } },
    activeProfile: "global",
    frequency: {},
  };
}
export function readState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return initialState();
  const data = JSON.parse(raw);
  if (
    ![1, 2].includes(data.version) ||
    !Array.isArray(data.locations) ||
    !data.aliases ||
    typeof data.aliases !== "object" ||
    Array.isArray(data.aliases)
  )
    throw new Error("本機備份格式無法辨識，請先下載原始備份。");
  if (data.version === 1) {
    for (const count of Object.values(data.session?.counts || {})) {
      if (
        !Number.isSafeInteger(count.seen) ||
        count.seen < 0 ||
        !Number.isSafeInteger(count.heard) ||
        count.heard < 0
      )
        throw new Error("舊版計數備份損壞");
      count.total = count.seen + count.heard;
      delete count.seen;
      count.note = "";
    }
    data.version = 2;
  }
  data.profiles ||= { global: { groups: [], customized: false } };
  data.activeProfile ||= "global";
  data.frequency ||= {};
  if (
    data.activeProfile !== "global" ||
    !data.profiles.global ||
    !Array.isArray(data.profiles.global.groups)
  )
    throw new Error("排序設定損壞");
  const thresholds = data.profiles.global.thresholds;
  if (
    thresholds &&
    !(
      Number.isFinite(thresholds.common) &&
      Number.isFinite(thresholds.uncommon) &&
      thresholds.common <= 100 &&
      thresholds.common > thresholds.uncommon &&
      thresholds.uncommon > 0
    )
  )
    throw new Error("分組門檻損壞");
  const groupIds = new Set(),
    assigned = new Set();
  for (const group of data.profiles.global.groups) {
    if (
      !/^[a-z0-9-]+$/.test(group.id) ||
      groupIds.has(group.id) ||
      typeof group.name !== "string" ||
      !group.name.trim() ||
      group.name.length > 80 ||
      !Array.isArray(group.codes) ||
      typeof group.collapsed !== "boolean"
    )
      throw new Error("區塊設定損壞");
    groupIds.add(group.id);
    for (const code of group.codes) {
      if (!/^[a-z0-9]+$/.test(code) || assigned.has(code))
        throw new Error("鳥種排序重複或損壞");
      assigned.add(code);
    }
  }
  for (const key of ["personal", "public"])
    if (data.frequency[key]) {
      validateCache(data.frequency[key], "TW");
      if (data.frequency[key].source !== key) throw new Error("頻率來源不符");
    }
  const validAlias = (v) =>
    typeof v === "string" && v.trim() && v.length <= 80 && !/[\r\n]/.test(v);
  const ids = new Set();
  for (const l of data.locations) {
    if (!/^L\d+$/.test(l.id) || ids.has(l.id) || !validAlias(l.alias))
      throw new Error("地點備份損壞");
    ids.add(l.id);
    if (
      (l.lat != null || l.lon != null) &&
      (!Number.isFinite(l.lat) ||
        !Number.isFinite(l.lon) ||
        Math.abs(l.lat) > 90 ||
        Math.abs(l.lon) > 180)
    )
      throw new Error("地點座標損壞");
    if (l.cache) validateCache(l.cache, l.id);
  }
  for (const [code, alias] of Object.entries(data.aliases))
    if (!/^[a-z0-9]+$/.test(code) || !validAlias(alias))
      throw new Error("簡稱備份損壞");
  if (data.session) {
    const s = data.session;
    if (
      !Number.isFinite(s.start) ||
      (s.stop !== null && (!Number.isFinite(s.stop) || s.stop < s.start)) ||
      !s.location ||
      !/^L\d+$/.test(s.location.id) ||
      !validAlias(s.location.alias) ||
      !s.counts ||
      typeof s.counts !== "object" ||
      Array.isArray(s.counts) ||
      typeof s.output !== "string" ||
      typeof s.query !== "string" ||
      typeof s.copied !== "boolean" ||
      typeof s.gpsEnabled !== "boolean" ||
      !Number.isFinite(s.distanceM) ||
      s.distanceM < 0 ||
      !Number.isInteger(s.gpsGaps) ||
      s.gpsGaps < 0
    )
      throw new Error("計數備份損壞");
    validateCache(
      {
        id: s.location.id,
        source: "public",
        updatedAt: new Date(s.start).toISOString(),
        species: s.species,
      },
      s.location.id,
    );
    const codes = new Set(s.species.map((x) => x.code));
    for (const [code, count] of Object.entries(s.counts))
      if (
        !codes.has(code) ||
        !count ||
        !Number.isSafeInteger(count.total) ||
        count.total < 0 ||
        !Number.isSafeInteger(count.heard) ||
        count.heard < 0 ||
        typeof count.note !== "string" ||
        count.note.length > 5000 ||
        !BREEDING.some(([value]) => value === count.breeding)
      )
        throw new Error("鳥種數量備份損壞");
    if (
      s.lastFix &&
      (![
        s.lastFix.lat,
        s.lastFix.lon,
        s.lastFix.accuracy,
        s.lastFix.time,
      ].every(Number.isFinite) ||
        Math.abs(s.lastFix.lat) > 90 ||
        Math.abs(s.lastFix.lon) > 180 ||
        s.lastFix.accuracy < 0)
    )
      throw new Error("GPS 備份損壞");
    if (s.lastGpsTime != null && !Number.isFinite(s.lastGpsTime))
      throw new Error("GPS 時間備份損壞");
  }
  return data;
}
export function saveState(storage, state) {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify(state, (key, value) =>
      key === "months" ? undefined : value,
    ),
  );
}

// Manual backups carry preferences only; automatic trip recovery remains separate.
export function settingsBackup(state) {
  return {
    type: "ebird-counter-settings",
    version: 1,
    locations: state.locations.map(({ id, alias, lat, lon }) => ({
      id,
      alias,
      lat,
      lon,
    })),
    aliases: structuredClone(state.aliases),
    profiles: structuredClone(state.profiles),
    activeProfile: "global",
  };
}
export function restoreSettings(state, text) {
  const raw = JSON.parse(text);
  if (
    !(raw.type === "ebird-counter-settings" && raw.version === 1) &&
    !([1, 2].includes(raw.version) && !raw.type)
  )
    throw new Error("不是計鳥設定備份");
  const checked = readState({
    getItem: () =>
      JSON.stringify({
        ...initialState(),
        version: 2,
        locations: raw.locations,
        aliases: raw.aliases,
        profiles: raw.profiles,
        activeProfile: raw.activeProfile || "global",
      }),
  });
  const next = {
    ...state,
    locations: checked.locations.map(({ id, alias, lat, lon }) => ({
      id,
      alias,
      lat,
      lon,
    })),
    aliases: checked.aliases,
    profiles: checked.profiles,
  };
  // Keep locally cached data for matching locations, never import trip/history data.
  for (const l of next.locations) {
    const old = state.locations.find((x) => x.id === l.id);
    if (old?.cache) l.cache = old.cache;
  }
  return next;
}
