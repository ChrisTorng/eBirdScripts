import { identityForName, validateCache } from "./core.mjs";
import { normalizeName } from "./organization.mjs";

// The official export is a ZIP containing MyEBirdData.csv. Read it entirely
// locally; no library, service, or upload is needed. ZIP64/encrypted archives
// deliberately fall back to letting the user unzip and select the CSV.
export async function readPersonalFile(file) {
  if (!/\.zip$/i.test(file.name)) return file.text();
  const bytes = new Uint8Array(await file.arrayBuffer()),
    view = new DataView(bytes.buffer);
  const error = () =>
    new Error("ZIP 無法讀取，請先解壓縮，再匯入 MyEBirdData.csv");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    throw error();
  let offset = view.getUint32(end + 16, true),
    entry = null;
  const count = view.getUint16(end + 10, true);
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw error();
    const length = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true);
    if (offset + 46 + length + extra + comment > end) throw error();
    const name = new TextDecoder().decode(
      bytes.subarray(offset + 46, offset + 46 + length),
    );
    if (/\.csv$/i.test(name) && !name.startsWith("__MACOSX/")) {
      if (entry)
        throw new Error("ZIP 有多個 CSV，請解壓縮後選擇 MyEBirdData.csv");
      entry = {
        flags: view.getUint16(offset + 8, true),
        method: view.getUint16(offset + 10, true),
        crc: view.getUint32(offset + 16, true),
        compressed: view.getUint32(offset + 20, true),
        size: view.getUint32(offset + 24, true),
        local: view.getUint32(offset + 42, true),
      };
    }
    offset += 46 + length + extra + comment;
  }
  if (
    !entry ||
    entry.flags & 1 ||
    entry.size > 100_000_000 ||
    entry.local + 30 > bytes.length
  )
    throw error();
  const local = entry.local;
  if (view.getUint32(local, true) !== 0x04034b50) throw error();
  const start =
    local +
    30 +
    view.getUint16(local + 26, true) +
    view.getUint16(local + 28, true);
  if (start + entry.compressed > bytes.length) throw error();
  let result = bytes.subarray(start, start + entry.compressed);
  if (entry.method === 8) {
    let stream;
    try {
      stream = new Blob([result])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
    } catch {
      throw error();
    }
    const reader = stream.getReader(),
      chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > entry.size || size > 100_000_000) {
        await reader.cancel();
        throw error();
      }
      chunks.push(value);
    }
    result = new Uint8Array(size);
    let cursor = 0;
    for (const chunk of chunks) {
      result.set(chunk, cursor);
      cursor += chunk.length;
    }
  } else if (entry.method !== 0) throw error();
  if (result.length !== entry.size) throw error();
  let crc = 0xffffffff;
  for (const byte of result) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  if (~crc >>> 0 !== entry.crc)
    throw new Error("ZIP 檢查碼錯誤，請重新下載個人紀錄");
  return new TextDecoder("utf-8", { fatal: true }).decode(result);
}

// RFC 4180 quoting, commas and multiline observation comments.
export function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else throw new Error("CSV 引號格式錯誤");
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV 引號未結束");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function parsePersonalCSV(text, publicSpecies = []) {
  const [header, ...rows] = parseCSV(text);
  if (!header) throw new Error("CSV 是空的");
  const col = (name) =>
    header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const idIndex = col("Submission ID"),
    nameIndex = col("Common Name"),
    dateIndex = col("Date"),
    completeIndex = col("All Obs Reported");
  if ([idIndex, nameIndex, dateIndex, completeIndex].some((i) => i < 0))
    throw new Error(
      "請使用 Download My Data 的完整 CSV（Submission ID、Common Name、Date、All Obs Reported）",
    );
  const checklists = new Map(),
    birds = new Map(),
    names = new Map(publicSpecies.map((s) => [normalizeName(s.name), s]));
  const orderIndex = col("Taxonomic Order"),
    latIndex = col("Latitude"),
    lonIndex = col("Longitude"),
    locationIndex = col("Location ID"),
    countIndex = col("Count");
  const locations = new Map();
  for (const row of rows) {
    // eBird omits empty optional trailing fields (verified in MyEBirdData.csv).
    if (
      row.length > header.length ||
      row.length <= Math.max(idIndex, nameIndex, dateIndex, completeIndex)
    )
      throw new Error("CSV 必要欄位缺漏");
    while (row.length < header.length) row.push("");
    const id = row[idIndex].trim(),
      name = row[nameIndex].trim();
    const complete = /^(1|true|yes)$/i.test(row[completeIndex].trim());
    if (!complete) continue;
    const date = row[dateIndex].trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (
      !id ||
      !name ||
      !date ||
      Number(date[2]) < 1 ||
      Number(date[2]) > 12 ||
      Number(date[3]) < 1 ||
      Number(date[3]) > 31
    )
      throw new Error("CSV 日期或鳥單資料不完整，日期需 YYYY-MM-DD");
    const month = Number(date[2]) - 1;
    if (checklists.has(id) && checklists.get(id) !== month)
      throw new Error("同一鳥單的日期不一致");
    checklists.set(id, month);
    if (countIndex >= 0 && row[countIndex].trim() === "0") continue;
    let bird = birds.get(name);
    if (!bird) {
      bird = {
        name,
        ids: new Set(),
        order: orderIndex >= 0 ? Number(row[orderIndex]) : birds.size,
      };
      birds.set(name, bird);
    }
    bird.ids.add(id);
    if (
      locationIndex >= 0 &&
      latIndex >= 0 &&
      lonIndex >= 0 &&
      /^L\d+$/.test(row[locationIndex]) &&
      row[latIndex].trim() &&
      row[lonIndex].trim()
    ) {
      const lat = Number(row[latIndex]),
        lon = Number(row[lonIndex]);
      if (
        Number.isFinite(lat) &&
        Math.abs(lat) <= 90 &&
        Number.isFinite(lon) &&
        Math.abs(lon) <= 180
      )
        locations.set(row[locationIndex], { id: row[locationIndex], lat, lon });
    }
  }
  if (!checklists.size) throw new Error("檔案沒有完整鳥單，無法計算頻率");
  const samples = Array(12).fill(0);
  for (const m of checklists.values()) samples[m]++;
  let unmatched = 0;
  const unmatchedNames = [];
  const mappedNames = [];
  const resolved = new Map();
  const include = (identity, ids) => {
    const previous = resolved.get(identity.code);
    if (previous) for (const id of ids) previous.ids.add(id);
    else resolved.set(identity.code, {
      code: identity.code, name: identity.name, ids: new Set(ids),
    });
  };
  for (const bird of [...birds.values()].sort((a, b) => a.order - b.order)) {
    const known = names.get(normalizeName(bird.name));
    const original = identityForName(bird.name);
    const identity = known || original;
    const parent = original.frequencyParent
      && names.get(normalizeName(original.frequencyParent.name));
    if (!known && !parent && !resolved.has(identity.code)) {
      unmatched++;
      unmatchedNames.push(bird.name);
    }
    // Keep each taxon's own frequency and union IDs for confirmed parent totals.
    // Frequency aggregation never changes the taxon used for input/export.
    include(identity, bird.ids);
    if (parent && parent.code !== identity.code) {
      include(parent, bird.ids);
      mappedNames.push(bird.name);
    }
  }
  const species = [...resolved.values()].map((bird) => {
    const counts = Array(12).fill(0);
    for (const id of bird.ids) counts[checklists.get(id)]++;
    return {
      code: bird.code,
      name: bird.name,
      annual: (bird.ids.size / checklists.size) * 100,
      months: counts.map((n, m) =>
        samples[m] ? (n / samples[m]) * 100 : null,
      ),
    };
  });
  const cache = validateCache(
    {
      id: "TW",
      source: "personal",
      updatedAt: new Date().toISOString(),
      transport: "my-data-csv",
      species,
      sampleSize: checklists.size,
      unmatched,
      unmatchedNames,
      mappedNames,
      frequencyAggregationVersion: 1,
    },
    "TW",
  );
  return { cache, locations: [...locations.values()] };
}
