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
        matchMedia: options.matchMedia || null,
        sessionStorageSeed: options.sessionStorageSeed || {}
    });
    if (typeof options.beforeLoad === 'function') {
        options.beforeLoad(harness);
    }
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
        assert.match(api.parseFlexibleDate('0902', reference).error, /無法辨識日期/);
        assert.deepEqual(plain(api.parseFlexibleDate('0', reference).value), { year: 2026, month: 9, day: 3 });
        assert.deepEqual(plain(api.parseFlexibleDate('-2', reference).value), { year: 2026, month: 9, day: 1 });
        assert.deepEqual(plain(api.parseFlexibleDate('二', reference).value), { year: 2026, month: 9, day: 1 });
        assert.match(api.parseFlexibleDate('2026/9/4', reference).error, /無法辨識日期/);
        assert.match(api.parseFlexibleDate('-7', reference).error, /無法辨識日期/);
    });

    test('keeps relative dates stable and returns unique newest-first date choices', () => {
        const { api } = loadAssistant();
        const reference = new Date(2026, 8, 3);
        const preset = {
            locId: 'L1001',
            pageName: '測試公園',
            protocol: 'P22',
            distanceKm: 1,
            partySize: 1
        };
        const source = '-1\n測試公園\n8：00 開始 10 分鐘\n麻雀1';
        const first = api.parseRecord(source, new Date(2026, 8, 2), { 測試公園: preset }, reference);
        const second = api.parseRecord(source, new Date(2026, 8, 1), { 測試公園: preset }, reference);

        assert.deepEqual(plain(first.date), { year: 2026, month: 9, day: 2 });
        assert.deepEqual(plain(second.date), { year: 2026, month: 9, day: 2 });

        const choices = plain(api.recentDateValues(reference, {
            year: 2026,
            month: 8,
            day: 20
        }));
        const keys = choices.map((value) =>
            value.year * 10000 + value.month * 100 + value.day
        );
        assert.equal(new Set(keys).size, keys.length);
        assert.deepEqual(keys, [...keys].sort((left, right) => right - left));
        assert.equal(keys.length, 8);
        assert.equal(keys[0], 20260903);
        assert.equal(keys.at(-1), 20260820);
    });

    test('accepts a species count without a separating space and formats it like eBird', () => {
        const { api } = loadAssistant();
        const compact = api.parseObservationLine('白尾1');
        const singing = api.parseObservationLine('黑領椋鳥 1；唱歌，聽到 1');
        const fullyCompact = api.parseObservationLine('黑領1聽到唱歌');

        assert.equal(compact.error, undefined);
        assert.equal(compact.value.name, '白尾八哥');
        assert.equal(compact.value.count, 1);
        assert.equal(api.formatObservationForEbird(compact.value), '1 白尾八哥');
        assert.equal(
            api.formatObservationForEbird(singing.value),
            '1 黑領椋鳥; S 唱歌中鳥, Heard 1'
        );
        assert.equal(
            api.formatObservationForEbird(fullyCompact.value),
            '1 黑領椋鳥; S 唱歌中鳥, Heard 1'
        );
    });

    test('uses one configured default location when the location line is omitted', () => {
        const { api } = loadAssistant();
        const presets = {
            '預設公園': {
                locId: 'L1001',
                pageName: '預設公園正式名稱',
                protocol: 'P20',
                distanceKm: null,
                partySize: 1,
                isDefault: true
            }
        };
        const record = plain(api.parseRecord(
            '9/2\n8：38 開始 28 分鐘\n麻雀1',
            new Date(2026, 8, 3),
            presets,
            new Date(2026, 8, 3)
        ));

        assert.equal(record.location, '預設公園');
        assert.equal(record.locationId, 'L1001');
        assert.equal(record.usedDefaultLocation, true);
        assert.equal(record.effort.protocol, 'P20');
        assert.equal(record.effort.distanceKm, null);
        assert.equal(record.blockingErrors.length, 0);
        assert.match(record.warnings.join('\n'), /已使用預設地點/);
        assert.equal(
            api.extractLocationAlias('8：38 開始 28 分鐘\n麻雀1', new Date(2026, 8, 3), presets),
            '預設公園'
        );
    });

    test('requires a location when no default location is configured', () => {
        const { api } = loadAssistant();
        const record = plain(api.parseRecord(
            '9/2\n8：38 開始 28 分鐘\n麻雀1',
            new Date(2026, 8, 3),
            {},
            new Date(2026, 8, 3)
        ));
        const analysis = plain(api.analyzeRecordLines(
            '9/2\n8：38 開始 28 分鐘\n麻雀1',
            new Date(2026, 8, 3),
            null,
            { locId: 'L9999', pageName: '目前選取項目' },
            {}
        ));

        assert.match(record.blockingErrors.join('\n'), /尚未設定預設地點/);
        assert.equal(analysis.blockingFailureCount, 1);
        assert.match(analysis.lines[1].text, /尚未設定預設地點/);
        assert.equal(analysis.lines[1].error, true);
    });

    test('derives incidental, stationary, and traveling protocols from distance', () => {
        const { api } = loadAssistant();

        assert.equal(api.protocolForDistance(null), 'P20');
        assert.equal(api.protocolForDistance(''), 'P20');
        assert.equal(api.protocolForDistance(0), 'P21');
        assert.equal(api.protocolForDistance(0.03), 'P21');
        assert.equal(api.protocolForDistance(0.031), 'P22');
        assert.throws(() => api.protocolForDistance(-0.01), /0 以上/);

        const legacyPresetRecord = plain(api.parseRecord(
            '9/2\n舊設定\n8：38 開始 28 分鐘\n麻雀1',
            new Date(2026, 8, 3),
            {
                '舊設定': {
                    locId: 'L1003',
                    pageName: '舊設定正式名稱',
                    protocol: 'P22',
                    distanceKm: 0.02,
                    partySize: 1
                }
            },
            new Date(2026, 8, 3)
        ));
        assert.equal(legacyPresetRecord.effort.protocol, 'P21');
    });

    test('keeps only one default location in local settings', () => {
        const { api } = loadAssistant();
        api.saveLocationPreset('甲地', {
            locId: 'L1001',
            pageName: '甲地正式名稱',
            effortMode: 'incidental',
            partySize: 1,
            isDefault: true
        });
        api.saveLocationPreset('乙地', {
            locId: 'L1002',
            pageName: '乙地正式名稱',
            distanceKm: 0.02,
            partySize: 2,
            isDefault: true
        });

        assert.throws(() => api.saveLocationPreset('空距離', {
            locId: 'L1004',
            pageName: '空距離正式名稱',
            effortMode: 'distance',
            distanceKm: '',
            partySize: 1
        }), /請填寫預設距離/);

        const presets = plain(api.getLocationPresets());
        assert.equal(presets['甲地'].isDefault, false);
        assert.equal(presets['乙地'].isDefault, true);
        assert.equal(presets['甲地'].protocol, 'P20');
        assert.equal(presets['乙地'].protocol, 'P21');
        assert.deepEqual(plain(api.getDefaultLocationPreset()), {
            alias: '乙地',
            preset: presets['乙地']
        });
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
            '-1\n後港新公園\n8：38 開始 28 分鐘\n珠頸 6 唱歌，1 聽到\n麻雀 28',
            new Date(2026, 8, 3),
            preset,
            selectedLocation
        );

        assert.equal(analysis.lines.length, 5);
        assert.equal(analysis.failureCount, 0);
        assert.equal(analysis.lines[0].text, '9/2 (三)');
        assert.match(analysis.lines[1].text, /後港新公園完整名稱.*L1001/);
        assert.equal(analysis.lines[2].text, '08:38／28 分鐘');
        assert.equal(analysis.lines[3].text, '6 珠頸斑鳩; S 唱歌中鳥, Heard 1');
        assert.equal(analysis.lines[4].text, '28 麻雀');
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

    test('re-reads the submitted checklist, collapses it, and shows a green success title', () => {
        const confirmationKey = 'ebirdTextInputAssistant:lastConfirmation';
        const observation = {
            alias: '黑領',
            code: 'bkcsta1',
            codes: ['bkcsta1'],
            name: '黑領椋鳥',
            count: 5,
            breedingCode: 'S',
            comments: 'Heard 2',
            sourceLine: '黑領5聽到2唱歌',
            warning: ''
        };
        const record = {
            date: { year: 2026, month: 9, day: 2 },
            location: '測試公園',
            locationId: 'L1001',
            locationPageName: '測試公園正式名稱',
            effort: {
                hour: 8,
                minute: 38,
                durationMinutes: 28,
                protocol: 'P22',
                distanceKm: 1,
                partySize: 1
            },
            observations: [observation],
            unresolvedObservations: [],
            blockingErrors: []
        };
        const metadata = [
            { key: 'location', label: '地點', value: '測試公園正式名稱', matched: true },
            { key: 'datetime', label: '日期時間', value: '9/2 (三) 8:38 AM', matched: true },
            { key: 'protocol', label: '努力量', value: '行進計數', matched: true },
            { key: 'duration', label: '耗時', value: '28 分鐘', matched: true },
            { key: 'distance', label: '距離', value: '1 公里', matched: true },
            { key: 'party', label: '人數', value: '1 人', matched: true },
            { key: 'completeness', label: '完整清單', value: '是完整清單', matched: true }
        ];
        const confirmation = {
            record,
            result: {
                filledCount: 1,
                totalCount: 1,
                items: [{
                    observation,
                    code: 'bkcsta1',
                    status: 'filled',
                    display: '5 黑領椋鳥; S 唱歌中鳥, Heard 2',
                    error: ''
                }],
                unresolved: [],
                formErrors: [],
                metadata,
                preSubmitPassed: true,
                postSubmitPassed: null,
                allMatched: true
            }
        };
        const { harness } = loadAssistant({
            url: 'https://ebird.org/atlastw/checklist/S123456789',
            readyState: 'complete',
            sessionStorageSeed: {
                [confirmationKey]: JSON.stringify(confirmation)
            },
            beforeLoad(currentHarness) {
                currentHarness.document.body.textContent =
                    '測試公園正式名稱 2026/9/2 8:38 AM Traveling 28 min 1 km Observers 1 Complete Checklist';
                const row = currentHarness.document.createElement('div');
                row.textContent = '5 黑領椋鳥 S Singing Bird Heard 2';
                const species = currentHarness.document.createElement('a');
                species.href = 'https://ebird.org/species/bkcsta1';
                species.textContent = '黑領椋鳥';
                row.appendChild(species);
                currentHarness.appendToBody(row);
            }
        });
        const summary = harness.document.querySelector('.tm-ebird-check-summary');
        const summaryText = summary
            ? summary.children.map((child) => child.textContent).join('\n')
            : '';
        const panelBody = harness.document.querySelector('.tm-ebird-body');
        const panelTitle = harness.document.querySelector('.tm-ebird-header').children[0];

        assert.ok(summary);
        assert.equal(panelBody.hidden, true);
        assert.equal(panelTitle.textContent, '✓ 全部檢查符合');
        assert.equal(panelTitle.className, 'tm-ebird-header-ok');
        assert.match(summaryText, /地點：測試公園正式名稱/);
        assert.doesNotMatch(summaryText, /L\d+/);
        assert.match(summaryText, /日期時間：9\/2 \(三\) 8:38 AM/);
        assert.match(summaryText, /完整清單：是完整清單/);
        assert.match(summaryText, /5 黑領椋鳥; S, Heard 2/);
        assert.match(summaryText, /送出前所有欄位均已重新讀取並符合預期/);
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
