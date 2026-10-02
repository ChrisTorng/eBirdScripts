import {
  catalog,
  distance,
  hasInformation,
  identityForName,
  matchesQuery,
  numericQuery,
} from "./core.mjs";

export const DEFAULT_THRESHOLDS = { common: 20, uncommon: 2 };
export const GROUP_TARGETS = { common: 15, uncommon: 30 };
export const GROUP_NAMES = {
  common: "常見",
  uncommon: "少見",
  rare: "罕見",
  none: "無紀錄",
  other: "其他分類",
};
export const BREEDING_OPTIONS = [
  ["", "", "繁殖", ""],
  ["唱歌", "S", "唱歌", "唱歌中鳥 Singing Bird"],
  ["求偶", "C", "求偶", "求偶、展示或交配 Courtship Display Copulation"],
  ["一對", "P", "一對", "一對 Pair"],
  ["適合的棲地", "H", "棲地", "適合的棲地 Appropriate Habitat"],
  ["領域防衛", "T", "領域", "領域防衛 Territorial Defense"],
  ["造訪可能的巢位", "N", "訪巢", "造訪可能的巢位 Visiting Probable Nest Site"],
  ["焦躁行為", "A", "焦躁", "焦躁行為 Agitated Behavior"],
  ["[B]", "B", "築巢", "築巢 Woodpecker Wren Nest Building"],
  ["生理證據", "PE", "生理", "生理證據 Physiological Evidence"],
  ["攜帶巢材", "CN", "巢材", "攜帶巢材 Carrying Nesting Material"],
  ["[NB]", "NB", "築巢", "築巢 Nest Building"],
  ["分散注意力展示", "DD", "誘敵", "分散注意力展示 Distraction Display"],
  ["使用過的巢", "UN", "舊巢", "使用過的巢 Used Nest"],
  ["剛離巢幼鳥", "FL", "離巢", "剛離巢幼鳥 Recently Fledged Young"],
  ["佔用巢位", "ON", "佔巢", "佔用巢位 Occupied Nest"],
  ["攜帶食物", "CF", "攜食", "攜帶食物 Carrying Food"],
  ["餵食幼鳥", "FY", "餵雛", "餵食幼鳥 Feeding Young"],
  ["巢中有蛋", "NE", "巢蛋", "巢中有蛋 Nest with Eggs"],
  ["巢中有幼鳥", "NY", "巢雛", "巢中有幼鳥 Nest with Young"],
];
const normalizedTaxonNames = new Map();
export const normalizeName = (value) => {
  const name = String(value).normalize("NFKC").replace(/台/g, "臺").replace(/\s/g, "");
  if (/^(?:野鴿(?:\((?:野化|馴化)\))?|原鴿)$/.test(name)) return "taxon:rocpig1";
  if (!normalizedTaxonNames.has(name)) {
    const identity = identityForName(name);
    normalizedTaxonNames.set(name, /^u[0-9a-f]+$/.test(identity.code) ? name : "taxon:" + identity.code);
  }
  return normalizedTaxonNames.get(name);
};
export function isOtherTaxon(s) {
  return (
    ["spuh", "slash", "hybrid", "intergrade", "domestic"].includes(
      s.category,
    ) || /(?:科|屬|類)$|[/／×]|\sx\s|雜交|未辨識|\bsp\./i.test(s.name)
  );
}
export function frequencyOf(s) {
  return Number.isFinite(s.annual) ? s.annual : null;
}
export function defaultGroup(s, thresholds = DEFAULT_THRESHOLDS) {
  if (isOtherTaxon(s)) return "other";
  const f = frequencyOf(s);
  return f === null || f === 0
    ? "none"
    : f >= thresholds.common
      ? "common"
      : f >= thresholds.uncommon
        ? "uncommon"
        : "rare";
}
export function suggestThresholds(species, targets = GROUP_TARGETS) {
  const values = species
    .filter((s) => !isOtherTaxon(s) && frequencyOf(s) > 0)
    .map(frequencyOf)
    .sort((a, b) => b - a);
  if (!values.length) return { ...DEFAULT_THRESHOLDS };
  // Only choose boundaries between distinct values, so equal frequencies stay
  // together. Prefer the smaller group when two sizes are equally close.
  const cuts = values.flatMap((value, i) => {
    if (i < values.length - 1 && values[i + 1] === value) return [];
    const rounded = Math.floor(value * 100) / 100;
    return [
      {
        count: i + 1,
        threshold: rounded > (values[i + 1] || 0) ? rounded : value,
      },
    ];
  });
  const nearest = (target) =>
    cuts.reduce((best, cut) =>
      Math.abs(cut.count - target) < Math.abs(best.count - target) ? cut : best,
    );
  const common = nearest(targets.common),
    uncommon = nearest(common.count + targets.uncommon);
  return {
    common: common.threshold,
    uncommon:
      uncommon.threshold < common.threshold
        ? uncommon.threshold
        : Math.max(Number.MIN_VALUE, common.threshold / 2),
  };
}
export function groupCounts(species, thresholds) {
  const counts = Object.fromEntries(
    Object.keys(GROUP_NAMES).map((id) => [id, 0]),
  );
  for (const s of species) counts[defaultGroup(s, thresholds)]++;
  return counts;
}
export function resetCollapsed(profile) {
  for (const g of profile.groups)
    g.collapsed = ["rare", "none", "other"].includes(g.id);
}
export function toggleAllCollapsed(profile) {
  const collapse = profile.groups.some((g) => !g.collapsed);
  for (const g of profile.groups)
    g.collapsed = collapse || !["common", "uncommon"].includes(g.id);
}
export function sharedSpecies(state, publicData) {
  const publicCache = state.frequency.public || publicData;
  const personal = state.frequency.personal;
  const base = publicCache?.species || catalog();
  const byCode = new Map(personal?.species.map((s) => [s.code, s]) || []);
  const byName = new Map(
    personal?.species.map((s) => [normalizeName(s.name), s]) || [],
  );
  const used = new Set();
  const merged = base.map((s) => {
    const own = byCode.get(s.code) || byName.get(normalizeName(s.name));
    if (own) used.add(own.code);
    return personal
      ? {
          ...s,
          annual: own?.annual ?? 0,
          months: own?.months || Array(12).fill(0),
        }
      : { ...s };
  });
  for (const s of personal?.species || [])
    if (!used.has(s.code) && !merged.some((x) => x.code === s.code))
      merged.push({ ...s });
  for (const s of catalog())
    if (
      !merged.some(
        (x) =>
          x.code === s.code || normalizeName(x.name) === normalizeName(s.name),
      )
    )
      merged.push({ ...s, annual: 0 });
  // Keep recorded rows even after changing the shared frequency source.
  for (const s of state.session?.species || [])
    if (!merged.some((x) => x.code === s.code))
      merged.push({ ...s, annual: 0 });
  return merged;
}
export function syncGroups(profile, species, rebuild = false) {
  const thresholds = (profile.thresholds ||= suggestThresholds(species));
  if (!profile.groups.length || rebuild)
    profile.groups = Object.entries(GROUP_NAMES).map(([id, name]) => ({
      id,
      name,
      collapsed: ["rare", "none", "other"].includes(id),
      codes: [],
    }));
  const available = new Set(species.map((s) => s.code));
  const seen = new Set();
  for (const group of profile.groups)
    group.codes = group.codes.filter((code) => {
      if (!available.has(code) || seen.has(code)) return false;
      seen.add(code);
      return true;
    });
  for (const s of species)
    if (!seen.has(s.code)) {
      const id = defaultGroup(s, thresholds);
      const target =
        profile.groups.find((g) => g.id === id) || profile.groups.at(-1);
      target.codes.push(s.code);
      seen.add(s.code);
    }
  if (rebuild || !profile.customized) {
    const byCode = new Map(species.map((s) => [s.code, s]));
    profile.groups
      .find((g) => g.id === "other")
      ?.codes.sort(
        (a, b) =>
          (frequencyOf(byCode.get(b) || {}) || 0) -
          (frequencyOf(byCode.get(a) || {}) || 0),
      );
  }
  if (rebuild) profile.customized = false;
  return profile.groups;
}
export function moveSpecies(profile, code, targetId, beforeCode = null) {
  const target = profile.groups.find((g) => g.id === targetId);
  if (!target) throw new Error("找不到目標區塊");
  if (beforeCode === code) return;
  for (const group of profile.groups)
    group.codes = group.codes.filter((c) => c !== code);
  const index = beforeCode ? target.codes.indexOf(beforeCode) : -1;
  if (index < 0) target.codes.push(code);
  else target.codes.splice(index, 0, code);
  profile.customized = true;
}
export function moveSpeciesAcross(profile, code, targetId) {
  const from = profile.groups.findIndex((g) => g.codes.includes(code)),
    to = profile.groups.findIndex((g) => g.id === targetId);
  if (from < 0 || to < 0) throw new Error("找不到鳥種或目標區塊");
  if (from === to) return;
  moveSpecies(
    profile,
    code,
    targetId,
    to > from ? profile.groups[to].codes[0] || null : null,
  );
}
export function moveGroup(profile, id, beforeId = null) {
  if (id === beforeId) return;
  const i = profile.groups.findIndex((g) => g.id === id);
  if (i < 0) return;
  const [group] = profile.groups.splice(i, 1),
    before = profile.groups.findIndex((g) => g.id === beforeId);
  profile.groups.splice(before < 0 ? profile.groups.length : before, 0, group);
  profile.customized = true;
}
export function deleteGroup(profile, id, targetId) {
  if (profile.groups.length === 1) throw new Error("至少保留一個區塊");
  const group = profile.groups.find((g) => g.id === id),
    target = profile.groups.find((g) => g.id === targetId);
  if (!group || !target || group === target)
    throw new Error("請選擇要接收鳥種的區塊");
  target.codes.push(...group.codes);
  profile.groups = profile.groups.filter((g) => g !== group);
  profile.customized = true;
}
export function orderedSpecies(profile, species) {
  const byCode = new Map(species.map((s) => [s.code, s]));
  return profile.groups.flatMap((g) =>
    g.codes.map((code) => byCode.get(code)).filter(Boolean),
  );
}
export function rowVisible(
  s,
  c,
  group,
  query,
  onlyRecorded,
  localAliases = {},
) {
  const number = numericQuery(query),
    pendingNumber = /^[+-]$/.test(query.trim());
  if (
    number === null &&
    !pendingNumber &&
    query.trim() &&
    !matchesQuery(s, query, localAliases)
  )
    return false;
  if (hasInformation(c)) return true;
  // A name search opens matches even inside collapsed groups.
  return (
    (!!query.trim() && number === null && !pendingNumber) || !group.collapsed
  );
}
export function nearestSaved(locations, point, radius = 500) {
  return (
    locations
      .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon))
      .map((l) => ({ ...l, meters: distance(point, l) }))
      .filter((l) => l.meters <= radius)
      .sort((a, b) => a.meters - b.meters)[0] || null
  );
}
export function nearbyMapURL(point) {
  const url = new URL("https://ebird.org/hotspots");
  if (point)
    url.search = new URLSearchParams({
      "env.minX": point.lon - 0.05,
      "env.minY": point.lat - 0.05,
      "env.maxX": point.lon + 0.05,
      "env.maxY": point.lat + 0.05,
      yr: "all",
      m: "",
    });
  return url.href;
}
export async function fetchNearby(point, key, fetcher = fetch) {
  if (!key?.trim())
    throw new Error("請先在設定填入 eBird API 金鑰，或開啟附近地圖");
  const url = new URL("https://api.ebird.org/v2/ref/hotspot/geo");
  url.search = new URLSearchParams({
    lat: point.lat.toFixed(5),
    lng: point.lon.toFixed(5),
    dist: "5",
    fmt: "json",
  });
  const response = await fetcher(url, {
    headers: { "X-eBirdApiToken": key.trim() },
    credentials: "omit",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`附近熱點讀取失敗 (${response.status})，可改用附近地圖`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("熱點資料格式錯誤");
  return data
    .filter(
      (x) =>
        /^L\d+$/.test(x.locId) &&
        Number.isFinite(x.lat) &&
        Number.isFinite(x.lng) &&
        typeof x.locName === "string",
    )
    .map((x) => ({
      id: x.locId,
      name: x.locName,
      lat: x.lat,
      lon: x.lng,
      meters: distance(point, { lat: x.lat, lon: x.lng }),
    }))
    .sort((a, b) => a.meters - b.meters);
}
