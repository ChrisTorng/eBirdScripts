import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DOMParser } from 'linkedom';
import * as c from '../counter/core.mjs';
const context = { document: { readyState: 'loading', addEventListener() {}, querySelectorAll() { return []; } } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../EBirdTextInputAssistant.user.js', import.meta.url), 'utf8'), context);
const assistant = context.__ebirdTextInputAssistant;
const bundled = JSON.parse(fs.readFileSync(new URL('../counter/data/locations.json', import.meta.url)));

test('location input accepts single eBird IDs and URLs, rejects unsafe / multiple locations', () => {
  for (const value of ['L16381971', 'l16381971', 'https://ebird.org/barchart?r=L16381971&personal=true', '/barchart?r=L16381971', 'ebird.org/barchart?r=L16381971']) assert.equal(c.parseLocation(value), 'L16381971');
  for (const value of ['https://evil.test/barchart?r=L1', 'https://ebird.org.evil.test/barchart?r=L1', 'L1,L2', 'https://ebird.org/hotspot/L1', '']) assert.throws(() => c.parseLocation(value));
});
test('official supplied histogram caches contain all taxa and known weighted monthly frequencies', () => {
  assert.deepEqual(bundled.map(x => [x.id, x.species.length]), [['L16381971', 67], ['L18412499', 63], ['L17621411', 18]]);
  for (const cache of bundled) c.validateCache(cache, cache.id);
  const park = bundled[0];
  assert.ok(Math.abs(park.species.find(s => s.name === '花嘴鴨').months[0] - 100 / 42) < 0.00001);
  assert.ok(Math.abs(park.species.find(s => s.name === '珠頸斑鳩').months[8] - 83 / 87 * 100) < 0.00001);
  assert.ok(park.species.some(s => s.name === '鳩鴿科' && !c.compatibleAlias(s)));
});
function histogram(values = Array(48).fill(0.5), samples = Array(48).fill(10)) {
  return ['Frequency of observations in the selected location(s).:', 'Number of taxa: \t1',
    '\t' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => m + '\t\t\t').join('\t') + '\t',
    'Sample Size:\t' + samples.join('\t') + '\t', '麻雀\t' + values.join('\t') + '\t'].join('\n');
}
test('TXT parser weights by checklist samples and rejects malformed imports without guessing', () => {
  const weights = Array(48).fill(0); weights[0] = 1; weights[1] = 9;
  const values = Array(48).fill(0); values[0] = 1;
  const data = c.parseHistogram(histogram(values, weights), 'L1');
  assert.equal(data.species[0].months[0], 10); assert.equal(data.species[0].months[1], null);
  assert.equal(data.species[0].code, 'eutspa');
  assert.throws(() => c.parseHistogram(histogram().replace('Jan', 'May'), 'L1'));
  assert.throws(() => c.parseHistogram(histogram(Array(48).fill(1.2)), 'L1'));
  assert.throws(() => c.parseHistogram(histogram().replace('taxa: \t1', 'taxa: \t2'), 'L1'));
});

// Reduced DOM taken from the live public page on 2026-09-27. Account markup omitted.
function graph(personal = false, includeGraph = true) {
  const raw = { lineGraphs: [{ type: 'freq', series: [{ seriesName: '花嘴鴨', values: { 1: 8.333333333333332 }, values_N: { 1: 12, 2: 11, 3: 4, 4: 15 } }] }], xLabels: Array.from({ length: 48 }, (_, i) => `${Math.floor(i / 4) + 1}/${[1, 8, 15, 22][i % 4]}`) };
  return `<html><body><div id="barchart-display"><table><tr><td class="SpeciesName">花嘴鴨</td><td><a title="Map" href="/map/spbduc">Map</a></td></tr></table><a href="/barchartData?r=L1&bmo=1&emo=12${personal ? '&personal=true' : ''}">Download Histogram Data</a></div>${includeGraph ? `<script>var lgRaw = ${JSON.stringify(raw)}, numWeeks = lgRaw.xLabels.length;</script>` : ''}</body></html>`;
}
test('observed lgRaw JSON parser uses weights and reports missing months separately from zero', () => {
  const data = c.parseChartHTML(graph(), 'L1', 'public', DOMParser);
  assert.ok(Math.abs(data.species[0].months[0] - 100 / 42) < 1e-8);
  assert.equal(data.species[0].months[1], null);
  assert.deepEqual(c.parseChartHTML(graph(false, false), 'L1', 'public', DOMParser).codes, ['spbduc']);
  assert.throws(() => c.parseChartHTML(graph(), 'L2', 'public', DOMParser));
  assert.throws(() => c.parseChartHTML(graph(), 'L1', 'personal', DOMParser));
  assert.throws(() => c.parseChartHTML('<title>Sign in</title>', 'L1', 'public', DOMParser));
});
test('personal failures fall back to actual public source with correct credentials, and use embedded graph', async () => {
  const calls = [];
  const result = await c.fetchChart('L1', async (url, options) => {
    calls.push([url, options.credentials]);
    if (url.includes('personal=true')) throw new Error('CORS');
    return { ok: true, url, text: async () => graph(false, url.includes('spp=')) };
  }, DOMParser);
  assert.equal(result.source, 'public'); assert.match(result.fallbackReason, /CORS/);
  assert.deepEqual(calls.map(x => x[1]), ['include', 'omit', 'omit']);
  assert.match(calls[2][0], /spp=spbduc/);
  await assert.rejects(() => c.fetchChart('L1', async () => { throw new Error('offline'); }, DOMParser), /無法直接讀取/);
});
test('frequency bands preserve original order without a non-transitive fuzzy comparator', () => {
  const species = [98.5, 97, 100, null, 0].map((n, i) => ({ code: String(i), months: Array(12).fill(n) }));
  assert.deepEqual(c.sortSpecies(species, 0, 2).map(s => s.code), ['0', '2', '1', '4', '3']);
  assert.deepEqual(c.sortSpecies(species, 0, 0).map(s => s.code), ['2', '0', '1', '4', '3']);
});
test('counter output is parsed by the real assistant including heard-only and breeding data', () => {
  const session = c.createSession({ id: 'L1', alias: '測試地點', cache: bundled[0] }, Date.now() - 600000, false);
  c.increment(session, 'spodov', 'seen', 5); c.increment(session, 'spodov', 'heard', 1);
  session.counts.spodov.breeding = '唱歌'; c.increment(session, 'eutspa', 'heard', 2);
  const unknown = session.species.find(s => !c.compatibleAlias(s)); c.increment(session, unknown.code, 'seen', 4);
  session.stop = Date.now(); const output = c.exportText(session, { [unknown.code]: '新簡稱' });
  assert.equal(output.unmapped.length, 0); assert.ok(output.text.includes(unknown.name)); assert.ok(!output.text.includes('新簡稱'));
  const lines = output.text.split('\n'); assert.equal(assistant.parseEffortLine(lines[2]).valid, true);
  const parsed = lines.slice(3).map(line => assistant.parseObservationLine(line));
  assert.ok(parsed.every(x => !x.error));
  assert.equal(parsed.find(x => x.value.code === 'spodov').value.count, 6);
  assert.equal(parsed.find(x => x.value.code === 'spodov').value.comments, 'Heard 1');
  assert.equal(parsed.find(x => x.value.code === 'spodov').value.breedingCode, 'S');
  assert.equal(parsed.find(x => x.value.code === 'eutspa').value.count, 2);
  for (const [detail] of c.BREEDING.slice(1)) assert.ok(assistant.parseObservationLine(`麻雀 1 ${detail}`).value.breedingCode, detail);
});
test('counter and assistant round-trip every output shape and derive effort from GPS distance', () => {
  const presets = { 測試地點: { locId: 'L1', pageName: '測試地點', distanceKm: 9, partySize: 1 } };
  const cases = [
    { gps: false, distanceM: 0, protocol: 'P20', distanceKm: null, count: 3 },
    { gps: true, distanceM: 0, protocol: 'P21', distanceKm: 0, count: 3, heard: 1 },
    { gps: true, distanceM: 20, protocol: 'P21', distanceKm: 0.02, count: 3, breeding: '唱歌' },
    { gps: true, distanceM: 1200, protocol: 'P22', distanceKm: 1.2, count: 3, heard: 1, breeding: '唱歌', note: '樹上，已看見' },
  ];
  for (const expected of cases) {
    const session = c.createSession(
      { id: 'L1', alias: '測試地點' },
      Date.now() - 600000,
      expected.gps,
      Date.now(),
      [{ code: 'grytre1', name: '樹鵲' }],
    );
    session.stop = Date.now();
    session.distanceM = expected.distanceM;
    session.counts.grytre1 = {
      total: expected.count,
      heard: expected.heard || 0,
      breeding: expected.breeding || '',
      note: expected.note || '',
    };
    const output = c.exportText(session).text;
    const effortLine = output.split('\n')[2];
    assert.equal(effortLine.endsWith(' km'), expected.gps, output);
    if (expected.heard) assert.match(output, /樹鵲 3，(?:唱歌，)?1 聽到/);
    const record = assistant.parseRecord(output, new Date(), presets);
    assert.equal(record.errors.length, 0, output);
    assert.equal(record.effort.protocol, expected.protocol, output);
    assert.equal(record.effort.distanceKm, expected.distanceKm, output);
    assert.equal(record.observations[0].count, 3, output);
    assert.equal(record.observations[0].comments,
      [expected.heard ? 'Heard 1' : '', expected.note || ''].filter(Boolean).join(', '), output);
    assert.equal(record.observations[0].breedingCode, expected.breeding ? 'S' : null, output);
  }
});
test('local backup restores counts, elapsed, GPS, editable output and copied status', () => {
  const state = c.initialState(); state.session = c.createSession(state.locations[0], 1000, true, 1000);
  c.increment(state.session, 'eutspa', 'seen', 5); c.increment(state.session, 'eutspa', 'seen', -10);
  assert.equal(state.session.counts.eutspa.total, 0);
  state.session.distanceM = 120; state.session.lastFix = { lat: 25, lon: 121, accuracy: 5, time: 1000 };
  state.session.output = 'edited'; state.session.copied = true;
  let raw; const storage = { setItem(k, value) { raw = value; }, getItem() { return raw; } };
  c.saveState(storage, state); const restored = c.readState(storage);
  assert.deepEqual(restored, JSON.parse(JSON.stringify(state, (key,value)=>key === "months" ? undefined : value))); assert.equal(c.elapsed(restored.session, 31000), 30000);
  assert.throws(() => c.createSession(state.locations[0], 2000, false, 1000), /未來/);
  assert.throws(() => c.saveState({ setItem() { throw new Error('quota'); } }, state), /quota/);
});
test('GPS ignores poor fixes, jitter, impossible jumps and background gaps', () => {
  const s = c.createSession({ id: 'L1', alias: 'Test' }, 1000, true, 1000);
  const fix = (lat, time, accuracy = 3) => ({ lat, lon: 121, accuracy, time });
  c.addFix(s, fix(25, 1000)); c.addFix(s, fix(25.0002, 11000));
  assert.ok(s.distanceM > 20 && s.distanceM < 25);
  const d = s.distanceM;
  c.addFix(s, fix(26, 12000)); c.addFix(s, fix(25.0003, 13000, 100)); assert.equal(s.distanceM, d);
  c.addFix(s, fix(25.01, 200000)); assert.equal(s.distanceM, d); assert.equal(s.gpsGaps, 1);
});
test('full names, shortest aliases and custom aliases are searchable', () => {
  const s = { code: 'spodov', name: '珠頸斑鳩' };
  for (const q of ['斑', '珠', '鳩']) assert.equal(c.matchesQuery(s, q), true);
  assert.equal(c.matchesQuery(s, '斑鳩'), true);
  assert.equal(c.matchesQuery(s, '咕', { spodov: '咕咕' }), true);
  assert.equal(c.matchesQuery(s, '不存在'), false);
  assert.equal(c.compatibleAlias(s, { spodov: '咕咕' }), '珠頸');
  assert.equal(c.displayAlias({ code: 'rocpig1', name: '原鴿' }), '野鴿');
  assert.equal(c.displayAlias({ code: 'rocpig1', name: '原鴿' }, { rocpig1: '鴿鴿' }), '野鴿');
});
test('stationary GPS reports do not masquerade as background gaps', () => {
  const s = c.createSession({ id: 'L1', alias: 'Test' }, 1000, true, 1000);
  for (let time = 1000; time < 300000; time += 10000) c.addFix(s, { lat: 25, lon: 121, accuracy: 3, time });
  assert.equal(s.distanceM, 0); assert.equal(s.gpsGaps, 0);
});
test('backup rejects malformed species, counts and aliases before replacing stored data', () => {
  const state = c.initialState(); state.session = c.createSession(state.locations[0], 1000, false, 1000);
  const read = value => c.readState({ getItem: () => JSON.stringify(value) });
  const invalid = structuredClone(state); invalid.session.species[0].code = 'bad"<tag>';
  assert.throws(() => read(invalid));
  const negative = structuredClone(state); negative.session.counts.eutspa = { seen: -1, heard: 0, breeding: '' };
  assert.throws(() => read(negative));
  const broken = structuredClone(state); broken.aliases.spodov = {};
  assert.throws(() => read(broken));
});
