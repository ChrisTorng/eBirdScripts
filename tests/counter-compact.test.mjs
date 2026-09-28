import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { deflateRawSync } from "node:zlib";
import * as C from "../counter/core.mjs";
import * as O from "../counter/organization.mjs";
import {
  parseCSV,
  parsePersonalCSV,
  readPersonalFile,
} from "../counter/personal.mjs";

const bird = (code, annual, name = code) => ({
  code,
  name,
  annual,
  months: Array(12).fill(annual),
});
const state = () => {
  const s = C.initialState();
  s.session = C.createSession(s.locations[0], 1000, false, 1000);
  return s;
};
const restore = (s) => C.readState({ getItem: () => JSON.stringify(s) });
const header =
  "Submission ID,Common Name,Date,All Obs Reported,Taxonomic Order,Count,Observation Details";

test("heard increments total, correction keeps total, signed amounts clamp at zero", () => {
  const s = state().session;
  C.increment(s, "eutspa", "heard", 3);
  C.increment(s, "eutspa", "heard", -1);
  assert.deepEqual(s.counts.eutspa, {
    total: 3,
    heard: 2,
    breeding: "",
    note: "",
  });
  C.increment(s, "eutspa", "total", -2);
  assert.match(C.recordErrors(s.counts.eutspa)[0], /少於/);
  s.counts.eutspa.breeding = "一對";
  assert.ok(C.recordErrors(s.counts.eutspa).some((x) => x.includes("2")));
  C.increment(s, "eutspa", "total", -99);
  assert.equal(s.counts.eutspa.total, 0);
  assert.throws(() =>
    C.increment(s, "eutspa", "heard", Number.MAX_SAFE_INTEGER),
  );
  for (const [query, expected] of [
    ["-3", -3],
    ["＋１２", 12],
    ["−5", -5],
    ["12", 12],
    ["-", null],
    ["麻雀", null],
    ["1.2", null],
  ])
    assert.equal(C.numericQuery(query), expected);
  assert.deepEqual(
    [0, 59999, 3599999, 3600000, 3661000].map(C.formatDuration),
    ["00:00", "00:59", "59:59", "1:00:00", "1:01:01"],
  );
});

test("version 1 recovery migrates seen + heard exactly once, preserving session output and GPS", () => {
  const old = state();
  old.version = 1;
  delete old.profiles;
  delete old.frequency;
  old.session.counts.eutspa = { seen: 3, heard: 2, breeding: "唱歌" };
  old.session.output = "edited";
  old.session.distanceM = 123;
  const next = restore(old);
  assert.equal(next.session.counts.eutspa.total, 5);
  assert.equal(next.session.counts.eutspa.heard, 2);
  assert.equal(next.session.output, "edited");
  assert.equal(next.session.distanceM, 123);
  assert.deepEqual(restore(next), next);
  const invalid = state();
  invalid.profiles.global.thresholds = { common: 2, uncommon: 20 };
  assert.throws(() => restore(invalid));
});

test("free descriptions survive real assistant parsing without becoming counts or breeding", () => {
  const context = {
    document: {
      readyState: "loading",
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(
      new URL("../EBirdTextInputAssistant.user.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  const parser = context.__ebirdTextInputAssistant.parseObservationLine,
    s = state().session;
  C.increment(s, "eutspa", "heard", 2);
  s.counts.eutspa.note = '唱歌 99，求偶，聽到 500；描述 "引號"\n第二行 🐦';
  s.counts.eutspa.breeding = "[NB]";
  const line = C.exportText(s).text.split("\n").at(-1),
    parsed = parser(line);
  assert.ok(!parsed.error);
  assert.equal(parsed.value.count, 2);
  assert.equal(parsed.value.breedingCode, "NB");
  assert.equal(parsed.value.comments, "Heard 2, " + s.counts.eutspa.note);
  assert.ok(parser('麻雀 1；描述 "破損').error);
  s.counts.eutspa.breeding = "";
  s.counts.eutspa.heard = 0;
  const plain = parser(C.exportText(s).text.split("\n").at(-1));
  assert.equal(plain.value.breedingCode, null);
  assert.equal(plain.value.comments, s.counts.eutspa.note);
  for (const [value, code] of O.BREEDING_OPTIONS.slice(1))
    assert.equal(parser(`麻雀 2 ${value}`).value.breedingCode, code, value);
});

test("CSV uses unique complete checklists, quoted comments, optional tails, zero and X counts", () => {
  const csv =
    header +
    '\r\nS1,麻雀,2025-01-01,1,2,3,"句子,與\r\n換行"\r\nS1,麻雀,2025-01-01,1,2,3\r\nS1,珠頸斑鳩,2025-01-01,1,1,X\r\nS2,麻雀,2025-02-01,1,2,1\r\nS3,珠頸斑鳩,2025-02-02,0,1,10\r\nS4,麻雀,2025-02-03,1,2,0';
  assert.equal(parseCSV(csv)[1][6], "句子,與\r\n換行");
  const { cache } = parsePersonalCSV(csv);
  assert.equal(cache.sampleSize, 3);
  const sparrow = cache.species.find((s) => s.code === "eutspa"),
    dove = cache.species.find((s) => s.code === "spodov");
  assert.equal(sparrow.annual, (2 / 3) * 100);
  assert.equal(sparrow.months[1], 50);
  assert.equal(sparrow.months[2], null);
  assert.equal(dove.annual, (1 / 3) * 100);
  assert.equal(cache.species[0].code, "spodov");
  assert.throws(
    () => parsePersonalCSV(header + "\nS1,麻雀,2025-01-01,0,1,1"),
    /完整鳥單/,
  );
  assert.throws(() => parsePersonalCSV("wrong,headers\n1,2"));
});

test("CSV merges historical names by checklist union and keeps known subspecies distinct", () => {
  const { cache } = parsePersonalCSV(
    header +
      "\nS1,野鴿,2025-01-01,1,1,1\nS1,野鴿(野化),2025-01-01,1,1,1\nS2,野鴿(野化),2025-02-01,1,1,1\nS2,紅尾伯勞(褐頭),2025-02-01,1,2,1\nS2,紅尾伯勞(灰頭),2025-02-01,1,3,1",
  );
  assert.equal(cache.species.length, 3);
  assert.equal(cache.species.find((s) => s.code === "rocpig1").annual, 100);
  assert.ok(cache.species.some((s) => s.code === "brnshr1"));
  assert.ok(cache.species.some((s) => s.code === "brnshr3"));
});

function zipFixture(text, deflate = true) {
  const content = Buffer.from(text),
    name = Buffer.from("MyEBirdData.csv"),
    packed = deflate ? deflateRawSync(content) : content;
  let crc = 0xffffffff;
  for (const n of content) {
    crc ^= n;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crc = ~crc >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(deflate ? 8 : 0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(deflate ? 8 : 0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + packed.length, 16);
  return Buffer.concat([local, name, packed, central, name, end]);
}
test("ZIP importer supports official deflate and stored CSV and rejects corrupt archives", async () => {
  const csv = header + "\nS1,麻雀,2025-01-01,1,1,1";
  for (const deflate of [true, false])
    assert.equal(
      await readPersonalFile(new File([zipFixture(csv, deflate)], "data.zip")),
      csv,
    );
  assert.equal(await readPersonalFile(new File([csv], "data.csv")), csv);
  const invalid = zipFixture(csv, false);
  invalid[30 + "MyEBirdData.csv".length] ^= 1;
  await assert.rejects(
    readPersonalFile(new File([invalid], "data.zip")),
    /檢查碼/,
  );
  await assert.rejects(
    readPersonalFile(new File(["not zip"], "data.zip")),
    /解壓縮/,
  );
});

test("automatic threshold selection targets 15 plus 30, keeping equal values together", () => {
  const species = Array.from({ length: 100 }, (_, i) => bird("b" + i, 100 - i));
  assert.deepEqual(O.groupCounts(species, O.suggestThresholds(species)), {
    common: 15,
    uncommon: 30,
    rare: 55,
    none: 0,
    other: 0,
  });
  const ties = [...species.slice(0, 14), bird("same1", 86), bird("same2", 86)];
  assert.equal(O.groupCounts(ties, O.suggestThresholds(ties)).common, 14);
  assert.deepEqual(
    O.suggestThresholds([bird("zero", 0)]),
    O.DEFAULT_THRESHOLDS,
  );
  const manual = O.groupCounts(
    [
      bird("a", 20),
      bird("b", 2),
      bird("c", 1),
      bird("d", 0),
      bird("e", 90, "鳩鴿科"),
    ],
    { common: 20, uncommon: 2 },
  );
  assert.deepEqual(manual, {
    common: 1,
    uncommon: 1,
    rare: 1,
    none: 1,
    other: 1,
  });
});

test("groups default closed except common and uncommon; other taxa frequency order has stable ties", () => {
  const s = [
    bird("a", 0, "鳩鴿科"),
    bird("b", 2, "八哥屬"),
    bird("c", 2, "雁鴨類"),
    bird("d", 0, "鷗科"),
    bird("e", 90),
  ];
  const p = { groups: [], customized: false };
  O.syncGroups(p, s);
  assert.deepEqual(
    p.groups.map((g) => g.collapsed),
    [false, false, true, true, true],
  );
  assert.deepEqual(p.groups.at(-1).codes, ["b", "c", "a", "d"]);
  O.toggleAllCollapsed(p);
  assert.ok(p.groups.every((g) => g.collapsed));
  p.groups[1].collapsed = false;
  assert.ok(O.rowVisible(bird("a", 10), null, p.groups[1], "", true)); // individual expand wins; no separate filter
  assert.ok(
    O.rowVisible(bird("a", 10), { note: "已有描述" }, p.groups[2], "", false),
  );
  assert.ok(
    !O.rowVisible(
      bird("a", 10),
      { note: "已有描述" },
      p.groups[2],
      "麻雀",
      false,
    ),
  );
  assert.ok(
    O.rowVisible(bird("a", 10, "麻雀"), null, p.groups[2], "雀", false),
  );
  assert.ok(!O.rowVisible(bird("a", 10), null, p.groups[2], "-5", false));
});

test("cross-group moves use direction, drag keeps exact insertion, delete preserves every species", () => {
  const p = {
    groups: [
      { id: "high", name: "高", collapsed: false, codes: ["a", "b"] },
      { id: "low", name: "低", collapsed: false, codes: ["c", "d"] },
    ],
  };
  O.moveSpeciesAcross(p, "a", "low");
  assert.deepEqual(p.groups[1].codes, ["a", "c", "d"]);
  O.moveSpeciesAcross(p, "c", "high");
  assert.deepEqual(p.groups[0].codes, ["b", "c"]);
  O.moveSpecies(p, "b", "low", "d");
  assert.deepEqual(p.groups[1].codes, ["a", "b", "d"]);
  O.deleteGroup(p, "low", "high");
  assert.deepEqual(p.groups[0].codes, ["c", "a", "b", "d"]);
  assert.throws(() => O.deleteGroup(p, "high", "high"));
});

test("nearest location uses a 500m cutoff and never defaults to distant saved locations", async () => {
  const point = { lat: 25, lon: 121 },
    locations = [
      { id: "L1", lat: 25.001, lon: 121 },
      { id: "L2", lat: 25.01, lon: 121 },
    ];
  assert.equal(O.nearestSaved(locations, point).id, "L1");
  assert.equal(O.nearestSaved(locations.slice(1), point), null);
  await assert.rejects(() => O.fetchNearby(point, ""), /金鑰/);
  const nearby = await O.fetchNearby(point, "test", async (url, opts) => {
    assert.equal(opts.headers["X-eBirdApiToken"], "test");
    assert.equal(url.hostname, "api.ebird.org");
    return {
      ok: true,
      json: async () => [
        { locId: "L2", locName: "遠", lat: 25.01, lng: 121 },
        { locId: "L1", locName: "近", lat: 25.001, lng: 121 },
      ],
    };
  });
  assert.equal(nearby[0].id, "L1");
});

test("public startup index has no monthly payload or personal rows, and retained recordings survive source changes", () => {
  const index = JSON.parse(
    fs.readFileSync(
      new URL("../counter/data/taiwan-index.json", import.meta.url),
    ),
  );
  assert.equal(index.source, "public");
  assert.ok(index.species.every((s) => !("months" in s)));
  const s = C.initialState();
  s.frequency.personal = { species: [bird("privatebird", 10, "自有鳥種")] };
  const merged = O.sharedSpecies(s, { species: [bird("publicbird", 20)] });
  assert.equal(merged.find((x) => x.code === "publicbird").annual, 0);
  assert.ok(merged.some((x) => x.code === "privatebird"));
  s.session = { species: [bird("recordedbird", 5)] };
  assert.ok(O.sharedSpecies(s, index).some((x) => x.code === "recordedbird"));
});

test("whole record normalization preserves literal entities inside encoded descriptions", () => {
  const context = {
    document: {
      readyState: "loading",
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(
      new URL("../EBirdTextInputAssistant.user.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  const note = "文字 &nbsp; &#32; 不換掉\u00a0這裡";
  const record = context.__ebirdTextInputAssistant.parseRecord(
    "2026/9/28\n測試\n08:30 開始 10 分鐘\n麻雀 2；描述 " + JSON.stringify(note),
    new Date(2026, 8, 28),
    {
      測試: {
        locId: "L1",
        pageName: "測試",
        protocol: "P21",
        distanceKm: 0,
        partySize: 1,
      },
    },
  );
  assert.equal(record.observations[0].comments, note);
});
