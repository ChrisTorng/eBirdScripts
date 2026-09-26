const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseHTML } = require('linkedom');

const source = fs.readFileSync(path.join(__dirname, '../eBirdScripts.user.js'), 'utf8');

class TestNode {
    constructor(id = '', tagName = 'div') {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.parentElement = null;
        this.children = [];
        this.textContent = '';
        this.options = [];
        this.selectedIndex = 0;
    }

    appendChild(child) {
        if (child.parentElement) child.parentElement.removeChild(child);
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parentElement = null;
        return child;
    }

    insertBefore(child, reference) {
        if (child === reference) return child;
        if (child.parentElement) child.parentElement.removeChild(child);
        const index = this.children.indexOf(reference);
        child.parentElement = this;
        this.children.splice(index < 0 ? this.children.length : index, 0, child);
        return child;
    }

    contains(candidate) {
        return candidate === this || this.children.some(child => child.contains(candidate));
    }

    remove() {
        if (this.parentElement) this.parentElement.removeChild(this);
    }
}

function load(url = 'https://ebird.org/atlastw/submit/effort', language = 'zh-TW') {
    const parsed = new URL(url);
    const elements = new Map();
    const body = new TestNode('body', 'body');
    const documentElement = new TestNode('html', 'html');
    documentElement.lang = language;
    documentElement.appendChild(body);
    const document = {
        body,
        documentElement,
        getElementById(id) { return elements.get(id) || null; },
        createTextNode() { return new TestNode('', '#text'); },
        register(element) { elements.set(element.id, element); return element; }
    };
    const loadCallbacks = [];
    let replacedUrl = '';
    const location = {
        origin: parsed.origin,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        replace(value) { replacedUrl = String(value); }
    };
    const window = {
        location,
        addEventListener(type, callback) {
            if (type === 'load') loadCallbacks.push(callback);
        }
    };
    const context = {
        document,
        window,
        location,
        NodeFilter: { SHOW_TEXT: 4 },
        MutationObserver: class { observe() {} },
        GM_getValue: (key, fallback) => fallback,
        GM_setValue() {},
        GM_registerMenuCommand() {},
        navigator: {},
        console
    };
    vm.runInNewContext(source, context);
    return {
        api: context.__eBirdScripts,
        document,
        register: document.register,
        fireLoad() { loadCallbacks.forEach(callback => callback()); },
        replacedUrl: () => replacedUrl
    };
}

function addDateFields(loaded, monthText) {
    const fields = new TestNode('fields');
    loaded.document.body.appendChild(fields);
    for (const [name, text] of [['month', monthText], ['day', '2'], ['year', '2026']]) {
        const wrapper = new TestNode(name + '-wrapper', 'span');
        const select = loaded.register(new TestNode('p-' + name, 'select'));
        select.options = [{ textContent: text }];
        select.textContent = text;
        wrapper.appendChild(select);
        fields.appendChild(wrapper);
    }
    return fields;
}

test('removes only the broken my eBird continue query', () => {
    const broken = load('https://ebird.org/atlastw/myebird/TW?continue#top');
    assert.equal(broken.replacedUrl(), 'https://ebird.org/atlastw/myebird/TW#top');

    const valid = load('https://ebird.org/atlastw/myebird/TW?continue=1');
    assert.equal(valid.replacedUrl(), '');

    const otherPage = load('https://ebird.org/atlastw/submit?continue');
    assert.equal(otherPage.replacedUrl(), '');
});

test('rewrites Traditional Chinese dates and leaves English dates unchanged', () => {
    const { api } = load();
    assert.equal(api.formatTraditionalChineseDates('周三 9月 02, 2026 1:01 上午'), '2026/9/2 (三) 1:01 上午');
    assert.equal(api.formatTraditionalChineseDates('週天 9月 6日，2026年'), '2026/9/6 (日)');
    assert.equal(api.formatTraditionalChineseDates('9月 02, 2026'), '2026/9/2');
    assert.equal(api.formatTraditionalChineseDates('2 十月 2024'), '2024/10/2');
    assert.equal(api.formatTraditionalChineseDates('2日 10月 2024年'), '2024/10/2');
    assert.equal(api.formatTraditionalChineseDates('20 8月 2026'), '2026/8/20');
    assert.equal(api.formatTraditionalChineseDates('Wed, September 2, 2026 1:01 AM'), 'Wed, September 2, 2026 1:01 AM');
});

test('reorders the Traditional Chinese date controls as year, month, day', () => {
    const loaded = load();
    const fields = addDateFields(loaded, '9月');
    assert.equal(loaded.api.reorderDateFields(), true);
    assert.deepEqual(fields.children.map(child => child.id), ['year-wrapper', 'month-wrapper', 'day-wrapper']);
    assert.equal(loaded.api.reorderDateFields(), false, 'the second pass must be idempotent');
});

test('keeps the English date controls in their original order', () => {
    const loaded = load('https://ebird.org/atlastw/submit/effort', 'en');
    const fields = addDateFields(loaded, 'Sep');
    assert.equal(loaded.api.reorderDateFields(), false);
    assert.deepEqual(fields.children.map(child => child.id), ['month-wrapper', 'day-wrapper', 'year-wrapper']);
});

test('recognizes only a Traditional Chinese page for DOM changes', () => {
    assert.equal(load(undefined, 'zh-TW').api.isTraditionalChinesePage(), true);
    assert.equal(load(undefined, 'zh-Hant').api.isTraditionalChinesePage(), true);
    assert.equal(load(undefined, 'zh-CN').api.isTraditionalChinesePage(), false);
    assert.equal(load(undefined, 'en').api.isTraditionalChinesePage(), false);
});

test('builds extra-link paths from the hotspot root', () => {
    const { api } = load();
    const currentBirdListPath = '/hotspot/L36737363/bird-list';
    const hotspotPath = api.getHotspotPath(currentBirdListPath);

    assert.equal(hotspotPath, '/hotspot/L36737363');
    assert.equal(`${hotspotPath}/bird-list`, '/hotspot/L36737363/bird-list');
    assert.equal(`${hotspotPath}/recent-checklists`, '/hotspot/L36737363/recent-checklists');
});

function loadNavigation(url, markup) {
    const parsed = new URL(url);
    const { document, window: domWindow } = parseHTML(markup);
    const loadCallbacks = [];
    const location = {
        origin: parsed.origin,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        replace() {}
    };
    const window = {
        location,
        addEventListener(type, callback) {
            if (type === 'load') loadCallbacks.push(callback);
        }
    };
    const context = {
        document,
        window,
        location,
        URL,
        NodeFilter: domWindow.NodeFilter || { SHOW_TEXT: 4 },
        MutationObserver: domWindow.MutationObserver,
        GM_getValue: (key, fallback) => fallback,
        GM_setValue() {},
        GM_registerMenuCommand() {},
        navigator: {},
        console
    };
    vm.runInNewContext(source, context);
    return { api: context.__eBirdScripts, document };
}

test('adds TW data exploration after every regular eBird navigation link', () => {
    const loaded = loadNavigation('https://ebird.org/explore', `
        <header><nav><ul>
            <li><a class="active" aria-current="page" href="/explore">資料探索</a></li>
        </ul></nav></header>
        <main><a href="/explore">內容中的資料探索</a></main>
    `);

    loaded.api.updateExploreNavigation();
    const links = loaded.document.querySelectorAll('header a');
    assert.deepEqual(Array.from(links, link => [link.textContent, link.getAttribute('href')]), [
        ['資料探索', '/explore'],
        ['TW 資料探索', '/atlastw/explore']
    ]);
    assert.equal(links[1].classList.contains('active'), false);
    assert.equal(links[1].hasAttribute('aria-current'), false);
    assert.equal(loaded.document.querySelectorAll('main a').length, 1, 'content links must not be changed');

    loaded.api.updateExploreNavigation();
    assert.equal(loaded.document.querySelectorAll('header a').length, 2, 'the update must be idempotent');
});

test('renames Atlas Taiwan exploration and inserts regular exploration before it', () => {
    const loaded = loadNavigation('https://ebird.org/atlastw/explore', `
        <div role="banner"><nav><ul>
            <li><a class="is-selected" href="/atlastw/explore">資料探索</a></li>
        </ul></nav></div>
    `);

    loaded.api.updateExploreNavigation();
    const links = loaded.document.querySelectorAll('[role="banner"] a');
    assert.deepEqual(Array.from(links, link => [link.textContent, link.getAttribute('href')]), [
        ['資料探索', '/explore'],
        ['TW 資料探索', '/atlastw/explore']
    ]);
    assert.equal(links[0].classList.contains('is-selected'), false);
    assert.equal(links[1].classList.contains('is-selected'), true);
});

test('recognizes only the Atlas Taiwan path segment', () => {
    const { api } = load();
    assert.equal(api.isAtlasTaiwanPath('/atlastw'), true);
    assert.equal(api.isAtlasTaiwanPath('/atlastw/explore'), true);
    assert.equal(api.isAtlasTaiwanPath('/atlastwo'), false);
    assert.equal(api.isAtlasTaiwanPath('/explore'), false);
});
