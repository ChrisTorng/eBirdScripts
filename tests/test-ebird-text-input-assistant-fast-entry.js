const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { createHarness } = require('./dom-harness');

const scriptPath = path.join(__dirname, '..', 'EBirdTextInputAssistant.user.js');
const scriptContents = fs.readFileSync(scriptPath, 'utf8');

function loadAssistant(options = {}) {
    const harness = createHarness({
        url: options.url || 'https://ebird.org/atlastw/submit/checklist',
        readyState: options.readyState || 'loading',
        matchMedia: options.matchMedia || null
    });
    harness.context.globalThis = harness.context;
    harness.context.global = harness.context;
    const gmStorage = new Map();
    harness.context.GM_getValue = (key, fallback) => gmStorage.has(key) ? gmStorage.get(key) : fallback;
    harness.context.GM_setValue = (key, value) => gmStorage.set(key, value);
    vm.runInNewContext(scriptContents, harness.context, { filename: scriptPath });
    return { harness, api: harness.context.__ebirdTextInputAssistant };
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

describe('eBird assistant fast entry workflow', () => {
    test('accepts every supported compact date format relative to today', () => {
        const { api } = loadAssistant();
        const reference = new Date(2026, 8, 3);

        assert.deepEqual(plain(api.parseFlexibleDate('2026/8/20', reference).value), { year: 2026, month: 8, day: 20 });
        assert.deepEqual(plain(api.parseFlexibleDate('9/2', reference).value), { year: 2026, month: 9, day: 2 });
        assert.deepEqual(plain(api.parseFlexibleDate('0902', reference).value), { year: 2026, month: 9, day: 2 });
        assert.deepEqual(plain(api.parseFlexibleDate('0', reference).value), { year: 2026, month: 9, day: 3 });
        assert.deepEqual(plain(api.parseFlexibleDate('-2', reference).value), { year: 2026, month: 9, day: 1 });
        assert.deepEqual(plain(api.parseFlexibleDate('二', reference).value), { year: 2026, month: 9, day: 1 });
        assert.match(api.parseFlexibleDate('2026/9/4', reference).error, /無法辨識日期/);
        assert.match(api.parseFlexibleDate('-7', reference).error, /無法辨識日期/);
    });

    test('filters one character at a time and ignores characters that would remove every location', () => {
        const { api } = loadAssistant();
        const locations = [
            { text: '後港新公園 Hougang New Park', value: 'L1001' },
            { text: '後港舊公園 Hougang Old Park', value: 'L1002' },
            { text: '建國二路 Jianguo 2nd Road', value: 'L1003' }
        ];

        const filtered = api.filterLocationItems(locations, '後新Z');
        assert.deepEqual(plain(filtered.items.map((item) => item.value)), ['L1001']);
        assert.deepEqual(plain(filtered.acceptedCharacters), ['後', '新']);

        const noUsefulCharacter = api.filterLocationItems(locations, '★☆');
        assert.equal(noUsefulCharacter.items.length, 3);
        assert.deepEqual(plain(noUsefulCharacter.acceptedCharacters), []);
    });

    test('keeps line-by-line preview aligned and shows normalized values', () => {
        const { api } = loadAssistant();
        const selectedLocation = {
            locId: 'L1001',
            pageName: '後港新公園完整名稱'
        };
        const preset = {
            locId: 'L1001',
            pageName: '後港新公園完整名稱',
            protocol: 'P22',
            distanceKm: 1,
            partySize: 1
        };
        const analysis = api.analyzeRecordLines(
            '0902\n後港新公園\n8：38 開始 28 分鐘\n珠頸 6 唱歌，1 聽到\n麻雀 28',
            new Date(2026, 8, 3),
            preset,
            selectedLocation
        );

        assert.equal(analysis.lines.length, 5);
        assert.equal(analysis.failureCount, 0);
        assert.equal(analysis.lines[0].text, '9/2 (三)');
        assert.match(analysis.lines[1].text, /後港新公園完整名稱.*L1001/);
        assert.equal(analysis.lines[2].text, '08:38／28 分鐘');
        assert.match(analysis.lines[3].text, /珠頸斑鳩 6.*唱歌.*聽到 1/);
        assert.equal(analysis.lines[4].text, '麻雀 28');
    });

    test('marks only unrecognized source lines as preview failures', () => {
        const { api } = loadAssistant();
        const analysis = api.analyzeRecordLines(
            '9/2\n測試地點\n8：38 開始 28 分鐘\n神秘鳥 1\n麻雀 2',
            new Date(2026, 8, 3),
            null,
            { locId: 'L1001', pageName: '測試地點完整名稱' }
        );

        assert.equal(analysis.failureCount, 1);
        assert.equal(analysis.lines[3].error, true);
        assert.equal(analysis.lines[4].error, false);
    });

    test('flags a mismatched selected location and unapplied bird details', () => {
        const { api } = loadAssistant();
        const preset = {
            locId: 'L1001',
            pageName: '設定地點',
            protocol: 'P22',
            distanceKm: 1,
            partySize: 1
        };
        const analysis = api.analyzeRecordLines(
            '9/2\n測試地點\n8：38 開始 28 分鐘\n麻雀 2 未知細節',
            new Date(2026, 8, 3),
            preset,
            { locId: 'L9999', pageName: '目前選取地點' }
        );

        assert.equal(analysis.failureCount, 2);
        assert.match(analysis.lines[1].text, /與簡稱設定不符/);
        assert.equal(analysis.lines[1].error, true);
        assert.match(analysis.lines[3].text, /未套用的細節/);
        assert.equal(analysis.lines[3].error, true);
    });

    test('starts collapsed on a small screen and stays open on a large screen', () => {
        const mobile = loadAssistant({
            readyState: 'complete',
            matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
        }).harness;
        assert.equal(mobile.document.querySelector('.tm-ebird-body').hidden, true);
        assert.equal(mobile.document.querySelector('.tm-ebird-collapse').textContent, '▼');

        const desktop = loadAssistant({
            readyState: 'complete',
            matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
        }).harness;
        assert.equal(desktop.document.querySelector('.tm-ebird-body').hidden, false);
        assert.equal(desktop.document.querySelector('.tm-ebird-collapse').textContent, '▲');
    });
});
