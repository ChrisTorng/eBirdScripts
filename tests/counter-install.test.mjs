import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as C from "../counter/core.mjs";
import * as O from "../counter/organization.mjs";
import historicalNames from "../counter/historical-names.mjs";
import { installBackNavigation } from "../counter/navigation.mjs";
import { parsePersonalCSV } from "../counter/personal.mjs";

const root = new URL("../", import.meta.url);
const ctx = {
  document: {
    readyState: "loading",
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
  },
};
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(new URL("EBirdTextInputAssistant.user.js", root), "utf8"),
  ctx,
);
const parse = ctx.__ebirdTextInputAssistant.parseObservationLine;
const scriptSource = fs.readFileSync(
  new URL("EBirdTextInputAssistant.user.js", root),
  "utf8",
);
test("all official taxonomy full names are accepted", () => {
  const names = JSON.parse(
    scriptSource.match(
      /const fullSpeciesNames = Object.freeze\((\{[\s\S]*?\})\);/,
    )[1],
  );
  assert.ok(Object.keys(names).length > 17000);
  for (const name of Object.keys(names)) {
    const result = parse(name + " 2 巢雛，1 聽到");
    assert.ok(!result.error, name + ": " + result.error);
    assert.equal(result.value.count, 2, name);
    assert.equal(result.value.breedingCode, "NY", name);
    assert.equal(result.value.requiresConfirmation, false, name);
  }
});

test("all 1044 public full names and historical types parse without aliases or confirmation", () => {
  const birds = JSON.parse(
    fs.readFileSync(new URL("counter/data/taiwan-index.json", root)),
  ).species;
  for (const s of [...birds, ...Object.values(historicalNames)]) {
    const result = parse(s.name + " 2 巢雛，1 聽到");
    assert.ok(!result.error, s.name + ": " + result.error);
    assert.equal(result.value.count, 2, s.name);
    assert.equal(result.value.breedingCode, "NY", s.name);
    assert.equal(result.value.requiresConfirmation, false, s.name);
  }
  for (const name of ["原鴿", "野鴿", "野鴿(馴化)", "野鴿(野化)"])
    assert.equal(parse(name + " 1").value.code, "rocpig1");
  assert.equal(parse("大白 1").value.code, parse("大白鷺 1").value.code);
  assert.equal(
    parse("灰頭紅尾伯勞 1").value.code,
    parse("紅尾伯勞(灰頭) 1").value.code,
  );
});

test("every breeding selection exports a Chinese short label and round trips its exact code", () => {
  const session = C.createSession(C.DEFAULT_LOCATIONS[0], 1000, false, 1000, [
    { code: "unknown", name: "花嘴鴨" },
  ]);
  C.increment(session, "unknown", "total", 2);
  for (const [value, code] of O.BREEDING_OPTIONS.slice(1)) {
    session.counts.unknown.breeding = value;
    const output = C.exportText(session);
    assert.equal(output.unmapped.length, 0);
    const line = output.text.split("\n").at(-1);
    assert.match(line, /^花嘴 2，/);
    assert.ok(!line.includes("["));
    assert.equal(parse(line).value.breedingCode, code, line);
    assert.equal(parse(line).value.requiresConfirmation, false, line);
  }
});

test("settings backup omits trips, frequency caches and API keys; restore preserves local trip and annual data", () => {
  const state = C.initialState();
  state.session = C.createSession(state.locations[0], 1000, true, 1000);
  state.session.distanceM = 12;
  C.increment(state.session, "eutspa", "total", 3);
  state.frequency.personal = { privateData: true };
  state.apiKey = "secret";
  state.locations[0].cache = { privateData: true };
  O.syncGroups(state.profiles.global, [
    { code: "eutspa", name: "麻雀", annual: 90 },
  ]);
  const exported = C.settingsBackup(state);
  assert.ok(!JSON.stringify(exported).includes("privateData"));
  assert.ok(!JSON.stringify(exported).includes("secret"));
  assert.equal(exported.session, undefined);
  exported.locations[0].alias = "新名字";
  const restored = C.restoreSettings(state, JSON.stringify(exported));
  assert.equal(restored.locations[0].alias, "新名字");
  assert.strictEqual(restored.session, state.session);
  assert.strictEqual(restored.frequency, state.frequency);
  assert.deepEqual(restored.profiles, exported.profiles);
  assert.throws(() => C.restoreSettings(state, '{"type":"other","version":1}'));
  const corrupt = structuredClone(exported);
  corrupt.profiles.global.groups[0].codes.push("eutspa");
  assert.throws(() => C.restoreSettings(state, JSON.stringify(corrupt)));
});

test("automatic recovery retains annual values/counts but does not persist monthly frequencies", () => {
  const state = C.initialState();
  const bird = {
    code: "eutspa",
    name: "麻雀",
    annual: 42,
    months: Array(12).fill(50),
  };
  state.session = C.createSession(state.locations[0], 1000, false, 1000, [
    bird,
  ]);
  state.frequency.personal = {
    id: "TW",
    source: "personal",
    updatedAt: new Date().toISOString(),
    species: [bird],
  };
  C.increment(state.session, "eutspa", "heard", 2);
  let raw;
  const storage = {
    getItem: () => raw,
    setItem: (key, value) => {
      raw = value;
    },
  };
  C.saveState(storage, state);
  assert.ok(!raw.includes("months"));
  const restored = C.readState(storage);
  assert.equal(restored.frequency.personal.species[0].annual, 42);
  assert.equal(restored.session.counts.eutspa.total, 2);
  assert.equal(restored.session.counts.eutspa.heard, 2);
});

test("totals toggles all collapsed then only common/uncommon; recorded rows survive", () => {
  const p = { groups: [], customized: false };
  O.syncGroups(p, [{ code: "a", name: "鳥", annual: 60 }]);
  O.toggleAllCollapsed(p);
  assert.ok(p.groups.every((g) => g.collapsed));
  assert.ok(
    O.rowVisible(
      { code: "a", name: "鳥" },
      { total: 1 },
      p.groups[0],
      "",
      false,
    ),
  );
  O.toggleAllCollapsed(p);
  assert.deepEqual(
    p.groups.map((g) => g.collapsed),
    [false, false, true, true, true],
  );
});

test("historical subspecies remain distinct and pigeon names match the public parent", () => {
  const csv =
    "Submission ID,Common Name,Date,All Obs Reported\nS1,紅尾伯勞(灰頭),2026-01-01,1\nS1,紅尾伯勞(褐頭),2026-01-01,1\nS1,野鴿(野化),2026-01-01,1";
  const cache = parsePersonalCSV(csv, [{ name: "原鴿", code: "pigeon" }]).cache;
  assert.deepEqual(
    cache.species.map((s) => s.code),
    ["brnshr3", "brnshr1", "pigeon"],
  );
  assert.equal(C.identityForName("白頭翁(formosae/orii)").code, "livbul4");
});

test("PWA manifest icons have real PNG dimensions, stable scope, and all shell assets exist", () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL("counter/manifest.webmanifest", root)),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.id, "./");
  for (const icon of manifest.icons) {
    const data = fs.readFileSync(new URL("counter/" + icon.src, root));
    assert.equal(data.subarray(1, 4).toString(), "PNG");
    assert.equal(
      `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`,
      icon.sizes,
    );
  }
  const context = { self: { addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(new URL("counter/sw.js", root), "utf8") +
      "\nglobalThis.files=FILES;",
    context,
  );
  for (const file of context.files)
    assert.ok(fs.existsSync(new URL("counter/" + file, root)), file);
});

test("Back closes UI first; exit can be cancelled/confirmed; reload adds no duplicate guard", async () => {
  const calls = [],
    events = {};
  const win = {
    history: {
      state: null,
      replaceState(s) {
        this.state = s;
        calls.push("replace");
      },
      pushState(s) {
        this.state = s;
        calls.push("push");
      },
      back() {
        calls.push("back");
      },
      go(n) {
        calls.push(n);
      },
    },
    addEventListener(name, fn) {
      events[name] = fn;
    },
  };
  let modal = true,
    confirmed = false;
  const handlers = {
    dismiss() {
      if (modal) {
        modal = false;
        return true;
      }
      return false;
    },
    active: () => true,
    confirmLeave: async () => confirmed,
    save: () => calls.push("save"),
  };
  installBackNavigation(win, handlers);
  assert.deepEqual(calls, ["replace", "push"]);
  calls.length = 0;
  installBackNavigation(win, handlers);
  assert.deepEqual(calls, []);
  await events.popstate();
  assert.deepEqual(calls, ["push"]);
  calls.length = 0;
  await events.popstate();
  assert.deepEqual(calls, ["push"]);
  confirmed = true;
  calls.length = 0;
  await events.popstate();
  assert.deepEqual(calls, ["push", "save", -2]);
});


test("exports shortest compatible names and keeps full names only when no alias exists", () => {
  const birds = JSON.parse(fs.readFileSync(new URL("counter/data/taiwan-index.json", root))).species;
  const session = C.createSession(C.DEFAULT_LOCATIONS[0], 1000, false, 1000, birds);
  for (const s of birds) C.increment(session, s.code, "total", 2);
  const lines = C.exportText(session).text.split("\n").slice(3);
  for (const [i, s] of birds.entries()) {
    const name = C.compatibleAlias(s) || s.name;
    assert.equal(lines[i], name + " 2");
    const parsed = parse(lines[i]);
    assert.ok(!parsed.error, lines[i]);
    assert.ok((parsed.value.codes || [parsed.value.code]).includes(s.code)
      || parsed.value.code === parse(s.name + " 2").value.code, s.name);
  }
  for (const code of ["rocpig", "rocpig1"]) {
    const pigeon = { code, name: "原鴿" };
    assert.equal(C.displayAlias(pigeon), "野鴿");
    session.species = [pigeon];
    session.counts = {};
    C.increment(session, code, "total", 6);
    assert.equal(C.exportText(session).text.split("\n").at(-1), "野鴿 6");
  }
  for (const name of ["野鴿", "原鴿", "野鴿(馴化)", "野鴿(野化)"]) {
    assert.equal(parse(name + " 6").value.name, "野鴿");
  }
});
