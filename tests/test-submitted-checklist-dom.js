const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseHTML } = require('linkedom');

const source = fs.readFileSync(path.join(__dirname, '../EBirdTextInputAssistant.user.js'), 'utf8');

// Reduced structure observed on S389816636 in English and Traditional Chinese.
// Personal details are replaced; selectors, attributes and taxon grouping are retained.
function fixture(dateText, english = false) {
    return `<html><body>
      <section aria-labelledBy="primary-details">
        <time datetime="2026-09-05T07:54"><span>${dateText}</span><span>${english ? '7:54 AM' : '07:54'}</span></time>
        <a href="/atlastw/hotspot/L1001">Test Park (Official Name)</a>
      </section>
      <section aria-labelledBy="other-details-effort">
        <span class="Heading-main">${english ? 'Traveling' : '行進計數'}</span>
        <button aria-controls="status-info"><span class="Badge-label">${english ? 'Complete' : '完整紀錄清單'}</span></button>
        <p id="status-info">${english ? 'Complete checklist? Yes' : '完整紀錄清單嗎? 是'}</p>
        <span><svg class="Icon--user"></svg><span class="Badge-label">1</span></span>
        <time datetime="PT25M"><span class="Badge-label">${english ? '25 min' : '25分'}</span></time>
        <span><svg class="Icon--track"></svg><span class="Badge-label">${english ? '1 km' : '1公里'}</span></span>
      </section>
      <section class="Observation" id="bkcsta1">
        <a href="/atlastw/species/bkcsta1">${english ? 'Black-collared Starling' : '黑領椋鳥'}</a>
        <div class="Observation-numberObserved"><span class="is-visuallyHidden">Number observed:</span><span>5</span></div>
        <div class="Observation-comments"><p>Heard 2</p></div>
        <section class="Observation-meta"><span class="Observation-meta-item-value">${english ? 'S Singing Bird (Possible)' : 'S唱歌中鳥 (有可能)'}</span></section>
      </section>
      <section class="Observation" id="whiwag">
        <a href="/atlastw/species/whiwag" data-species-code="whiwag">${english ? 'White Wagtail (Chinese)' : '白鶺鴒(白面)'}</a>
        <div class="Observation-numberObserved"><span>2</span></div>
        <section class="Observation-meta"></section>
      </section>
    </body></html>`;
}

function load(html) {
    const { document } = parseHTML(html);
    Object.defineProperty(document, 'readyState', { value: 'loading' });
    const context = { document, console, URL, setTimeout, clearTimeout };
    vm.runInNewContext(source, context);
    const api = context.__ebirdTextInputAssistant;
    const observations = [api.parseObservationLine('白面2').value, api.parseObservationLine('黑領5聽到2唱歌').value];
    const record = {
        date: { year: 2026, month: 9, day: 5 }, location: 'Test Park', locationId: 'L1001',
        effort: { hour: 7, minute: 54, protocol: 'P22', durationMinutes: 25, distanceKm: 1, partySize: 1 },
        observations, blockingErrors: [], unresolvedObservations: []
    };
    const pre = { preSubmitPassed: true, totalCount: 2, items: observations.map(observation => ({
        observation, code: observation.code, status: 'filled'
    })) };
    return { document, api, record, pre, verify: () => api.verifySubmittedChecklist(record, pre) };
}

for (const date of ['5 Sep 2026', 'September 5, 2026', '5 九月 2026', '5日 9月 2026年', '5 9月 2026', '2026/09/05', '2026/9/5']) {
    test(`verifies original and rewritten dates using stable attributes: ${date}`, () => {
        const { verify } = load(fixture(date, /Sep/.test(date)));
        const result = verify();
        assert.equal(result.allMatched, true, JSON.stringify(result));
        assert.equal(result.metadata[0].value, 'Test Park (Official Name)');
        assert.equal(result.metadata[1].value, '9/5 (六) 7:54 AM');
        assert.deepEqual(Array.from(result.items, item => item.code), ['bkcsta1', 'whiwag8']);
        assert.match(result.items[0].display, /S.*(?:Singing Bird|唱歌中鳥)/);
    });
}

const changes = [
    ['location', doc => doc.querySelector('a').setAttribute('href', '/atlastw/hotspot/L9999')],
    ['datetime', doc => doc.querySelector('time').setAttribute('datetime', '2026-09-04T07:54')],
    ['datetime', doc => doc.querySelector('time').setAttribute('datetime', '2026-09-05T19:54')],
    ['duration', doc => doc.querySelector('time[datetime="PT25M"]').setAttribute('datetime', 'PT125M')],
    ['party', doc => { doc.querySelector('.Icon--user').parentElement.querySelector('.Badge-label').textContent = '11'; }],
    ['protocol', doc => { doc.querySelector('.Heading-main').textContent = '定點計數'; }],
    ['distance', doc => { doc.querySelector('.Icon--track').parentElement.querySelector('.Badge-label').textContent = '11公里'; }],
    ['completeness', doc => { doc.querySelector('[aria-controls="status-info"] .Badge-label').textContent = 'Incomplete'; }]
];
for (const [key, change] of changes) {
    test(`rejects an actual ${key} mismatch even if expected values appear elsewhere`, () => {
        const { document, verify } = load(fixture('2026/9/5'));
        change(document);
        const panel = document.createElement('section');
        panel.id = 'tm-ebird-text-input-assistant';
        panel.textContent = 'Test Park 2026/9/5 7:54 AM Traveling 25 min 1 km Observers 1 Complete Checklist';
        document.body.appendChild(panel);
        const result = verify();
        assert.equal(result.allMatched, false);
        assert.equal(result.metadata.find(item => item.key === key).matched, false);
        assert.equal(verify().allMatched, false, 'retries must not verify the assistant panel');
    });
}

test('rejects missing effort fields instead of reading expected values from the panel', () => {
    const { document, verify } = load(fixture('2026/9/5'));
    document.querySelector('.Icon--user').parentElement.remove();
    assert.equal(verify().metadata.find(item => item.key === 'party').matched, false);
});

test('does not equate a different White Wagtail subspecies with Chinese', () => {
    const { document, verify } = load(fixture('2026/9/5', true));
    document.querySelector('#whiwag a').textContent = 'White Wagtail (Black-backed)';
    assert.equal(verify().allMatched, false);
});

test('reads counts and details only inside their own observation fields', () => {
    const { document, verify } = load(fixture('2026/9/5'));
    document.querySelector('#bkcsta1 .Observation-numberObserved').textContent = '1';
    document.querySelector('#bkcsta1 .Observation-comments p').textContent = 'Heard 2, saw 5';
    assert.equal(verify().items[0].status, 'failed');
});

test('excludes missing birds mentioned only by the assistant during a retry', () => {
    const { document, verify } = load(fixture('2026/9/5'));
    document.querySelector('#whiwag').remove();
    const panel = document.createElement('section');
    panel.id = 'tm-ebird-text-input-assistant';
    panel.innerHTML = '<div>2 白鶺鴒（白面）</div>';
    document.body.appendChild(panel);
    assert.equal(verify().allMatched, false);
});

test('does not infer a missing count from bird comments', () => {
    const { document, verify } = load(fixture('2026/9/5'));
    document.querySelector('#whiwag .Observation-numberObserved').remove();
    document.querySelector('#whiwag .Observation-meta').textContent = 'Heard 2';
    assert.equal(verify().allMatched, false);
});

test('verifies ISO hour/minute duration without relying on localized text', () => {
    const { document, record, verify } = load(fixture('2026/9/5'));
    record.effort.durationMinutes = 85;
    document.querySelector('time[datetime="PT25M"]').setAttribute('datetime', 'PT1H25M');
    assert.equal(verify().allMatched, true);
});

// Optional local validation against downloaded public HTML; not a network CI test.
if (process.env.EBIRD_CAPTURE_PATH) {
    test('reads the supplied live checklist capture', () => {
        const { document, api, record, pre, verify } = load(fs.readFileSync(process.env.EBIRD_CAPTURE_PATH, 'utf8'));
        record.locationId = 'L16381971';
        record.observations = [
            ['金背', 1], ['珠頸', 6], ['小環', 1], ['夜鷺', 1], ['大卷尾', 1],
            ['樹鵲', 1, 'Heard 1'], ['喜鵲', 2, 'Heard 1'], ['洋燕', 9], ['紅嘴', 1],
            ['白頭翁', 2], ['斯氏', 7], ['黑領', 5, 'Heard 2', 'S'], ['家八', 8],
            ['白尾', 3], ['麻雀', 10], ['白面', 2], ['家燕', 1]
        ].map(([alias, count, comments = '', breedingCode = null]) => Object.assign(
            api.parseObservationLine(alias + count).value, { comments, breedingCode }
        ));
        pre.totalCount = 17;
        pre.items = record.observations.map(observation => ({ observation, code: observation.code, status: 'filled' }));
        assert.ok(document.getElementById('primary-details'));
        const result = verify();
        assert.equal(result.filledCount, 17, JSON.stringify(result));
        assert.equal(result.allMatched, true, JSON.stringify(result));
    });
}
