// ==UserScript==
// @name         eBird Text Input Assistant
// @namespace    http://tampermonkey.net/
// @version      2026-09-03_1.3.2
// @description  Parse compact Taiwan birding notes, preview every line, select locations, and fill eBird forms without submitting them.
// @author       ChrisTorng
// @homepage     https://github.com/ChrisTorng/eBirdScripts/
// @downloadURL  https://github.com/ChrisTorng/eBirdScripts/raw/main/EBirdTextInputAssistant.user.js
// @updateURL    https://github.com/ChrisTorng/eBirdScripts/raw/main/EBirdTextInputAssistant.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ebird.org
// @match        https://ebird.org/*/submit*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function() {
    'use strict';

    const storageKey = 'ebirdTextInputAssistant:pendingRecord';
    const autoEffortKey = 'ebirdTextInputAssistant:autoEffort';
    const settingsKey = 'ebirdTextInputAssistant:locationPresets';
    const panelId = 'tm-ebird-text-input-assistant';
    const styleId = panelId + '-style';
    const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];

    function getLocationPresets() {
        const stored = typeof GM_getValue === 'function'
            ? GM_getValue(settingsKey, {})
            : JSON.parse(localStorage.getItem(settingsKey) || '{}');
        return stored && typeof stored === 'object' ? stored : {};
    }

    function setLocationPresets(presets) {
        if (typeof GM_setValue === 'function') {
            GM_setValue(settingsKey, presets);
        } else {
            localStorage.setItem(settingsKey, JSON.stringify(presets));
        }
    }

    function saveLocationPreset(alias, values) {
        const normalizedAlias = String(alias || '').trim();
        const locId = String(values.locId || '').trim();
        const pageName = String(values.pageName || '').trim() || normalizedAlias;
        const distanceKm = Number(values.distanceKm);
        const partySize = Number(values.partySize || 1);
        if (!normalizedAlias || !/^L\d+$/.test(locId) || !Number.isFinite(distanceKm) || distanceKm <= 0) {
            throw new Error('請填寫簡稱、L 開頭的 eBird 地點 ID 與大於 0 的預設距離。');
        }
        if (!Number.isInteger(partySize) || partySize < 1) {
            throw new Error('人數必須是大於 0 的整數。');
        }
        const presets = getLocationPresets();
        presets[normalizedAlias] = {
            locId: locId,
            pageName: pageName,
            protocol: 'P22',
            distanceKm: distanceKm,
            partySize: partySize
        };
        setLocationPresets(presets);
        return presets[normalizedAlias];
    }

    function deleteLocationPreset(alias) {
        const presets = getLocationPresets();
        delete presets[alias];
        setLocationPresets(presets);
    }

    const speciesAliases = Object.freeze({
        '金背': { code: 'ortdov', name: '金背鳩' },
        '金背鳩': { code: 'ortdov', name: '金背鳩' },
        '珠頸': { code: 'spodov', name: '珠頸斑鳩' },
        '珠頸斑鳩': { code: 'spodov', name: '珠頸斑鳩' },
        '紅鳩': { code: 'recdov1', name: '紅鳩' },
        '野鴿': { code: 'rocpig1', name: '野鴿（野化）' },
        '紅嘴': { code: 'blabul1', name: '紅嘴黑鵯' },
        '紅嘴黑鵯': { code: 'blabul1', name: '紅嘴黑鵯' },
        '小雨燕': { code: 'houswi1', codes: ['houswi1', 'houswi'], name: '小雨燕' },
        '紅冠': { code: 'commoo3', name: '紅冠水雞' },
        '紅冠水雞': { code: 'commoo3', name: '紅冠水雞' },
        '小環': { code: 'lirplo', name: '小環頸鴴' },
        '小環頸鴴': { code: 'lirplo', name: '小環頸鴴' },
        '磯鷸': { code: 'comsan', name: '磯鷸' },
        '白腰草鷸': { code: 'grnsan', name: '白腰草鷸' },
        '夜鷺': { code: 'bcnher', name: '夜鷺' },
        '白腹': { code: 'whbwat1', name: '白腹秧雞' },
        '白腹秧雞': { code: 'whbwat1', name: '白腹秧雞' },
        '小白': { code: 'litegr', name: '小白鷺' },
        '小白鷺': { code: 'litegr', name: '小白鷺' },
        '黃頭鷺': { code: 'categr2', name: '黃頭鷺' },
        '喜鵲': { code: 'orimag1', name: '喜鵲' },
        '台灣藍鵲': { code: 'formag1', name: '臺灣藍鵲' },
        '臺灣藍鵲': { code: 'formag1', name: '臺灣藍鵲' },
        '黑冠': { code: 'manher1', name: '黑冠麻鷺' },
        '黑冠麻鷺': { code: 'manher1', name: '黑冠麻鷺' },
        '樹鵲': { code: 'grytre1', name: '樹鵲' },
        '東方黃': { code: 'eaywag', name: '東方黃鶺鴒 (黃頭)' },
        '東方黃鶺鴒': { code: 'eaywag', name: '東方黃鶺鴒 (黃頭)' },
        '大卷尾': { code: 'bladro1', name: '大卷尾' },
        '五色鳥': { code: 'taibar2', name: '五色鳥' },
        '亞洲': { code: 'asgsta1', name: '亞洲輝椋鳥' },
        '亞洲輝椋鳥': { code: 'asgsta1', name: '亞洲輝椋鳥' },
        '褐頭': { code: 'plapri1', name: '褐頭鷦鶯' },
        '褐頭鷦鶯': { code: 'plapri1', name: '褐頭鷦鶯' },
        '灰頭鷦鶯': { code: 'gybpri1', name: '灰頭鷦鶯' },
        '翠鳥': { code: 'comkin1', name: '翠鳥' },
        '斑馬鳩': { code: 'zebdov', name: '斑馬鳩' },
        '家燕': { code: 'barswa', name: '家燕' },
        '洋燕': { code: 'pacswa1', name: '洋燕' },
        '赤腰燕': { code: 'strswa2', codes: ['strswa2', 'y00621', 'strswa1'], name: '東方金腰燕 (赤腰燕)' },
        '東方金腰燕': { code: 'strswa2', codes: ['strswa2', 'y00621', 'strswa1'], name: '東方金腰燕 (赤腰燕)' },
        '白頭翁': { code: 'livbul1', name: '白頭翁' },
        '斯氏': { code: 'swiwhe1', name: '斯氏繡眼' },
        '斯氏繡眼': { code: 'swiwhe1', name: '斯氏繡眼' },
        '黑領': { code: 'bkcsta1', name: '黑領椋鳥' },
        '黑領椋鳥': { code: 'bkcsta1', name: '黑領椋鳥' },
        '家八': { code: 'commyn', name: '家八哥' },
        '家八哥': { code: 'commyn', name: '家八哥' },
        '冠八': { code: 'cremyn', name: '八哥 (冠八哥)' },
        '八哥 (冠八哥)': { code: 'cremyn', name: '八哥 (冠八哥)' },
        '八哥(冠八哥)': { code: 'cremyn', name: '八哥 (冠八哥)' },
        '白尾': { code: 'whvmyn', name: '白尾八哥' },
        '白尾八哥': { code: 'whvmyn', name: '白尾八哥' },
        '鵲鴝': { code: 'magrob', name: '鵲鴝' },
        '麻雀': { code: 'eutspa', name: '麻雀' },
        '斑文鳥': { code: 'nutman', name: '斑文鳥' },
        '黑頭文鳥': { code: 'chemun', name: '黑頭文鳥' },
        '葡萄胸': { code: 'vibsta4', name: '葡萄胸椋鳥' },
        '葡萄胸椋鳥': { code: 'vibsta4', name: '葡萄胸椋鳥' },
        '灰頭椋鳥': { code: 'chtsta2', name: '灰頭椋鳥' },
        '綠簑鷺': { code: 'strher1', codes: ['strher1', 'strher'], name: '綠簑鷺' },
        '小啄木': { code: 'gycwoo1', name: '小啄木' },
        '薑母鴨': { code: 'musduc', codes: ['musduc', 'musduc3', 'musduc2'], name: '疣鼻棲鴨' },
        '疣鼻棲鴨': { code: 'musduc', codes: ['musduc', 'musduc3', 'musduc2'], name: '疣鼻棲鴨' },
        '灰鶺鴒': { code: 'grywag', name: '灰鶺鴒' },
        '白面': { code: 'whiwag8', name: '白鶺鴒（白面）' },
        '白鶺鴒（白面）': { code: 'whiwag8', name: '白鶺鴒（白面）' }
    });

    function startOfDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function dateValue(date) {
        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate()
        };
    }

    function dateObject(value) {
        return new Date(value.year, value.month - 1, value.day);
    }

    function isSameDateParts(date, year, month, day) {
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    }

    function parseFlexibleDate(line, referenceDate = new Date()) {
        const text = String(line || '').trim();
        const today = startOfDay(referenceDate);
        let result = null;
        let recognizedSyntax = false;
        let match = text.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
        if (match) {
            recognizedSyntax = true;
            result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
            if (!isSameDateParts(result, Number(match[1]), Number(match[2]), Number(match[3]))) {
                result = null;
            }
        } else {
            match = text.match(/^(\d{1,2})[\/-](\d{1,2})$/);
            if (match) {
                recognizedSyntax = true;
                const month = Number(match[1]);
                const day = Number(match[2]);
                result = new Date(today.getFullYear(), month - 1, day);
                if (!isSameDateParts(result, today.getFullYear(), month, day)) {
                    result = null;
                } else if (result > today) {
                    result = new Date(today.getFullYear() - 1, month - 1, day);
                }
            } else if (/^\d{4}$/.test(text)) {
                recognizedSyntax = true;
                const month = Number(text.slice(0, 2));
                const day = Number(text.slice(2));
                result = new Date(today.getFullYear(), month - 1, day);
                if (!isSameDateParts(result, today.getFullYear(), month, day)) {
                    result = null;
                } else if (result > today) {
                    result = new Date(today.getFullYear() - 1, month - 1, day);
                }
            } else if (/^(?:0|-[1-6])$/.test(text)) {
                recognizedSyntax = true;
                result = new Date(today);
                result.setDate(result.getDate() + Number(text));
            } else if (/^[一二三四五六日]$/.test(text)) {
                recognizedSyntax = true;
                const target = '日一二三四五六'.indexOf(text);
                const daysAgo = (today.getDay() - target + 7) % 7;
                result = new Date(today);
                result.setDate(result.getDate() - daysAgo);
            } else if (/^-\d+$/.test(text)) {
                recognizedSyntax = true;
            }
        }
        if (!recognizedSyntax) {
            return { consumed: false, value: dateValue(today), error: '' };
        }
        if (!result || result > today) {
            return { consumed: true, value: dateValue(today), error: '無法辨識日期：' + text };
        }
        return { consumed: true, value: dateValue(result), error: '' };
    }

    function parseDate(line, fallbackDate) {
        return parseFlexibleDate(line, fallbackDate);
    }

    function normalizeSource(text) {
        return String(text || '')
            .replace(/&(?:#x20|#32|nbsp);/gi, ' ')
            .replace(/\u00a0/g, ' ')
            .replace(/\r/g, '');
    }

    function parseObservationLine(line) {
        const match = String(line || '').match(/^(.+?)\s*(\d+)(?:(?:\s*[；;]\s*|\s+)(.*))?$/);
        if (!match) {
            return { error: '無法解析物種紀錄：' + (line || '（未填）') };
        }
        const alias = match[1].trim();
        const species = speciesAliases[alias];
        if (!species) {
            return { error: '不確定的物種：' + alias };
        }
        const count = Number(match[2]);
        const details = (match[3] || '').replace(/，/g, ',').trim();
        const explicitHeardBefore = details.match(/(?:^|,)\s*(\d+)\s*聽到/);
        const explicitHeardAfter = details.match(/聽到\s*(\d+)/);
        const heardCount = details.includes('聽到')
            ? explicitHeardBefore ? Number(explicitHeardBefore[1])
                : explicitHeardAfter ? Number(explicitHeardAfter[1]) : count
            : null;
        const breedingCode = details.includes('一對') ? 'P' : (details.includes('唱歌') ? 'S' : null);
        const unknownDetails = details
            .replace(/唱歌/g, '')
            .replace(/一對/g, '')
            .replace(/(?:^|,)\s*\d*\s*聽到(?:\s*\d+)?/g, '')
            .replace(/聽到\s*\d+/g, '')
            .replace(/^[,\s]+|[,\s]+$/g, '');
        return {
            value: {
                alias: alias,
                code: species.code,
                codes: species.codes || [species.code],
                name: species.name,
                count: count,
                breedingCode: breedingCode,
                comments: heardCount === null ? '' : 'Heard ' + heardCount,
                sourceLine: String(line || ''),
                warning: unknownDetails ? '未套用的細節「' + unknownDetails + '」' : ''
            },
            warning: unknownDetails ? '未套用的細節「' + unknownDetails + '」：' + line : ''
        };
    }

    function parseRecord(text, fallbackDate = new Date(), locationPresets = getLocationPresets()) {
        const normalizedSource = normalizeSource(text);
        const lines = normalizedSource.split('\n').map(function(line) { return line.trim(); }).filter(Boolean);
        const errors = [];
        const blockingErrors = [];
        const warnings = [];
        const unresolvedObservations = [];
        let index = 0;

        const parsedDate = parseDate(lines[index], fallbackDate);
        const date = parsedDate.value;
        if (parsedDate.consumed) {
            index += 1;
            if (parsedDate.error) {
                errors.push(parsedDate.error);
                blockingErrors.push(parsedDate.error);
            }
        } else {
            warnings.push('未提供日期，已使用選取日期。');
        }

        const locationName = lines[index++] || '';
        const preset = locationPresets[locationName];
        if (!preset) {
            const error = '尚未設定的地點：' + (locationName || '（未填）');
            errors.push(error);
            blockingErrors.push(error);
        }

        const effortLine = lines[index++] || '';
        const effortMatch = effortLine.match(/^(\d{1,2})[：:](\d{1,2})\s*開始\s*(\d+)\s*分鐘$/);
        const effort = effortMatch ? {
            hour: Number(effortMatch[1]),
            minute: Number(effortMatch[2]),
            durationMinutes: Number(effortMatch[3]),
            protocol: preset ? preset.protocol : 'P22',
            distanceKm: preset ? preset.distanceKm : null,
            partySize: preset ? preset.partySize : 1
        } : null;
        if (!effortMatch) {
            const error = '無法解析開始時間與分鐘：' + (effortLine || '（未填）');
            errors.push(error);
            blockingErrors.push(error);
        } else if (effort.hour > 23 || effort.minute > 59 || effort.durationMinutes < 1) {
            const error = '時間或分鐘不合理：' + effortLine;
            errors.push(error);
            blockingErrors.push(error);
        }

        const observations = [];
        const observationsByCode = new Map();
        for (; index < lines.length; index += 1) {
            const line = lines[index];
            const parsed = parseObservationLine(line);
            if (parsed.error) {
                errors.push(parsed.error);
                unresolvedObservations.push({ sourceLine: line, error: parsed.error });
                continue;
            }
            if (parsed.warning) {
                warnings.push(parsed.warning);
            }
            const observation = parsed.value;
            const existing = observationsByCode.get(observation.code);
            if (existing) {
                const same = existing.count === observation.count
                    && existing.breedingCode === observation.breedingCode
                    && existing.comments === observation.comments;
                const message = same
                    ? '重複的相同紀錄已保留一次：' + observation.alias + ' ' + observation.count
                    : '同一物種出現不同紀錄，請確認：' + existing.alias + '／' + observation.alias;
                if (same) {
                    warnings.push(message);
                } else {
                    errors.push(message);
                }
                unresolvedObservations.push({ sourceLine: line, error: message });
                continue;
            }
            observationsByCode.set(observation.code, observation);
            observations.push(observation);
        }

        if (observations.length === 0) {
            const error = '沒有可填入的物種紀錄。';
            errors.push(error);
            blockingErrors.push(error);
        }
        return {
            date: date,
            location: locationName,
            effort: effort,
            observations: observations,
            unresolvedObservations: unresolvedObservations,
            errors: errors,
            blockingErrors: blockingErrors,
            warnings: warnings,
            source: normalizedSource.trim()
        };
    }

    function assertRecordReady(record) {
        const errors = Array.isArray(record.blockingErrors) ? record.blockingErrors : record.errors;
        if (errors && errors.length > 0) {
            throw new Error(errors.join('\n'));
        }
    }

    function dispatchValueEvents(element) {
        ['input', 'change', 'blur'].forEach(function(type) {
            const event = typeof Event === 'function'
                ? new Event(type, { bubbles: true })
                : { type: type, bubbles: true };
            element.dispatchEvent(event);
        });
    }

    function setValue(id, value) {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error('找不到 eBird 欄位：' + id);
        }
        element.value = String(value);
        dispatchValueEvents(element);
        return element;
    }

    function setCountValue(id, value) {
        const element = setValue(id, value);
        if (typeof element.focus === 'function') {
            element.focus();
        }
        element.click();
        const keyup = typeof Event === 'function'
            ? new Event('keyup', { bubbles: true })
            : { type: 'keyup', bubbles: true };
        element.dispatchEvent(keyup);
        if (typeof element.blur === 'function') {
            element.blur();
        }
        return element;
    }

    function selectOption(select, values, texts = []) {
        const normalizedValues = values.map(function(value) { return String(value).toLowerCase(); });
        const normalizedTexts = texts.map(function(text) { return String(text).trim().toLowerCase(); });
        const option = Array.from(select.options || []).find(function(item) {
            const value = String(item.value).toLowerCase();
            const text = item.textContent.trim().toLowerCase();
            return normalizedValues.includes(value) || normalizedTexts.includes(text);
        });
        if (!option) {
            throw new Error('找不到選項：' + (texts[0] || values[0]));
        }
        select.value = option.value;
        dispatchValueEvents(select);
    }

    function waitForElement(id, timeoutMs = 4000) {
        const started = Date.now();
        return new Promise(function(resolve, reject) {
            function check() {
                const element = document.getElementById(id);
                if (element) {
                    resolve(element);
                } else if (Date.now() - started >= timeoutMs) {
                    reject(new Error('等待 eBird 欄位逾時：' + id));
                } else {
                    setTimeout(check, 50);
                }
            }
            check();
        });
    }

    function waitForObservationField(observation, timeoutMs = 4000) {
        const codes = Array.from(new Set(observation.codes || [observation.code]));
        const started = Date.now();
        return new Promise(function(resolve, reject) {
            function check() {
                const code = codes.find(function(candidate) { return document.getElementById(candidate); });
                if (code) {
                    resolve({ code: code, element: document.getElementById(code) });
                } else if (Date.now() - started >= timeoutMs) {
                    reject(new Error('等待 eBird 欄位逾時：' + codes.join('／')));
                } else {
                    setTimeout(check, 50);
                }
            }
            check();
        });
    }

    function fillDate(date) {
        const month = document.getElementById('p-month');
        const day = document.getElementById('p-day');
        const year = document.getElementById('p-year');
        if (!month || !day || !year) {
            throw new Error('找不到 eBird 日期欄位。');
        }
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        selectOption(month, [date.month, String(date.month).padStart(2, '0')], [monthNames[date.month - 1], date.month + '月']);
        selectOption(day, [date.day, String(date.day).padStart(2, '0')], [String(date.day), date.day + '日']);
        selectOption(year, [date.year], [String(date.year), date.year + '年']);
    }

    async function fillEffort(record, options = {}) {
        assertRecordReady(record);
        const preset = getLocationPresets()[record.location];
        if (!preset) {
            throw new Error('尚未設定的地點：' + record.location);
        }
        const currentLocId = new URLSearchParams(location.search).get('locID');
        const pageText = document.body ? document.body.textContent : '';
        const locationMatches = currentLocId ? currentLocId === preset.locId : pageText.includes(preset.pageName);
        if (!options.skipLocationCheck && !locationMatches) {
            throw new Error('目前 eBird 地點不是「' + record.location + '」，請先選對地點。');
        }
        fillDate(record.date);
        const protocol = document.getElementById(record.effort.protocol);
        if (!protocol) {
            throw new Error('找不到 eBird 移動式調查選項。');
        }
        protocol.click();
        await waitForElement('p-shared-hr');
        const isAfternoon = record.effort.hour >= 12;
        setValue('p-shared-hr', record.effort.hour % 12 || 12);
        setValue('p-shared-min', String(record.effort.minute).padStart(2, '0'));
        selectOption(
            document.getElementById('p-shared-ampm'),
            isAfternoon ? ['PM', 'pm', 'P'] : ['AM', 'am', 'A'],
            isAfternoon ? ['PM', '下午'] : ['AM', '上午']
        );
        setValue('p-dur-hrs', Math.floor(record.effort.durationMinutes / 60));
        setValue('p-dur-min', record.effort.durationMinutes % 60);
        setValue('p-dist', record.effort.distanceKm);
        setValue('p-party-size', record.effort.partySize);
        sessionStorage.setItem(storageKey, JSON.stringify(record));
        sessionStorage.removeItem(autoEffortKey);
        if (options.continueToSpecies !== false) {
            document.getElementById('btn-eff-continue').click();
        }
    }

    function startRecord(record) {
        assertRecordReady(record);
        const preset = getLocationPresets()[record.location];
        if (!preset) {
            throw new Error('尚未設定的地點：' + record.location);
        }
        sessionStorage.setItem(storageKey, JSON.stringify(record));
        sessionStorage.setItem(autoEffortKey, 'true');
        const match = location.pathname.match(/^(.*?)\/submit(?:\/|$)/);
        const portalPrefix = match ? match[1] : '';
        location.assign(location.origin + portalPrefix + '/submit/effort?locID=' + encodeURIComponent(preset.locId));
    }

    function selectedOptionText(select) {
        if (!select) {
            return '';
        }
        const selected = Array.from(select.options || []).find(function(option) {
            return String(option.value) === String(select.value);
        }) || (select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null);
        return selected ? selected.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    function fallbackBreedingLabel(code) {
        if (code === 'S') {
            return 'S 唱歌中鳥';
        }
        if (code === 'P') {
            return 'P 一對';
        }
        return code || '';
    }

    function formatObservationForEbird(observation, details) {
        const extra = [];
        const breedingText = details && details.breedingText
            ? details.breedingText
            : fallbackBreedingLabel(observation.breedingCode);
        const comments = details && Object.prototype.hasOwnProperty.call(details, 'comments')
            ? details.comments
            : observation.comments;
        if (breedingText) {
            extra.push(breedingText);
        }
        if (comments) {
            extra.push(comments);
        }
        return observation.count + ' ' + observation.name
            + (extra.length ? '; ' + extra.join(', ') : '');
    }

    async function applyObservationDetails(observation) {
        let breedingText = '';
        if (!observation.breedingCode && !observation.comments) {
            return { breedingText: '', comments: '' };
        }
        const detailLink = await waitForElement('add_' + observation.code);
        detailLink.click();
        if (observation.breedingCode) {
            const breedingSelect = await waitForElement('p-' + observation.code + '_bcode');
            const option = Array.from(breedingSelect.options || []).find(function(item) {
                const text = item.textContent.trim();
                return text === observation.breedingCode || text.startsWith(observation.breedingCode + ' ');
            });
            if (!option) {
                throw new Error('找不到 ' + observation.name + ' 的繁殖代碼 ' + observation.breedingCode + '。');
            }
            breedingSelect.value = option.value;
            dispatchValueEvents(breedingSelect);
            breedingText = selectedOptionText(breedingSelect) || option.textContent.trim();
        }
        if (observation.comments) {
            setValue('p-' + observation.code + '_comments', observation.comments);
        }
        return { breedingText: breedingText, comments: observation.comments };
    }

    function revealAdditionalSpeciesSections() {
        const controls = Array.from(document.querySelectorAll('button, a, label, summary, [role="button"]'));
        const sectionPattern = /^(?:show\s+)?(?:rarities|rare species|uncommon|not observed|no observations|不常見|稀有|稀有鳥種|無觀察紀錄|顯示稀有鳥種)$/i;
        let clicked = 0;
        controls.forEach(function(control) {
            const text = control.textContent.replace(/\s+/g, ' ').trim();
            if (!sectionPattern.test(text)) {
                return;
            }
            const expanded = control.getAttribute('aria-expanded');
            const input = control.matches('input') ? control : control.querySelector('input[type="checkbox"]');
            if (expanded !== 'true' && !(input && input.checked)) {
                control.click();
                clicked += 1;
            }
        });
        return clicked;
    }

    function setUnobservedVisibility(hidden) {
        const rows = Array.from(document.querySelectorAll('.SubmitChecklist-species'));
        let hiddenCount = 0;
        rows.forEach(function(row) {
            const count = row.querySelector('input.sc, input[type="tel"]');
            const observed = count && String(count.value || '').trim() !== '' && String(count.value).trim() !== '0';
            row.classList.toggle('tm-ebird-unobserved-hidden', Boolean(hidden && !observed));
            if (hidden && !observed) {
                hiddenCount += 1;
            }
        });
        return hiddenCount;
    }

    function readObservationDisplay(outcome) {
        const observation = outcome.observation;
        const code = outcome.code;
        const breedingSelect = document.getElementById('p-' + code + '_bcode');
        const commentsField = document.getElementById('p-' + code + '_comments');
        return formatObservationForEbird(observation, {
            breedingText: selectedOptionText(breedingSelect) || outcome.breedingText,
            comments: commentsField ? String(commentsField.value || '').trim() : observation.comments
        });
    }

    function orderOutcomesByChecklist(outcomes) {
        const ordered = [];
        const included = new Set();
        Array.from(document.querySelectorAll('.SubmitChecklist-species')).forEach(function(row) {
            const countField = row.querySelector('input.sc') || row.querySelector('input[type="tel"]');
            const code = countField ? countField.id : '';
            if (!code) {
                return;
            }
            const outcome = outcomes.find(function(item) {
                return item.code === code || (item.observation.codes || [item.observation.code]).includes(code);
            });
            if (outcome && !included.has(outcome)) {
                outcome.code = code;
                outcome.display = readObservationDisplay(outcome);
                ordered.push(outcome);
                included.add(outcome);
            }
        });
        outcomes.forEach(function(outcome) {
            if (!included.has(outcome)) {
                outcome.display = formatObservationForEbird(outcome.observation, {
                    breedingText: outcome.breedingText,
                    comments: outcome.observation.comments
                });
                ordered.push(outcome);
            }
        });
        return ordered;
    }

    async function fillSpecies(record, options = {}) {
        assertRecordReady(record);
        const errors = [];
        const outcomes = record.observations.map(function(observation) {
            return {
                observation: observation,
                code: observation.code,
                status: 'pending',
                error: '',
                breedingText: ''
            };
        });
        const missingBeforeReveal = record.observations.some(function(observation) {
            return !(observation.codes || [observation.code]).some(function(code) {
                return document.getElementById(code);
            });
        });
        if (missingBeforeReveal) {
            revealAdditionalSpeciesSections();
        }

        const countResults = await Promise.allSettled(outcomes.map(async function(outcome) {
            const resolved = await waitForObservationField(
                outcome.observation,
                options.elementTimeoutMs ?? 4000
            );
            setCountValue(resolved.code, outcome.observation.count);
            return resolved.code;
        }));
        countResults.forEach(function(result, index) {
            const outcome = outcomes[index];
            if (result.status === 'fulfilled') {
                outcome.code = result.value;
                outcome.status = outcome.observation.warning ? 'warning' : 'filled';
                outcome.error = outcome.observation.warning || '';
            } else {
                outcome.status = 'failed';
                outcome.error = '找不到數量欄位';
                errors.push(
                    outcome.observation.name + '（' + outcome.observation.code + '）：'
                    + outcome.error
                );
            }
        });

        for (const outcome of outcomes) {
            if (outcome.status === 'failed') {
                continue;
            }
            try {
                const details = await applyObservationDetails(
                    Object.assign({}, outcome.observation, { code: outcome.code })
                );
                outcome.breedingText = details.breedingText;
            } catch (error) {
                outcome.status = 'failed';
                outcome.error = error.message;
                errors.push(
                    outcome.observation.name + '（' + outcome.observation.code + '）：'
                    + error.message
                );
            }
        }

        const unresolved = Array.isArray(record.unresolvedObservations)
            ? record.unresolvedObservations
            : [];
        const hasItemIssues = outcomes.some(function(outcome) {
            return outcome.status === 'failed' || outcome.status === 'warning';
        }) || unresolved.length > 0;
        const complete = document.getElementById('all-spp-y');
        const formErrors = [];
        if (!complete) {
            formErrors.push('找不到完整清單選項');
        } else if (errors.length === 0 && !hasItemIssues) {
            complete.click();
        }
        errors.push.apply(errors, formErrors);
        unresolved.forEach(function(item) {
            errors.push(item.error);
        });

        const submit = document.getElementById('btn-continue');
        if (submit) {
            submit.dataset.tmEbirdManualOnly = 'true';
            submit.title = 'Tampermonkey 未按下此按鈕；請人工確認後自行送出。';
        }
        const orderedItems = orderOutcomesByChecklist(outcomes);
        return {
            filledCount: outcomes.filter(function(item) { return item.status !== 'failed'; }).length,
            totalCount: record.observations.length + unresolved.length,
            errors: errors,
            formErrors: formErrors,
            items: orderedItems,
            unresolved: unresolved,
            filledCodes: outcomes.filter(function(item) {
                return item.status !== 'failed';
            }).map(function(item) {
                return item.code;
            })
        };
    }

    function extractLocId(value) {
        const match = String(value || '').match(/L\d+/);
        return match ? match[0] : '';
    }

    function findLocationSelect() {
        const selects = Array.from(document.querySelectorAll('select')).filter(function(select) {
            let current = select;
            while (current) {
                if (current.id === panelId) {
                    return false;
                }
                current = current.parentElement;
            }
            return true;
        });
        let best = null;
        let bestScore = 0;
        selects.forEach(function(select) {
            const score = Array.from(select.options || []).filter(function(option) {
                return Boolean(extractLocId(option.value));
            }).length;
            if (score > bestScore) {
                best = select;
                bestScore = score;
            }
        });
        return bestScore > 0 ? best : null;
    }

    function getSelectedLocation(select) {
        if (!select) {
            return null;
        }
        const option = Array.from(select.options || []).find(function(item) {
            return String(item.value) === String(select.value);
        }) || (select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null);
        const locId = option ? extractLocId(option.value) : '';
        return locId ? {
            locId: locId,
            pageName: option.textContent.replace(/\s+/g, ' ').trim(),
            value: option.value
        } : null;
    }

    function filterLocationItems(items, query) {
        let candidates = items.slice();
        const accepted = [];
        Array.from(String(query || '').toLocaleLowerCase()).filter(function(character) {
            return !/\s/.test(character);
        }).forEach(function(character) {
            const next = candidates.filter(function(item) {
                return (String(item.text || '') + ' ' + String(item.value || '')).toLocaleLowerCase().includes(character);
            });
            if (next.length > 0) {
                candidates = next;
                accepted.push(character);
            }
        });
        return { items: candidates, acceptedCharacters: accepted };
    }

    function installLocationFilter(onChanged) {
        const select = findLocationSelect();
        if (!select || select.dataset.tmEbirdFilterInstalled === 'true') {
            return null;
        }
        select.dataset.tmEbirdFilterInstalled = 'true';
        const originals = Array.from(select.options || []).map(function(option) {
            return {
                value: option.value,
                text: option.textContent,
                disabled: option.disabled,
                selected: String(option.value) === String(select.value)
            };
        });
        const wrapper = document.createElement('div');
        wrapper.className = 'tm-ebird-location-filter';
        const label = document.createElement('label');
        label.textContent = '篩選地點（中英文皆可）';
        const input = document.createElement('input');
        input.type = 'search';
        input.autocomplete = 'off';
        input.placeholder = '每個字依序篩選；會造成零筆的字會忽略';
        label.appendChild(input);
        wrapper.appendChild(label);
        if (select.parentElement) {
            select.parentElement.insertBefore(wrapper, select);
        }
        select.classList.add('tm-ebird-location-select');

        function rebuild(query, preferredLocId) {
            const filtered = filterLocationItems(originals, query).items;
            const previousValue = select.value;
            select.textContent = '';
            filtered.forEach(function(item) {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.text;
                option.disabled = item.disabled;
                select.appendChild(option);
            });
            const preferred = filtered.find(function(item) {
                return preferredLocId && extractLocId(item.value) === preferredLocId;
            });
            const previous = filtered.find(function(item) { return String(item.value) === String(previousValue); });
            const firstLocation = filtered.find(function(item) { return Boolean(extractLocId(item.value)); });
            const selected = preferred || previous || firstLocation || filtered[0];
            if (selected) {
                select.value = selected.value;
            }
            if (typeof onChanged === 'function') {
                onChanged(getSelectedLocation(select));
            }
            return getSelectedLocation(select);
        }

        input.addEventListener('input', function() {
            rebuild(input.value, '');
            dispatchValueEvents(select);
        });
        select.addEventListener('change', function() {
            if (typeof onChanged === 'function') {
                onChanged(getSelectedLocation(select));
            }
        });
        return {
            select: select,
            input: input,
            originals: originals,
            rebuild: rebuild,
            selectLocId: function(locId) {
                input.value = '';
                return rebuild('', locId);
            },
            filter: function(query) {
                input.value = query;
                return rebuild(query, '');
            },
            current: function() {
                return getSelectedLocation(select);
            }
        };
    }

    function detectCurrentLocationName() {
        const link = document.getElementById('href_changeLoc') || document.getElementById('href_loc');
        if (!link) {
            return '';
        }
        const container = link.parentElement || link;
        return container.textContent.replace(link.textContent, '').trim();
    }

    function detectCurrentLocation(locationFilter) {
        const selected = locationFilter && locationFilter.current();
        if (selected) {
            return selected;
        }
        const locId = new URLSearchParams(location.search).get('locID') || '';
        return locId ? {
            locId: locId,
            pageName: detectCurrentLocationName() || locId,
            value: locId
        } : null;
    }

    function formatDateLabel(value) {
        const date = dateObject(value);
        return (date.getMonth() + 1) + '/' + date.getDate() + ' (' + weekdayNames[date.getDay()] + ')';
    }

    function createDatePicker(onChanged) {
        const label = document.createElement('label');
        label.className = 'tm-ebird-date-picker';
        label.textContent = '日期';
        const select = document.createElement('select');
        label.appendChild(select);
        const today = startOfDay(new Date());

        function ensure(value) {
            const iso = value.year + '-' + String(value.month).padStart(2, '0') + '-' + String(value.day).padStart(2, '0');
            let option = Array.from(select.options || []).find(function(item) { return item.value === iso; });
            if (!option) {
                option = document.createElement('option');
                option.value = iso;
                option.textContent = formatDateLabel(value);
                select.appendChild(option);
            }
            return iso;
        }

        for (let offset = 0; offset >= -6; offset -= 1) {
            const date = new Date(today);
            date.setDate(date.getDate() + offset);
            ensure(dateValue(date));
        }
        select.value = ensure(dateValue(today));
        select.addEventListener('change', function() {
            if (typeof onChanged === 'function') {
                onChanged();
            }
        });
        return {
            element: label,
            select: select,
            set: function(value) {
                select.value = ensure(value);
            },
            getDate: function() {
                const parts = select.value.split('-').map(Number);
                return new Date(parts[0], parts[1] - 1, parts[2]);
            }
        };
    }

    function getNonemptyLineIndexes(lines) {
        const indexes = [];
        lines.forEach(function(line, index) {
            if (line.trim()) {
                indexes.push(index);
            }
        });
        return indexes;
    }

    function analyzeRecordLines(text, fallbackDate, preset, selectedLocation) {
        const source = normalizeSource(text);
        const lines = source.split('\n');
        const indexes = getNonemptyLineIndexes(lines);
        const results = lines.map(function() { return { text: '', error: false }; });
        let cursor = 0;
        let failureCount = 0;
        let blockingFailureCount = 0;
        const parsedDate = parseFlexibleDate(
            indexes.length ? lines[indexes[0]].trim() : '',
            fallbackDate
        );
        if (parsedDate.consumed) {
            const lineIndex = indexes[cursor++];
            results[lineIndex] = {
                text: parsedDate.error || formatDateLabel(parsedDate.value),
                error: Boolean(parsedDate.error)
            };
            if (parsedDate.error) {
                failureCount += 1;
                blockingFailureCount += 1;
            }
        }

        const locationIndex = indexes[cursor++];
        const effortIndex = indexes[cursor++];
        if (locationIndex === undefined) {
            failureCount += 1;
            blockingFailureCount += 1;
        } else {
            const location = selectedLocation || (preset ? {
                locId: preset.locId,
                pageName: preset.pageName
            } : null);
            const locationMatches = location
                && (!preset || !selectedLocation || preset.locId === selectedLocation.locId);
            results[locationIndex] = locationMatches ? {
                text: location.pageName + '（' + location.locId + '）',
                error: false
            } : location ? {
                text: location.pageName + '（' + location.locId + '）與簡稱設定不符',
                error: true
            } : {
                text: '找不到可對應的 eBird 地點',
                error: true
            };
            if (!locationMatches) {
                failureCount += 1;
                blockingFailureCount += 1;
            }
        }

        if (effortIndex === undefined) {
            failureCount += 1;
            blockingFailureCount += 1;
        } else {
            const effortText = lines[effortIndex].trim();
            const match = effortText.match(/^(\d{1,2})[：:](\d{1,2})\s*開始\s*(\d+)\s*分鐘$/);
            const valid = match
                && Number(match[1]) <= 23
                && Number(match[2]) <= 59
                && Number(match[3]) > 0;
            results[effortIndex] = valid ? {
                text: String(match[1]).padStart(2, '0') + ':'
                    + String(match[2]).padStart(2, '0') + '／'
                    + match[3] + ' 分鐘',
                error: false
            } : {
                text: '無法辨識開始時間與分鐘',
                error: true
            };
            if (!valid) {
                failureCount += 1;
                blockingFailureCount += 1;
            }
        }

        const seenObservations = new Map();
        let speciesLineCount = 0;
        for (; cursor < indexes.length; cursor += 1) {
            speciesLineCount += 1;
            const index = indexes[cursor];
            const parsed = parseObservationLine(lines[index].trim());
            if (parsed.error) {
                results[index] = { text: parsed.error, error: true };
                failureCount += 1;
                continue;
            }
            const observation = parsed.value;
            const previous = seenObservations.get(observation.code);
            const conflicts = previous
                && (previous.count !== observation.count
                    || previous.breedingCode !== observation.breedingCode
                    || previous.comments !== observation.comments);
            seenObservations.set(observation.code, previous || observation);
            const display = formatObservationForEbird(observation);
            results[index] = {
                text: conflicts
                    ? display + '（與前一筆同鳥種紀錄不同）'
                    : parsed.warning ? display + '（' + parsed.warning + '）' : display,
                error: Boolean(conflicts || parsed.warning)
            };
            failureCount += conflicts || parsed.warning ? 1 : 0;
        }
        if (speciesLineCount === 0) {
            failureCount += 1;
            blockingFailureCount += 1;
        }
        return {
            lines: results,
            failureCount: failureCount,
            blockingFailureCount: blockingFailureCount,
            parsedDate: parsedDate
        };
    }

    function addStyle() {
        if (document.getElementById(styleId)) {
            return;
        }
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = [
            '#' + panelId + ' { box-sizing:border-box;position:fixed;z-index:2147483647;right:12px;top:12px;width:min(780px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow-y:auto;overscroll-behavior:contain;padding:0;border:2px solid #2f7f45;border-radius:8px;background:#fff;color:#222;box-shadow:0 4px 18px #0004;font:14px/1.5 sans-serif; }',
            '#' + panelId + ' .tm-ebird-header { position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#fff;border-bottom:1px solid #ddd; }',
            '#' + panelId + ' .tm-ebird-collapse { min-width:36px;padding:5px 9px;font-size:16px; }',
            '#' + panelId + ' .tm-ebird-body { padding:10px 12px 12px; }',
            '#' + panelId + ' .tm-ebird-body[hidden] { display:none; }',
            '#' + panelId + ' button { padding:7px 12px;border:0;border-radius:5px;background:#2f7f45;color:#fff;cursor:pointer; }',
            '#' + panelId + ' button:disabled { opacity:.55;cursor:default; }',
            '#' + panelId + ' input,#' + panelId + ' select { box-sizing:border-box;width:100%;padding:7px; }',
            '#' + panelId + ' label { display:block;margin-top:7px;font-size:12px; }',
            '#' + panelId + ' .tm-ebird-record-grid { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0; }',
            '#' + panelId + ' textarea { box-sizing:border-box;width:100%;min-height:min(260px,42vh);margin:0;padding:8px;resize:vertical;line-height:1.5;white-space:pre;overflow:auto; }',
            '#' + panelId + ' .tm-ebird-preview { box-sizing:border-box;min-height:min(260px,42vh);overflow:auto;padding:8px;border:1px solid #aaa;background:#f7f7f7;white-space:pre;line-height:1.5; }',
            '#' + panelId + ' .tm-ebird-preview-line { min-height:1.5em; }',
            '#' + panelId + ' .tm-ebird-preview-line.tm-ebird-error { font-weight:600; }',
            '#' + panelId + ' .tm-ebird-action-row { display:flex;align-items:center;flex-wrap:wrap;gap:8px; }',
            '#' + panelId + ' .tm-ebird-settings { margin-top:10px;padding-top:10px;border-top:1px solid #bbb; }',
            '#' + panelId + ' .tm-ebird-settings-body[hidden] { display:none; }',
            '#' + panelId + ' .tm-ebird-settings-actions { display:flex;flex-wrap:wrap;gap:6px;margin-top:9px; }',
            '#' + panelId + ' .tm-ebird-secondary { background:#666; }',
            '#' + panelId + ' .tm-ebird-danger { background:#9a2929; }',
            '#' + panelId + ' .tm-ebird-local-note { margin:6px 0;color:#555;font-size:12px; }',
            '#' + panelId + ' .tm-ebird-status { margin-top:8px;white-space:pre-wrap; }',
            '#' + panelId + ' .tm-ebird-check-summary > div { margin:3px 0; }',
            '#' + panelId + ' .tm-ebird-summary-heading { margin-top:9px;font-weight:700; }',
            '#' + panelId + ' .tm-ebird-error { color:#a40000; }',
            '#' + panelId + ' .tm-ebird-ok { color:#176b2c; }',
            '.tm-ebird-location-filter,.tm-ebird-location-select { box-sizing:border-box!important;width:100%!important;max-width:none!important; }',
            '.tm-ebird-location-filter input { box-sizing:border-box;width:100%;padding:8px; }',
            '.tm-ebird-unobserved-hidden { display:none!important; }',
            '@media (max-width:700px) { #' + panelId + ' { right:6px;top:6px;width:calc(100vw - 12px);max-height:calc(100dvh - 12px); } #' + panelId + ' .tm-ebird-record-grid { grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px; } #' + panelId + ' .tm-ebird-body { padding:8px; } #' + panelId + ' textarea,#' + panelId + ' .tm-ebird-preview { min-height:42vh;padding:5px;font-size:12px; } }'
        ].join('\n');
        document.head.appendChild(style);
    }

    function createSettingsEditor(getCurrentLocation, onChanged) {
        const section = document.createElement('div');
        section.className = 'tm-ebird-settings';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'tm-ebird-secondary';
        toggle.textContent = '新增／管理地點';
        const body = document.createElement('div');
        body.className = 'tm-ebird-settings-body';
        body.hidden = true;
        const note = document.createElement('p');
        note.className = 'tm-ebird-local-note';
        note.textContent = '選取 eBird 地點後會直接帶入 ID 與完整名稱；設定只存在 Tampermonkey 本機。';
        const existing = document.createElement('select');

        function addInput(labelText, type) {
            const label = document.createElement('label');
            label.textContent = labelText;
            const input = document.createElement('input');
            input.type = type || 'text';
            label.appendChild(input);
            body.appendChild(label);
            return input;
        }

        body.append(note, existing);
        const alias = addInput('文字紀錄中的地點簡稱');
        const locId = addInput('eBird 地點 ID（L 開頭）');
        const pageName = addInput('eBird 完整名稱');
        const distanceKm = addInput('預設距離（公里）', 'number');
        distanceKm.min = '0.01';
        distanceKm.step = '0.01';
        const partySize = addInput('預設人數', 'number');
        partySize.min = '1';
        partySize.step = '1';
        partySize.value = '1';
        const actions = document.createElement('div');
        actions.className = 'tm-ebird-settings-actions';
        const capture = document.createElement('button');
        capture.type = 'button';
        capture.className = 'tm-ebird-secondary';
        capture.textContent = '重新帶入目前選取地點';
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = '儲存地點設定';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'tm-ebird-danger';
        remove.textContent = '刪除';
        const status = document.createElement('div');
        status.className = 'tm-ebird-status';
        actions.append(capture, save, remove);
        body.append(actions, status);

        function loadPreset(selectedAlias) {
            const preset = getLocationPresets()[selectedAlias];
            alias.value = selectedAlias || '';
            locId.value = preset ? preset.locId : '';
            pageName.value = preset ? preset.pageName : '';
            distanceKm.value = preset ? preset.distanceKm : '';
            partySize.value = preset ? preset.partySize : '1';
            remove.disabled = !preset;
        }

        function refresh(selectedAlias) {
            existing.textContent = '';
            const addOption = document.createElement('option');
            addOption.value = '';
            addOption.textContent = '新增地點…';
            existing.appendChild(addOption);
            Object.keys(getLocationPresets()).sort().forEach(function(name) {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                existing.appendChild(option);
            });
            existing.value = selectedAlias || '';
            loadPreset(selectedAlias || '');
        }

        function captureCurrent(showMessage) {
            const current = getCurrentLocation();
            if (!current) {
                if (showMessage) {
                    status.textContent = '找不到目前選取的 eBird 地點，請先在地點清單選一項。';
                    status.className = 'tm-ebird-status tm-ebird-error';
                }
                return null;
            }
            locId.value = current.locId;
            pageName.value = current.pageName;
            if (showMessage) {
                status.textContent = '已帶入「' + current.pageName + '」。';
                status.className = 'tm-ebird-status tm-ebird-ok';
            }
            return current;
        }

        function prepareUnknown(locationAlias, current) {
            body.hidden = false;
            existing.value = '';
            alias.value = locationAlias;
            locId.value = current ? current.locId : '';
            pageName.value = current ? current.pageName : '';
            distanceKm.value = '';
            partySize.value = '1';
            remove.disabled = true;
            status.textContent = current
                ? '這是新的地點簡稱；確認地點後填寫預設距離與人數，再按「開始填寫紀錄」。'
                : '這是新的地點簡稱；請先選擇 eBird 地點。';
            status.className = 'tm-ebird-status ' + (current ? '' : 'tm-ebird-error');
        }

        toggle.addEventListener('click', function() { body.hidden = !body.hidden; });
        existing.addEventListener('change', function() {
            loadPreset(existing.value);
            if (typeof onChanged === 'function') {
                onChanged();
            }
        });
        capture.addEventListener('click', function() {
            captureCurrent(true);
            if (typeof onChanged === 'function') {
                onChanged();
            }
        });
        save.addEventListener('click', function() {
            try {
                saveLocationPreset(alias.value, {
                    locId: locId.value,
                    pageName: pageName.value,
                    distanceKm: distanceKm.value,
                    partySize: partySize.value
                });
                const savedAlias = alias.value.trim();
                refresh(savedAlias);
                status.textContent = '已在本機儲存「' + savedAlias + '」。';
                status.className = 'tm-ebird-status tm-ebird-ok';
                if (typeof onChanged === 'function') {
                    onChanged();
                }
            } catch (error) {
                status.textContent = error.message;
                status.className = 'tm-ebird-status tm-ebird-error';
            }
        });
        remove.addEventListener('click', function() {
            const selectedAlias = existing.value;
            if (!selectedAlias) {
                return;
            }
            deleteLocationPreset(selectedAlias);
            refresh('');
            status.textContent = '已刪除「' + selectedAlias + '」。';
            status.className = 'tm-ebird-status tm-ebird-ok';
            if (typeof onChanged === 'function') {
                onChanged();
            }
        });
        [distanceKm, partySize, alias, locId, pageName].forEach(function(input) {
            input.addEventListener('input', function() {
                if (typeof onChanged === 'function') {
                    onChanged();
                }
            });
        });

        refresh('');
        section.append(toggle, body);
        return {
            element: section,
            body: body,
            fields: {
                alias: alias,
                locId: locId,
                pageName: pageName,
                distanceKm: distanceKm,
                partySize: partySize
            },
            refresh: refresh,
            prepareUnknown: prepareUnknown,
            captureCurrent: captureCurrent,
            savePending: function(locationAlias) {
                if (getLocationPresets()[locationAlias]) {
                    return getLocationPresets()[locationAlias];
                }
                return saveLocationPreset(locationAlias, {
                    locId: locId.value,
                    pageName: pageName.value,
                    distanceKm: distanceKm.value,
                    partySize: partySize.value
                });
            }
        };
    }

    function extractLocationAlias(text, fallbackDate) {
        const lines = normalizeSource(text).split('\n').map(function(line) { return line.trim(); }).filter(Boolean);
        const parsedDate = parseFlexibleDate(lines[0], fallbackDate);
        return lines[parsedDate.consumed ? 1 : 0] || '';
    }

    function createRecordEditor(body, status, isEffortPage) {
        let locationFilter = null;
        let settings = null;
        let datePicker = null;
        let updating = false;
        let lastAutoLocationKey = '';
        const grid = document.createElement('div');
        grid.className = 'tm-ebird-record-grid';
        const textarea = document.createElement('textarea');
        textarea.placeholder = '貼上日期、地點、時間與物種紀錄';
        const preview = document.createElement('div');
        preview.className = 'tm-ebird-preview';
        preview.setAttribute('aria-label', '逐行辨識結果');
        grid.append(textarea, preview);
        const actionRow = document.createElement('div');
        actionRow.className = 'tm-ebird-action-row';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '開始填寫紀錄';
        const failure = document.createElement('span');
        failure.className = 'tm-ebird-error';
        actionRow.append(button, failure);

        function selectedLocation() {
            return detectCurrentLocation(locationFilter);
        }

        function renderPreview(analysis) {
            preview.textContent = '';
            analysis.lines.forEach(function(item) {
                const row = document.createElement('div');
                row.className = 'tm-ebird-preview-line' + (item.error ? ' tm-ebird-error' : '');
                row.textContent = item.text || '\u00a0';
                preview.appendChild(row);
            });
            failure.textContent = analysis.failureCount > 0
                ? '仍有 ' + analysis.failureCount + ' 項辨識失敗'
                : '';
        }

        function refresh() {
            if (updating) {
                return null;
            }
            updating = true;
            try {
                const fallback = datePicker.getDate();
                const alias = extractLocationAlias(textarea.value, fallback);
                const presets = getLocationPresets();
                const known = presets[alias] || null;
                const autoLocationKey = alias + '|' + (known ? known.locId : 'new');
                if (alias && locationFilter && autoLocationKey !== lastAutoLocationKey) {
                    if (known) {
                        locationFilter.selectLocId(known.locId);
                    } else {
                        locationFilter.filter(alias);
                    }
                    lastAutoLocationKey = autoLocationKey;
                }
                const current = selectedLocation() || (known ? {
                    locId: known.locId,
                    pageName: known.pageName
                } : null);
                if (alias && !known && settings && settings.fields.alias.value !== alias) {
                    settings.prepareUnknown(alias, current);
                } else if (alias && !known && settings && current) {
                    settings.fields.locId.value = current.locId;
                    settings.fields.pageName.value = current.pageName;
                }
                const firstLine = normalizeSource(textarea.value).split('\n').find(function(line) { return line.trim(); }) || '';
                const parsedDate = parseFlexibleDate(firstLine.trim(), fallback);
                if (parsedDate.consumed && !parsedDate.error) {
                    datePicker.set(parsedDate.value);
                }
                const analysis = analyzeRecordLines(textarea.value, datePicker.getDate(), known, current);
                renderPreview(analysis);
                return {
                    alias: alias,
                    known: known,
                    current: current,
                    analysis: analysis
                };
            } finally {
                updating = false;
            }
        }

        datePicker = createDatePicker(refresh);
        settings = createSettingsEditor(selectedLocation, refresh);
        body.append(datePicker.element, grid, actionRow, status, settings.element);
        locationFilter = installLocationFilter(function() {
            const alias = extractLocationAlias(textarea.value, datePicker.getDate());
            if (alias && !getLocationPresets()[alias] && settings) {
                const current = selectedLocation();
                if (current) {
                    settings.fields.locId.value = current.locId;
                    settings.fields.pageName.value = current.pageName;
                }
            }
            refresh();
        });

        textarea.addEventListener('input', refresh);
        textarea.addEventListener('scroll', function() {
            preview.scrollTop = textarea.scrollTop;
            preview.scrollLeft = textarea.scrollLeft;
        });
        button.addEventListener('click', async function() {
            const state = refresh();
            if (!state || state.analysis.blockingFailureCount > 0) {
                status.textContent = '日期、地點或時間仍有錯誤，請先修正右側紅字項目。';
                status.className = 'tm-ebird-status tm-ebird-error';
                return;
            }
            try {
                if (!state.known) {
                    settings.savePending(state.alias);
                }
                const record = parseRecord(textarea.value, datePicker.getDate(), getLocationPresets());
                assertRecordReady(record);
                button.disabled = true;
                status.textContent = record.warnings.join('\n');
                status.className = 'tm-ebird-status';
                if (isEffortPage) {
                    await fillEffort(record);
                } else {
                    startRecord(record);
                }
            } catch (error) {
                status.textContent = error.message;
                status.className = 'tm-ebird-status tm-ebird-error';
                button.disabled = false;
            }
        });

        if (!locationFilter) {
            let attempts = 0;
            const timer = setInterval(function() {
                attempts += 1;
                locationFilter = installLocationFilter(function() {
                    const alias = extractLocationAlias(textarea.value, datePicker.getDate());
                    if (alias && !getLocationPresets()[alias] && settings) {
                        const current = selectedLocation();
                        if (current) {
                            settings.fields.locId.value = current.locId;
                            settings.fields.pageName.value = current.pageName;
                        }
                    }
                    refresh();
                });
                if (locationFilter || attempts >= 30) {
                    clearInterval(timer);
                    refresh();
                }
            }, 250);
        }
        refresh();
        return { textarea: textarea, button: button, refresh: refresh };
    }

    function addSpeciesVisibilityButton(parent) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tm-ebird-secondary';
        let hidden = true;
        function apply() {
            setUnobservedVisibility(hidden);
            button.textContent = hidden
                ? '顯示未觀察到的鳥種項目'
                : '隱藏未觀察到的鳥種項目';
        }
        button.addEventListener('click', function() {
            hidden = !hidden;
            apply();
        });
        parent.appendChild(button);
        return { button: button, apply: apply };
    }

    function renderChecklistSummary(container, record, result) {
        container.textContent = '';
        container.className = 'tm-ebird-status tm-ebird-check-summary';

        function appendLine(text, className) {
            const line = document.createElement('div');
            line.className = className || '';
            line.textContent = text;
            container.appendChild(line);
            return line;
        }

        const preset = getLocationPresets()[record.location];
        const locationName = preset ? preset.pageName : record.location;
        const locationId = preset ? preset.locId : '';
        appendLine('地點：' + locationName
            + (record.location && record.location !== locationName ? '（' + record.location + '）' : '')
            + (locationId ? '；' + locationId : ''));
        appendLine('日期：' + formatDateLabel(record.date));
        if (record.effort) {
            appendLine(
                '時間：' + String(record.effort.hour).padStart(2, '0') + ':'
                + String(record.effort.minute).padStart(2, '0') + ' 開始；'
                + record.effort.durationMinutes + ' 分鐘；'
                + record.effort.distanceKm + ' 公里；'
                + record.effort.partySize + ' 人'
            );
        }
        appendLine(
            '填寫結果：成功 ' + result.filledCount + '/' + result.totalCount
            + ' 項（鳥種依 eBird 頁面順序）',
            'tm-ebird-summary-heading'
        );

        result.items.forEach(function(item) {
            const successful = item.status === 'filled';
            const prefix = successful ? '✓ ' : item.status === 'warning' ? '⚠ ' : '✗ ';
            appendLine(
                prefix + item.display + (item.error ? ' — ' + item.error : ''),
                successful ? 'tm-ebird-ok' : 'tm-ebird-error'
            );
        });
        result.unresolved.forEach(function(item) {
            appendLine(
                '✗ 未辨識：' + item.sourceLine + ' — ' + item.error,
                'tm-ebird-error'
            );
        });
        result.formErrors.forEach(function(error) {
            appendLine('✗ 表單：' + error, 'tm-ebird-error');
        });

        const hasProblems = result.items.some(function(item) {
            return item.status !== 'filled';
        }) || result.unresolved.length > 0 || result.formErrors.length > 0;
        appendLine(
            hasProblems
                ? '未勾選完整清單，也未送出。'
                : '已勾選完整清單；尚未送出，請人工確認。',
            hasProblems ? 'tm-ebird-error' : 'tm-ebird-ok'
        );
    }

    function createPanel() {
        if (document.getElementById(panelId)) {
            return document.getElementById(panelId);
        }
        addStyle();
        const panel = document.createElement('section');
        panel.id = panelId;
        const header = document.createElement('div');
        header.className = 'tm-ebird-header';
        const title = document.createElement('strong');
        title.textContent = 'eBird 文字輸入助手';
        const collapse = document.createElement('button');
        collapse.type = 'button';
        collapse.className = 'tm-ebird-collapse';
        collapse.setAttribute('aria-label', '展開或收合 eBird 文字輸入助手');
        const body = document.createElement('div');
        body.className = 'tm-ebird-body';
        const status = document.createElement('div');
        status.className = 'tm-ebird-status';
        const mobile = (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) || window.innerWidth <= 700;

        function setCollapsed(collapsed) {
            body.hidden = collapsed;
            collapse.textContent = collapsed ? '▼' : '▲';
            collapse.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
        collapse.addEventListener('click', function() { setCollapsed(!body.hidden); });
        header.append(title, collapse);
        panel.append(header, body);

        const isEffortPage = location.pathname.endsWith('/submit/effort');
        const isChecklistPage = location.pathname.endsWith('/submit/checklist');
        if (isChecklistPage) {
            const pending = sessionStorage.getItem(storageKey);
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = '重新填入物種';
            const visibility = addSpeciesVisibilityButton(body);
            body.append(button, status);
            if (!pending) {
                status.textContent = '沒有待填紀錄；請回到前一頁貼上文字。';
                status.className = 'tm-ebird-status tm-ebird-error';
                button.disabled = true;
                visibility.apply();
            } else {
                const record = JSON.parse(pending);
                const run = async function() {
                    button.disabled = true;
                    try {
                        setUnobservedVisibility(false);
                        const result = await fillSpecies(record);
                        visibility.apply();
                        renderChecklistSummary(status, record, result);
                    } catch (error) {
                        status.textContent = error.message;
                        status.className = 'tm-ebird-status tm-ebird-error';
                    } finally {
                        button.disabled = false;
                    }
                };
                button.addEventListener('click', run);
                setTimeout(run, 0);
            }
        } else {
            const controls = createRecordEditor(body, status, isEffortPage);
            const pending = sessionStorage.getItem(storageKey);
            if (isEffortPage && pending && sessionStorage.getItem(autoEffortKey) === 'true') {
                sessionStorage.removeItem(autoEffortKey);
                const record = JSON.parse(pending);
                controls.textarea.value = record.source;
                controls.refresh();
                controls.button.disabled = true;
                setTimeout(async function() {
                    try {
                        await fillEffort(record);
                    } catch (error) {
                        status.textContent = error.message;
                        status.className = 'tm-ebird-status tm-ebird-error';
                        controls.button.disabled = false;
                    }
                }, 0);
            }
        }
        document.body.appendChild(panel);
        setCollapsed(mobile);
        return panel;
    }

    const api = {
        getLocationPresets: getLocationPresets,
        saveLocationPreset: saveLocationPreset,
        deleteLocationPreset: deleteLocationPreset,
        speciesAliases: speciesAliases,
        parseFlexibleDate: parseFlexibleDate,
        parseRecord: parseRecord,
        parseObservationLine: parseObservationLine,
        formatObservationForEbird: formatObservationForEbird,
        analyzeRecordLines: analyzeRecordLines,
        filterLocationItems: filterLocationItems,
        extractLocId: extractLocId,
        startRecord: startRecord,
        fillEffort: fillEffort,
        fillSpecies: fillSpecies,
        revealAdditionalSpeciesSections: revealAdditionalSpeciesSections,
        setUnobservedVisibility: setUnobservedVisibility,
        storageKey: storageKey,
        autoEffortKey: autoEffortKey
    };
    globalThis.__ebirdTextInputAssistant = api;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createPanel, { once: true });
    } else {
        createPanel();
    }
})();