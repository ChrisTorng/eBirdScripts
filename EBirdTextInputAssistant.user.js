// ==UserScript==
// @name         eBird Text Input Assistant
// @namespace    http://tampermonkey.net/
// @version      2026-09-05_1.5.0
// @description  Parse compact Taiwan birding notes, preview every line, select locations, and fill eBird forms without submitting them.
// @author       ChrisTorng
// @homepage     https://github.com/ChrisTorng/eBirdScripts/
// @downloadURL  https://github.com/ChrisTorng/eBirdScripts/raw/main/EBirdTextInputAssistant.user.js
// @updateURL    https://github.com/ChrisTorng/eBirdScripts/raw/main/EBirdTextInputAssistant.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ebird.org
// @match        https://ebird.org/*/submit*
// @match        https://ebird.org/checklist/*
// @match        https://ebird.org/*/checklist/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function() {
    'use strict';

    const storageKey = 'ebirdTextInputAssistant:pendingRecord';
    const autoEffortKey = 'ebirdTextInputAssistant:autoEffort';
    const confirmationKey = 'ebirdTextInputAssistant:lastConfirmation';
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

    function protocolForDistance(distanceKm) {
        if (distanceKm === null || distanceKm === undefined || distanceKm === '') {
            return 'P20';
        }
        const distance = Number(distanceKm);
        if (!Number.isFinite(distance) || distance < 0) {
            throw new Error('距離必須是 0 以上的數字，或選擇「附帶紀錄」。');
        }
        return distance <= 0.03 ? 'P21' : 'P22';
    }

    function getDefaultLocationPreset(presets = getLocationPresets()) {
        const entry = Object.entries(presets).find(function(item) {
            return item[1] && item[1].isDefault === true;
        });
        return entry ? { alias: entry[0], preset: entry[1] } : null;
    }

    function findLocationPresetById(locId, presets = getLocationPresets()) {
        const entry = Object.entries(presets).find(function(item) {
            return item[1] && item[1].locId === locId;
        });
        return entry ? { alias: entry[0], preset: entry[1] } : null;
    }

    function saveLocationPreset(alias, values) {
        const normalizedAlias = String(alias || '').trim();
        const locId = String(values.locId || '').trim();
        const pageName = String(values.pageName || '').trim() || normalizedAlias;
        const distanceMissing = values.distanceKm === null
            || values.distanceKm === undefined
            || String(values.distanceKm).trim() === '';
        const incidental = values.effortMode === 'incidental'
            || (values.effortMode !== 'distance' && distanceMissing);
        if (!incidental && distanceMissing) {
            throw new Error('請填寫預設距離，或選擇「附帶紀錄」。');
        }
        const distanceKm = incidental ? null : Number(values.distanceKm);
        const protocol = protocolForDistance(distanceKm);
        const partySize = Number(values.partySize || 1);
        const isDefault = values.isDefault === true;
        if (!normalizedAlias || !/^L\d+$/.test(locId)) {
            throw new Error('請填寫簡稱與 L 開頭的 eBird 地點 ID。');
        }
        if (!incidental && (!Number.isFinite(distanceKm) || distanceKm < 0)) {
            throw new Error('距離必須是 0 以上的數字，或選擇「附帶紀錄」。');
        }
        if (!Number.isInteger(partySize) || partySize < 1) {
            throw new Error('人數必須是大於 0 的整數。');
        }
        const presets = getLocationPresets();
        if (isDefault) {
            Object.keys(presets).forEach(function(name) {
                presets[name].isDefault = false;
            });
        }
        presets[normalizedAlias] = {
            locId: locId,
            pageName: pageName,
            protocol: protocol,
            distanceKm: distanceKm,
            partySize: partySize,
            isDefault: isDefault
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

    function parseDate(line, referenceDate) {
        return parseFlexibleDate(line, referenceDate);
    }

    function normalizeSource(text) {
        return String(text || '')
            .replace(/&(?:#x20|#32|nbsp);/gi, ' ')
            .replace(/\u00a0/g, ' ')
            .replace(/\r/g, '');
    }

    function parseEffortLine(line) {
        const match = String(line || '').trim().match(/^(\d{1,2})[：:](\d{1,2})\s*開始\s*(\d+)\s*分鐘$/);
        if (!match) {
            return null;
        }
        return {
            hour: Number(match[1]),
            minute: Number(match[2]),
            durationMinutes: Number(match[3]),
            valid: Number(match[1]) <= 23 && Number(match[2]) <= 59 && Number(match[3]) > 0
        };
    }

    function parseObservationLine(line) {
        const text = String(line || '').trim();
        const aliases = Object.keys(speciesAliases).sort(function(left, right) {
            return right.length - left.length;
        });
        let match = null;
        let alias = '';
        for (const candidate of aliases) {
            if (!text.startsWith(candidate)) {
                continue;
            }
            const remainder = text.slice(candidate.length);
            const candidateMatch = remainder.match(/^\s*(\d+)(?:\s*[；;]?\s*(.*))?$/);
            if (candidateMatch) {
                alias = candidate;
                match = candidateMatch;
                break;
            }
        }
        if (!match) {
            const fallback = text.match(/^(.+?)\s*(\d+)(?:\s*[；;]?\s*(.*))?$/);
            if (!fallback) {
                return { error: '無法解析物種紀錄：' + (line || '（未填）') };
            }
            alias = fallback[1].trim();
            match = [fallback[0], fallback[2], fallback[3]];
        }
        const species = speciesAliases[alias];
        if (!species) {
            return { error: '不確定的物種：' + alias };
        }
        const count = Number(match[1]);
        const details = (match[2] || '').replace(/，/g, ',').trim();
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

    function parseRecord(text, fallbackDate = new Date(), locationPresets = getLocationPresets(), dateReference = fallbackDate) {
        const normalizedSource = normalizeSource(text);
        const lines = normalizedSource.split('\n').map(function(line) { return line.trim(); }).filter(Boolean);
        const errors = [];
        const blockingErrors = [];
        const warnings = [];
        const unresolvedObservations = [];
        let index = 0;

        const parsedDate = parseDate(lines[index], dateReference);
        const date = parsedDate.consumed
            ? parsedDate.value
            : dateValue(startOfDay(fallbackDate));
        if (parsedDate.consumed) {
            index += 1;
            if (parsedDate.error) {
                errors.push(parsedDate.error);
                blockingErrors.push(parsedDate.error);
            }
        } else {
            warnings.push('未提供日期，已使用選取日期。');
        }

        const defaultLocation = getDefaultLocationPreset(locationPresets);
        const locationOmitted = Boolean(parseEffortLine(lines[index]));
        const locationName = locationOmitted
            ? (defaultLocation ? defaultLocation.alias : '')
            : (lines[index++] || '');
        const preset = locationPresets[locationName];
        if (locationOmitted && preset) {
            warnings.push('未提供地點，已使用預設地點「' + locationName + '」。');
        } else if (locationOmitted) {
            const error = '未提供地點，且尚未設定預設地點。';
            errors.push(error);
            blockingErrors.push(error);
        } else if (!preset) {
            const error = '尚未設定的地點：' + (locationName || '（未填）');
            errors.push(error);
            blockingErrors.push(error);
        }

        const effortLine = lines[index++] || '';
        const parsedEffort = parseEffortLine(effortLine);
        const effort = parsedEffort ? {
            hour: parsedEffort.hour,
            minute: parsedEffort.minute,
            durationMinutes: parsedEffort.durationMinutes,
            protocol: preset ? protocolForDistance(preset.distanceKm) : 'P20',
            distanceKm: preset && preset.distanceKm !== undefined ? preset.distanceKm : null,
            partySize: preset ? preset.partySize : 1
        } : null;
        if (!parsedEffort) {
            const error = '無法解析開始時間與分鐘：' + (effortLine || '（未填）');
            errors.push(error);
            blockingErrors.push(error);
        } else if (!parsedEffort.valid) {
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
            locationId: preset ? preset.locId : '',
            locationPageName: preset ? preset.pageName : '',
            usedDefaultLocation: locationOmitted && Boolean(preset),
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

    function findFormField(ids, nameFragments) {
        for (const id of ids || []) {
            const element = document.getElementById(id);
            if (element) {
                return element;
            }
        }
        const fragments = (nameFragments || []).map(function(item) {
            return String(item).toLowerCase();
        });
        if (fragments.length === 0) {
            return null;
        }
        return Array.from(document.querySelectorAll('input,select,textarea')).find(function(element) {
            const key = (String(element.name || '') + ' ' + String(element.id || '')).toLowerCase();
            return fragments.some(function(fragment) { return key.includes(fragment); });
        }) || null;
    }

    function fieldValue(ids, nameFragments) {
        const field = findFormField(ids, nameFragments);
        return field ? String(field.value === undefined ? '' : field.value).trim() : null;
    }

    function normalizeAmPm(value, text) {
        const source = (String(value || '') + ' ' + String(text || '')).toLowerCase();
        return source.includes('pm') || source.includes('下午') || /^p(?:\s|$)/.test(source)
            ? 'PM'
            : 'AM';
    }

    function readEffortFormState(record, preset) {
        const month = fieldValue(['p-month'], ['obsmonth', 'month']);
        const day = fieldValue(['p-day'], ['obsday', 'day']);
        const year = fieldValue(['p-year'], ['obsyear', 'year']);
        const hourField = findFormField(['p-shared-hr'], ['shared-hr', 'starthour']);
        const minuteField = findFormField(['p-shared-min'], ['shared-min', 'startminute']);
        const ampmField = findFormField(['p-shared-ampm'], ['shared-ampm', 'ampm']);
        const hour12 = hourField ? Number(hourField.value) : null;
        const minute = minuteField ? Number(minuteField.value) : null;
        const ampm = ampmField
            ? normalizeAmPm(ampmField.value, selectedOptionText(ampmField))
            : null;
        const hour24 = hour12 === null || ampm === null
            ? null
            : (hour12 % 12) + (ampm === 'PM' ? 12 : 0);
        const selectedProtocol = ['P20', 'P21', 'P22'].find(function(id) {
            const field = document.getElementById(id);
            return field && (field.checked === true || field.getAttribute('aria-checked') === 'true');
        }) || null;
        const protocolFieldValue = fieldValue(
            ['protocol', 'p-protocol'],
            ['protocol', 'efforttype']
        );
        const protocol = selectedProtocol
            || (protocolFieldValue && protocolFieldValue.match(/P2[012]/i)
                ? protocolFieldValue.match(/P2[012]/i)[0].toUpperCase()
                : null);
        const durationHours = fieldValue(['p-dur-hrs'], ['dur-hrs', 'durationhours']);
        const durationMinutes = fieldValue(['p-dur-min'], ['dur-min', 'durationminutes']);
        const distance = fieldValue(['p-dist'], ['distance', 'dist']);
        const partySize = fieldValue(['p-party-size'], ['party-size', 'partysize']);
        const hiddenLocId = fieldValue(['locID', 'locId', 'p-loc-id'], ['locid', 'locationid']);
        const queryLocId = new URLSearchParams(location.search).get('locID');
        const detectedLocationName = detectCurrentLocationName();
        const locationName = detectedLocationName
            || (preset && document.body && document.body.textContent.includes(preset.pageName)
                ? preset.pageName
                : null);
        const totalDuration = durationHours === null && durationMinutes === null
            ? null
            : (Number(durationHours || 0) * 60) + Number(durationMinutes || 0);
        return {
            locationId: queryLocId || hiddenLocId || null,
            locationName: locationName || null,
            date: month === null || day === null || year === null ? null : {
                year: Number(year),
                month: Number(month),
                day: Number(day)
            },
            time: hour24 === null || minute === null ? null : {
                hour: hour24,
                minute: minute,
                hour12: hour12,
                ampm: ampm
            },
            protocol: protocol,
            durationMinutes: Number.isFinite(totalDuration) ? totalDuration : null,
            distanceKm: distance === null || distance === '' ? null : Number(distance),
            partySize: partySize === null || partySize === '' ? null : Number(partySize),
            expectedLocationName: preset ? preset.pageName : null
        };
    }

    async function fillEffort(record, options = {}) {
        assertRecordReady(record);
        const preset = getLocationPresets()[record.location] || (record.locationId ? {
            locId: record.locationId,
            pageName: record.locationPageName || record.location
        } : null);
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
            throw new Error('找不到 eBird 努力量選項：' + record.effort.protocol);
        }
        protocol.click();
        protocol.checked = true;
        dispatchValueEvents(protocol);
        await waitForElement('p-shared-hr');
        const isAfternoon = record.effort.hour >= 12;
        setValue('p-shared-hr', record.effort.hour % 12 || 12);
        setValue('p-shared-min', String(record.effort.minute).padStart(2, '0'));
        selectOption(
            document.getElementById('p-shared-ampm'),
            isAfternoon ? ['PM', 'pm', 'P'] : ['AM', 'am', 'A'],
            isAfternoon ? ['PM', '下午'] : ['AM', '上午']
        );
        if (document.getElementById('p-dur-hrs')) {
            setValue('p-dur-hrs', Math.floor(record.effort.durationMinutes / 60));
        }
        if (document.getElementById('p-dur-min')) {
            setValue('p-dur-min', record.effort.durationMinutes % 60);
        }
        if (record.effort.protocol === 'P22' && document.getElementById('p-dist')) {
            setValue('p-dist', record.effort.distanceKm);
        }
        if (document.getElementById('p-party-size')) {
            setValue('p-party-size', record.effort.partySize);
        }
        record.effortReadback = readEffortFormState(record, preset);
        sessionStorage.setItem(storageKey, JSON.stringify(record));
        sessionStorage.removeItem(autoEffortKey);
        if (options.continueToSpecies !== false) {
            const continueButton = document.getElementById('btn-eff-continue');
            if (!continueButton) {
                throw new Error('找不到前往鳥種頁的按鈕。');
            }
            continueButton.click();
        }
    }

    function startRecord(record) {
        assertRecordReady(record);
        const preset = getLocationPresets()[record.location] || (record.locationId ? {
            locId: record.locationId,
            pageName: record.locationPageName || record.location
        } : null);
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
        const countField = document.getElementById(code);
        const nameContainer = document.getElementById('name_' + code);
        const nameNode = nameContainer
            ? (nameContainer.querySelector('span') || nameContainer)
            : null;
        const actualName = nameNode && nameNode.textContent.trim()
            ? nameNode.textContent.replace(/\s+/g, ' ').trim()
            : observation.name;
        const breedingSelect = document.getElementById('p-' + code + '_bcode');
        const breedingValue = breedingSelect ? String(breedingSelect.value || '').trim() : '';
        const breedingText = breedingValue ? selectedOptionText(breedingSelect) : '';
        const commentsField = document.getElementById('p-' + code + '_comments');
        const comments = commentsField ? String(commentsField.value || '').trim() : '';
        const extras = [];
        if (breedingText) {
            extras.push(breedingText);
        }
        if (comments) {
            extras.push(comments);
        }
        return {
            text: (countField ? String(countField.value || '').trim() : '—') + ' ' + actualName
                + (extras.length ? '; ' + extras.join(', ') : ''),
            count: countField ? String(countField.value || '').trim() : null,
            breedingCode: breedingValue || null,
            breedingText: breedingText,
            comments: comments,
            hasCountField: Boolean(countField),
            hasBreedingField: Boolean(breedingSelect),
            hasCommentsField: Boolean(commentsField)
        };
    }

    function verifyObservationOutcome(outcome) {
        if (outcome.status === 'failed') {
            outcome.display = outcome.observation.count + ' ' + outcome.observation.name;
            return outcome;
        }
        const actual = readObservationDisplay(outcome);
        const expected = outcome.observation;
        const mismatches = [];
        if (!actual.hasCountField || actual.count !== String(expected.count)) {
            mismatches.push('數量讀回為「' + (actual.count === null ? '找不到欄位' : actual.count) + '」');
        }
        if (expected.breedingCode) {
            if (!actual.hasBreedingField || actual.breedingCode !== expected.breedingCode) {
                mismatches.push('繁殖代碼讀回不符');
            }
        } else if (actual.breedingCode) {
            mismatches.push('出現未預期的繁殖代碼');
        }
        if (expected.comments) {
            if (!actual.hasCommentsField || actual.comments !== expected.comments) {
                mismatches.push('附註讀回為「' + (actual.hasCommentsField ? actual.comments : '找不到欄位') + '」');
            }
        } else if (actual.comments) {
            mismatches.push('出現未預期的附註');
        }
        outcome.display = actual.text;
        if (mismatches.length > 0) {
            outcome.status = 'failed';
            outcome.error = mismatches.join('；');
        } else if (expected.warning) {
            outcome.status = 'warning';
            outcome.error = expected.warning;
        } else {
            outcome.status = 'filled';
            outcome.error = '';
        }
        return outcome;
    }

    function mergeEffortReadback(current, previous) {
        const merged = {};
        [
            'locationId', 'locationName', 'date', 'time', 'protocol',
            'durationMinutes', 'distanceKm', 'partySize', 'expectedLocationName'
        ].forEach(function(key) {
            merged[key] = current[key] !== null && current[key] !== undefined
                ? current[key]
                : previous && previous[key] !== undefined ? previous[key] : null;
        });
        return merged;
    }

    function formatTime12(hour, minute) {
        if (hour === null || hour === undefined || minute === null || minute === undefined) {
            return '找不到';
        }
        return (hour % 12 || 12) + ':' + String(minute).padStart(2, '0')
            + (hour >= 12 ? ' PM' : ' AM');
    }

    function sameDate(left, right) {
        return Boolean(left && right
            && Number(left.year) === Number(right.year)
            && Number(left.month) === Number(right.month)
            && Number(left.day) === Number(right.day));
    }

    function readChecklistVerification(record, completenessId) {
        const preset = getLocationPresets()[record.location] || {
            locId: record.locationId,
            pageName: record.locationPageName || record.location
        };
        const current = readEffortFormState(record, preset);
        const actual = mergeEffortReadback(current, record.effortReadback || {});
        const expected = record.effort;
        const checks = [];
        function add(key, label, value, matched) {
            checks.push({ key: key, label: label, value: value, matched: Boolean(matched) });
        }

        const expectedLocationId = record.locationId || preset.locId;
        const expectedLocationName = record.locationPageName || preset.pageName;
        const locationMatched = actual.locationId
            ? actual.locationId === expectedLocationId
            : Boolean(actual.locationName && actual.locationName === expectedLocationName);
        add(
            'location',
            '地點',
            actual.locationName || (locationMatched ? expectedLocationName : '找不到'),
            locationMatched
        );

        const dateMatched = sameDate(actual.date, record.date);
        const timeMatched = actual.time
            && Number(actual.time.hour) === Number(expected.hour)
            && Number(actual.time.minute) === Number(expected.minute);
        add(
            'datetime',
            '日期時間',
            (actual.date ? formatDateLabel(actual.date) : '找不到')
                + ' ' + formatTime12(
                    actual.time ? actual.time.hour : null,
                    actual.time ? actual.time.minute : null
                ),
            dateMatched && timeMatched
        );

        const protocolNames = {
            P20: '附帶紀錄',
            P21: '定點計數',
            P22: '行進計數'
        };
        add(
            'protocol',
            '努力量',
            protocolNames[actual.protocol] || '找不到',
            actual.protocol === expected.protocol
        );
        add(
            'duration',
            '耗時',
            actual.durationMinutes === null ? '找不到' : actual.durationMinutes + ' 分鐘',
            Number(actual.durationMinutes) === Number(expected.durationMinutes)
        );

        const distanceRequired = expected.protocol === 'P22';
        add(
            'distance',
            '距離',
            actual.distanceKm === null
                ? (distanceRequired ? '找不到' : '不適用')
                : actual.distanceKm + ' 公里',
            distanceRequired
                ? Number(actual.distanceKm) === Number(expected.distanceKm)
                : actual.distanceKm === null
        );
        add(
            'party',
            '人數',
            actual.partySize === null ? '找不到' : actual.partySize + ' 人',
            Number(actual.partySize) === Number(expected.partySize)
        );

        const yes = document.getElementById('all-spp-y');
        const no = document.getElementById('all-spp-n');
        const actualCompleteness = yes && yes.checked === true
            ? 'all-spp-y'
            : no && no.checked === true ? 'all-spp-n' : null;
        add(
            'completeness',
            '完整清單',
            actualCompleteness === 'all-spp-y'
                ? '是完整清單'
                : actualCompleteness === 'all-spp-n' ? '否（附帶紀錄）' : '找不到',
            actualCompleteness === completenessId
        );
        return { actual: actual, checks: checks };
    }

    function renderEffortDetailsOnPage(checks) {
        const old = document.getElementById('tm-ebird-actual-effort');
        if (old) {
            old.remove();
        }
        const block = document.createElement('div');
        block.id = 'tm-ebird-actual-effort';
        block.className = 'tm-ebird-actual-effort';
        block.textContent = checks
            .filter(function(item) {
                return ['protocol', 'duration', 'distance', 'party', 'completeness'].includes(item.key);
            })
            .map(function(item) {
                return item.label + '：' + item.value;
            })
            .join('；');
        const locationLink = document.getElementById('href_changeLoc') || document.getElementById('href_loc');
        const anchor = locationLink ? (locationLink.parentElement || locationLink) : null;
        if (anchor && anchor.parentElement) {
            anchor.insertAdjacentElement('afterend', block);
        } else {
            const form = document.querySelector('form');
            if (form && form.parentElement) {
                form.parentElement.insertBefore(block, form);
            } else if (document.body) {
                document.body.insertBefore(block, document.body.firstChild);
            }
        }
        return block;
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
                ordered.push(outcome);
                included.add(outcome);
            }
        });
        outcomes.forEach(function(outcome) {
            if (!included.has(outcome)) {
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
        const hasInputIssues = outcomes.some(function(outcome) {
            return outcome.status === 'failed' || outcome.status === 'warning';
        }) || unresolved.length > 0;
        const completenessId = record.effort && record.effort.protocol === 'P20'
            ? 'all-spp-n'
            : 'all-spp-y';
        const complete = document.getElementById(completenessId);
        const formErrors = [];
        if (!complete) {
            formErrors.push(completenessId === 'all-spp-n'
                ? '找不到非完整清單選項'
                : '找不到完整清單選項');
        } else if (errors.length === 0 && !hasInputIssues) {
            complete.click();
            complete.checked = true;
            dispatchValueEvents(complete);
        }

        await new Promise(function(resolve) { setTimeout(resolve, 0); });

        const orderedItems = orderOutcomesByChecklist(outcomes);
        orderedItems.forEach(verifyObservationOutcome);
        orderedItems.forEach(function(outcome) {
            if (outcome.status === 'failed' && outcome.error) {
                const message = outcome.observation.name + '（' + outcome.code + '）：' + outcome.error;
                if (!errors.includes(message)) {
                    errors.push(message);
                }
            }
        });
        const verification = readChecklistVerification(record, completenessId);
        renderEffortDetailsOnPage(verification.checks);

        errors.push.apply(errors, formErrors);
        unresolved.forEach(function(item) {
            errors.push(item.error);
        });

        const submit = document.getElementById('btn-continue');
        if (submit) {
            submit.dataset.tmEbirdManualOnly = 'true';
            submit.title = 'Tampermonkey 未按下此按鈕；請人工確認後自行送出。';
        }
        return {
            filledCount: orderedItems.filter(function(item) { return item.status === 'filled'; }).length,
            totalCount: record.observations.length + unresolved.length,
            errors: errors,
            formErrors: formErrors,
            verificationErrors: verification.checks.filter(function(item) { return !item.matched; }),
            metadata: verification.checks,
            items: orderedItems,
            unresolved: unresolved,
            filledCodes: orderedItems.filter(function(item) {
                return item.status === 'filled';
            }).map(function(item) {
                return item.code;
            }),
            listCompleteness: completenessId === 'all-spp-n' ? 'incidental' : 'complete'
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

    function isoDateValue(value) {
        return value.year + '-'
            + String(value.month).padStart(2, '0') + '-'
            + String(value.day).padStart(2, '0');
    }

    function recentDateValues(referenceDate, selectedValue) {
        const reference = startOfDay(referenceDate);
        const unique = new Map();
        for (let offset = 0; offset >= -6; offset -= 1) {
            const date = new Date(reference);
            date.setDate(date.getDate() + offset);
            const value = dateValue(date);
            unique.set(isoDateValue(value), value);
        }
        if (selectedValue) {
            unique.set(isoDateValue(selectedValue), selectedValue);
        }
        return Array.from(unique.entries())
            .sort(function(left, right) { return right[0].localeCompare(left[0]); })
            .map(function(entry) { return entry[1]; });
    }

    function createDatePicker(onChanged, referenceDate = new Date()) {
        const label = document.createElement('label');
        label.className = 'tm-ebird-date-picker';
        label.textContent = '日期';
        const select = document.createElement('select');
        label.appendChild(select);
        const reference = startOfDay(referenceDate);
        let selectedValue = dateValue(reference);

        function rebuild(value) {
            selectedValue = value;
            const selectedIso = isoDateValue(value);
            select.textContent = '';
            recentDateValues(reference, value).forEach(function(item) {
                const option = document.createElement('option');
                option.value = isoDateValue(item);
                option.textContent = formatDateLabel(item);
                select.appendChild(option);
            });
            select.value = selectedIso;
        }

        rebuild(selectedValue);
        select.addEventListener('change', function() {
            const parts = select.value.split('-').map(Number);
            selectedValue = { year: parts[0], month: parts[1], day: parts[2] };
            if (typeof onChanged === 'function') {
                onChanged();
            }
        });
        return {
            element: label,
            select: select,
            set: function(value) {
                rebuild(value);
            },
            getDate: function() {
                return dateObject(selectedValue);
            },
            getReferenceDate: function() {
                return new Date(reference);
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

    function analyzeRecordLines(text, fallbackDate, preset, selectedLocation, locationPresets = getLocationPresets()) {
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

        const candidateIndex = indexes[cursor];
        const locationOmitted = candidateIndex !== undefined
            && Boolean(parseEffortLine(lines[candidateIndex]));
        const defaultLocation = getDefaultLocationPreset(locationPresets);
        const locationIndex = locationOmitted ? undefined : indexes[cursor++];
        const effortIndex = indexes[cursor++];
        let locationPrefix = '';
        let locationFailure = false;

        if (locationOmitted) {
            if (defaultLocation) {
                locationPrefix = '預設地點：' + defaultLocation.preset.pageName
                    + '（' + defaultLocation.preset.locId + '）；';
            } else {
                locationPrefix = '未提供地點，且尚未設定預設地點；';
                locationFailure = true;
                failureCount += 1;
                blockingFailureCount += 1;
            }
        } else if (locationIndex === undefined) {
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
            const parsedEffort = parseEffortLine(lines[effortIndex]);
            const valid = parsedEffort && parsedEffort.valid;
            results[effortIndex] = valid ? {
                text: locationPrefix
                    + String(parsedEffort.hour).padStart(2, '0') + ':'
                    + String(parsedEffort.minute).padStart(2, '0') + '／'
                    + parsedEffort.durationMinutes + ' 分鐘',
                error: locationFailure
            } : {
                text: locationPrefix + '無法辨識開始時間與分鐘',
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
            parsedDate: parsedDate,
            locationOmitted: locationOmitted
        };
    }

    function addStyle() {
        if (document.getElementById(styleId)) {
            return;
        }
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = [
            '#' + panelId + ' { box-sizing:border-box;position:fixed;z-index:2147483647;right:8px;top:8px;width:min(520px,calc(100vw - 16px));max-height:min(58dvh,560px);overflow-y:auto;overscroll-behavior:contain;padding:0;border:2px solid #2f7f45;border-radius:8px;background:#fff;color:#222;box-shadow:0 4px 18px #0004;font:13px/1.4 sans-serif; }',
            '#' + panelId + '.tm-ebird-review-panel { width:min(380px,calc(100vw - 16px));max-height:min(52dvh,480px); }',
            '#' + panelId + ' .tm-ebird-header { position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:7px 9px;background:#fff;border-bottom:1px solid #ddd; }',
            '#' + panelId + ' .tm-ebird-collapse { min-width:36px;padding:5px 9px;font-size:16px; }',
            '#' + panelId + ' .tm-ebird-body { padding:7px 9px 9px; }',
            '#' + panelId + ' .tm-ebird-body[hidden] { display:none; }',
            '#' + panelId + ' button { padding:7px 12px;border:0;border-radius:5px;background:#2f7f45;color:#fff;cursor:pointer; }',
            '#' + panelId + ' button:disabled { opacity:.55;cursor:default; }',
            '#' + panelId + ' input,#' + panelId + ' select { box-sizing:border-box;width:100%;padding:7px; }',
            '#' + panelId + ' label { display:block;margin-top:7px;font-size:12px; }',
            '#' + panelId + ' .tm-ebird-checkbox-label { display:flex;align-items:center;gap:7px;font-size:14px; }',
            '#' + panelId + ' .tm-ebird-checkbox-label input { width:auto;padding:0; }',
            '#' + panelId + ' .tm-ebird-effort-override { display:grid;grid-template-columns:1fr 1fr auto;align-items:end;gap:8px;margin:8px 0;padding:8px;border:1px solid #ccc;border-radius:5px;background:#fafafa; }',
            '#' + panelId + ' .tm-ebird-effort-override label { margin:0; }',
            '#' + panelId + ' .tm-ebird-effort-derived { min-width:64px;padding:7px 0;color:#176b2c;font-weight:600; }',
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
            '#' + panelId + ' .tm-ebird-check-summary { font-size:12px;line-height:1.3; }',
            '#' + panelId + ' .tm-ebird-check-summary > div { margin:1px 0; }',
            '.tm-ebird-actual-effort { margin:4px 0;padding:5px 7px;border-left:3px solid #2f7f45;background:#f4faf5;font:12px/1.35 sans-serif; }',
            '#' + panelId + ' .tm-ebird-summary-heading { margin-top:9px;font-weight:700; }',
            '#' + panelId + ' .tm-ebird-error { color:#a40000; }',
            '#' + panelId + ' .tm-ebird-ok { color:#176b2c; }',
            '.tm-ebird-location-filter,.tm-ebird-location-select { box-sizing:border-box!important;width:100%!important;max-width:none!important; }',
            '.tm-ebird-location-filter input { box-sizing:border-box;width:100%;padding:8px; }',
            '.tm-ebird-unobserved-hidden { display:none!important; }',
            '@media (max-width:700px) { #' + panelId + ' { right:6px;top:6px;width:min(420px,calc(100vw - 12px));max-height:52dvh; } #' + panelId + '.tm-ebird-review-panel { width:min(360px,calc(100vw - 12px));max-height:48dvh; } #' + panelId + ' .tm-ebird-record-grid { grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px; } #' + panelId + ' .tm-ebird-body { padding:6px; } #' + panelId + ' textarea,#' + panelId + ' .tm-ebird-preview { min-height:34vh;padding:5px;font-size:11px; } #' + panelId + ' .tm-ebird-effort-override { grid-template-columns:1fr 1fr; } #' + panelId + ' .tm-ebird-effort-derived { grid-column:1/-1;padding:0; } }'
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
        note.textContent = '設定只存在 Tampermonkey 本機；最多一個預設地點。距離 0～0.03 公里為定點計數，超過 0.03 公里為行進計數。';
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

        function addSelect(labelText, options) {
            const label = document.createElement('label');
            label.textContent = labelText;
            const select = document.createElement('select');
            options.forEach(function(item) {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.text;
                select.appendChild(option);
            });
            label.appendChild(select);
            body.appendChild(label);
            return select;
        }

        body.append(note, existing);
        const alias = addInput('文字紀錄中的地點簡稱');
        const locId = addInput('eBird 地點 ID（L 開頭）');
        const pageName = addInput('eBird 完整名稱');
        const defaultLabel = document.createElement('label');
        defaultLabel.className = 'tm-ebird-checkbox-label';
        const isDefault = document.createElement('input');
        isDefault.type = 'checkbox';
        defaultLabel.append(isDefault, document.createTextNode('設為未填地點時的預設地點'));
        body.appendChild(defaultLabel);
        const effortMode = addSelect('預設努力量', [
            { value: 'incidental', text: '附帶紀錄（不填距離）' },
            { value: 'distance', text: '依距離自動判定定點／行進計數' }
        ]);
        const distanceKm = addInput('預設距離（公里）', 'number');
        distanceKm.min = '0';
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

        function updateDistanceState() {
            distanceKm.disabled = effortMode.value === 'incidental';
            if (distanceKm.disabled) {
                distanceKm.value = '';
            }
        }

        function loadPreset(selectedAlias) {
            const preset = getLocationPresets()[selectedAlias];
            alias.value = selectedAlias || '';
            locId.value = preset ? preset.locId : '';
            pageName.value = preset ? preset.pageName : '';
            isDefault.checked = Boolean(preset && preset.isDefault);
            effortMode.value = preset && preset.distanceKm !== null && preset.distanceKm !== undefined
                ? 'distance'
                : 'incidental';
            distanceKm.value = preset && preset.distanceKm !== null && preset.distanceKm !== undefined
                ? preset.distanceKm
                : '';
            partySize.value = preset ? preset.partySize : '1';
            remove.disabled = !preset;
            updateDistanceState();
        }

        function refresh(selectedAlias) {
            existing.textContent = '';
            const addOption = document.createElement('option');
            addOption.value = '';
            addOption.textContent = '新增地點…';
            existing.appendChild(addOption);
            const presets = getLocationPresets();
            Object.keys(presets).sort().forEach(function(name) {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = (presets[name].isDefault ? '★ ' : '') + name;
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
            isDefault.checked = false;
            effortMode.value = 'incidental';
            distanceKm.value = '';
            partySize.value = '1';
            updateDistanceState();
            remove.disabled = true;
            status.textContent = current
                ? '這是新的地點簡稱；確認地點後可設定預設努力量、人數及是否為預設地點。'
                : '這是新的地點簡稱；請先選擇 eBird 地點。';
            status.className = 'tm-ebird-status ' + (current ? '' : 'tm-ebird-error');
        }

        function values() {
            return {
                locId: locId.value,
                pageName: pageName.value,
                effortMode: effortMode.value,
                distanceKm: effortMode.value === 'incidental' ? null : distanceKm.value,
                partySize: partySize.value,
                isDefault: isDefault.checked
            };
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
        effortMode.addEventListener('change', function() {
            updateDistanceState();
            if (typeof onChanged === 'function') {
                onChanged();
            }
        });
        save.addEventListener('click', function() {
            try {
                saveLocationPreset(alias.value, values());
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
        [distanceKm, partySize, alias, locId, pageName, isDefault].forEach(function(input) {
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
                effortMode: effortMode,
                distanceKm: distanceKm,
                partySize: partySize,
                isDefault: isDefault
            },
            refresh: refresh,
            prepareUnknown: prepareUnknown,
            captureCurrent: captureCurrent,
            savePending: function(locationAlias) {
                if (getLocationPresets()[locationAlias]) {
                    return getLocationPresets()[locationAlias];
                }
                return saveLocationPreset(locationAlias, values());
            }
        };
    }

    function extractLocationAlias(text, fallbackDate, locationPresets = getLocationPresets()) {
        const lines = normalizeSource(text).split('\n').map(function(line) { return line.trim(); }).filter(Boolean);
        if (lines.length === 0) {
            return '';
        }
        const parsedDate = parseFlexibleDate(lines[0], fallbackDate);
        const candidate = lines[parsedDate.consumed ? 1 : 0] || '';
        if (parseEffortLine(candidate)) {
            const defaultLocation = getDefaultLocationPreset(locationPresets);
            return defaultLocation ? defaultLocation.alias : '';
        }
        return candidate;
    }

    function createEffortOverride(onChanged) {
        const section = document.createElement('div');
        section.className = 'tm-ebird-effort-override';
        const modeLabel = document.createElement('label');
        modeLabel.textContent = '本筆努力量';
        const mode = document.createElement('select');
        [
            { value: 'incidental', text: '附帶紀錄（不填距離）' },
            { value: 'distance', text: '輸入距離' }
        ].forEach(function(item) {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.text;
            mode.appendChild(option);
        });
        modeLabel.appendChild(mode);
        const distanceLabel = document.createElement('label');
        distanceLabel.textContent = '本筆距離（公里）';
        const distance = document.createElement('input');
        distance.type = 'number';
        distance.min = '0';
        distance.step = '0.01';
        distanceLabel.appendChild(distance);
        const derived = document.createElement('span');
        derived.className = 'tm-ebird-effort-derived';
        section.append(modeLabel, distanceLabel, derived);

        function update() {
            distance.disabled = mode.value === 'incidental';
            if (distance.disabled) {
                distance.value = '';
                derived.textContent = '附帶紀錄';
            } else {
                try {
                    const protocol = protocolForDistance(distance.value);
                    derived.textContent = protocol === 'P21' ? '定點計數' : '行進計數';
                } catch (error) {
                    derived.textContent = error.message;
                }
            }
        }

        function applyPreset(preset) {
            if (preset && preset.distanceKm !== null && preset.distanceKm !== undefined) {
                mode.value = 'distance';
                distance.value = preset.distanceKm;
            } else {
                mode.value = 'incidental';
                distance.value = '';
            }
            update();
        }

        function applyToRecord(record) {
            if (!record.effort) {
                return record;
            }
            if (mode.value === 'incidental') {
                record.effort.protocol = 'P20';
                record.effort.distanceKm = null;
            } else {
                if (distance.value === '') {
                    throw new Error('請填寫本筆距離，或選擇「附帶紀錄」。');
                }
                record.effort.distanceKm = Number(distance.value);
                record.effort.protocol = protocolForDistance(record.effort.distanceKm);
            }
            return record;
        }

        mode.addEventListener('change', function() {
            update();
            if (typeof onChanged === 'function') {
                onChanged();
            }
        });
        distance.addEventListener('input', function() {
            update();
            if (typeof onChanged === 'function') {
                onChanged();
            }
        });
        applyPreset(null);
        return {
            element: section,
            mode: mode,
            distance: distance,
            applyPreset: applyPreset,
            applyToRecord: applyToRecord
        };
    }

    function createRecordEditor(body, status, isEffortPage) {
        let locationFilter = null;
        let settings = null;
        let datePicker = null;
        let updating = false;
        let lastAutoLocationKey = '';
        let lastEffortPresetKey = '';
        const dateReference = startOfDay(new Date());
        const grid = document.createElement('div');
        grid.className = 'tm-ebird-record-grid';
        const textarea = document.createElement('textarea');
        textarea.placeholder = '貼上日期、地點（可省略）、時間與物種紀錄';
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
        const effortOverride = createEffortOverride(refresh);

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

        function applyEffortPreset(preset, locationKey) {
            const distanceKey = preset && preset.distanceKm !== null && preset.distanceKm !== undefined
                ? String(preset.distanceKm)
                : 'incidental';
            const key = (locationKey || 'none') + '|' + distanceKey;
            if (key !== lastEffortPresetKey) {
                effortOverride.applyPreset(preset);
                lastEffortPresetKey = key;
            }
        }

        function refresh() {
            if (updating || !datePicker) {
                return null;
            }
            updating = true;
            try {
                const fallback = datePicker.getDate();
                const presets = getLocationPresets();
                const alias = extractLocationAlias(textarea.value, dateReference, presets);
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
                const parsedDate = parseFlexibleDate(firstLine.trim(), dateReference);
                if (parsedDate.consumed && !parsedDate.error) {
                    datePicker.set(parsedDate.value);
                }
                const selectedPreset = known
                    || (current ? (findLocationPresetById(current.locId, presets) || {}).preset : null)
                    || null;
                applyEffortPreset(selectedPreset, current ? current.locId : (known ? known.locId : 'none'));
                const analysis = analyzeRecordLines(
                    textarea.value,
                    dateReference,
                    known,
                    current,
                    presets
                );
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

        function onLocationChanged() {
            const alias = extractLocationAlias(textarea.value, dateReference, getLocationPresets());
            if (alias && !getLocationPresets()[alias] && settings) {
                const current = selectedLocation();
                if (current) {
                    settings.fields.locId.value = current.locId;
                    settings.fields.pageName.value = current.pageName;
                }
            }
            lastEffortPresetKey = '';
            refresh();
        }

        function installFilter() {
            locationFilter = installLocationFilter(onLocationChanged);
            if (locationFilter) {
                const defaultLocation = getDefaultLocationPreset();
                if (defaultLocation) {
                    locationFilter.selectLocId(defaultLocation.preset.locId);
                    lastAutoLocationKey = defaultLocation.alias + '|' + defaultLocation.preset.locId;
                }
            }
            return locationFilter;
        }

        datePicker = createDatePicker(refresh, dateReference);
        settings = createSettingsEditor(selectedLocation, function() {
            lastEffortPresetKey = '';
            refresh();
        });
        body.append(datePicker.element, grid, effortOverride.element, actionRow, status, settings.element);
        installFilter();

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
                sessionStorage.removeItem(confirmationKey);
                if (!state.known) {
                    settings.savePending(state.alias);
                }
                const record = parseRecord(
                    textarea.value,
                    datePicker.getDate(),
                    getLocationPresets(),
                    dateReference
                );
                effortOverride.applyToRecord(record);
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
                if (installFilter() || attempts >= 30) {
                    clearInterval(timer);
                    refresh();
                }
            }, 250);
        }
        refresh();
        return {
            textarea: textarea,
            button: button,
            refresh: refresh,
            effortOverride: effortOverride
        };
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

        const metadata = Array.isArray(result.metadata) ? result.metadata : [];
        metadata.forEach(function(item) {
            appendLine(
                (item.matched ? '✓ ' : '✗ ') + item.label + '：' + item.value,
                item.matched ? 'tm-ebird-ok' : 'tm-ebird-error'
            );
        });

        const verifiedSpecies = result.items.filter(function(item) {
            return item.status === 'filled';
        }).length;
        appendLine(
            '讀回驗證：鳥種 ' + verifiedSpecies + '/' + result.totalCount,
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
            const reason = String(item.error || '無法辨識').split('：')[0];
            appendLine(
                '✗ 未寫入：無可比對的 eBird 鳥種（' + reason + '）',
                'tm-ebird-error'
            );
        });
        result.formErrors.forEach(function(error) {
            appendLine('✗ 表單：' + error, 'tm-ebird-error');
        });

        const hasProblems = result.items.some(function(item) {
            return item.status !== 'filled';
        }) || result.unresolved.length > 0
            || result.formErrors.length > 0
            || metadata.some(function(item) { return !item.matched; });
        const submitted = !location.pathname.endsWith('/submit/checklist')
            && /\/checklist\/[^/]+\/?$/.test(location.pathname);
        appendLine(
            hasProblems
                ? '仍有讀回結果不符，請檢查紅字項目。'
                : submitted
                    ? '✓ 送出前所有欄位均已重新讀取並符合預期。'
                    : '✓ 所有欄位均已重新讀取並符合預期；尚未送出。',
            hasProblems ? 'tm-ebird-error' : 'tm-ebird-ok'
        );
    }

    function saveChecklistConfirmation(record, result) {
        sessionStorage.setItem(confirmationKey, JSON.stringify({
            record: record,
            result: {
                filledCount: result.filledCount,
                totalCount: result.totalCount,
                items: result.items,
                unresolved: result.unresolved,
                formErrors: result.formErrors,
                verificationErrors: result.verificationErrors,
                metadata: result.metadata,
                listCompleteness: result.listCompleteness
            }
        }));
    }

    function getChecklistConfirmation() {
        const saved = sessionStorage.getItem(confirmationKey);
        if (!saved) {
            return null;
        }
        try {
            return JSON.parse(saved);
        } catch (error) {
            return null;
        }
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
        const isSubmittedChecklistPage = !isChecklistPage
            && /\/checklist\/[^/]+\/?$/.test(location.pathname);
        if (isChecklistPage || isSubmittedChecklistPage) {
            panel.classList.add('tm-ebird-review-panel');
        }
        if (isSubmittedChecklistPage) {
            const confirmation = getChecklistConfirmation();
            body.appendChild(status);
            if (confirmation) {
                renderChecklistSummary(status, confirmation.record, confirmation.result);
            } else {
                status.textContent = '這個分頁沒有最近一次由助手填寫的核對資料。';
                status.className = 'tm-ebird-status tm-ebird-error';
            }
        } else if (isChecklistPage) {
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
                        saveChecklistConfirmation(record, result);
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
        protocolForDistance: protocolForDistance,
        getDefaultLocationPreset: getDefaultLocationPreset,
        findLocationPresetById: findLocationPresetById,
        deleteLocationPreset: deleteLocationPreset,
        speciesAliases: speciesAliases,
        parseFlexibleDate: parseFlexibleDate,
        parseEffortLine: parseEffortLine,
        parseRecord: parseRecord,
        parseObservationLine: parseObservationLine,
        formatObservationForEbird: formatObservationForEbird,
        analyzeRecordLines: analyzeRecordLines,
        extractLocationAlias: extractLocationAlias,
        filterLocationItems: filterLocationItems,
        extractLocId: extractLocId,
        startRecord: startRecord,
        fillEffort: fillEffort,
        fillSpecies: fillSpecies,
        readEffortFormState: readEffortFormState,
        readChecklistVerification: readChecklistVerification,
        verifyObservationOutcome: verifyObservationOutcome,
        revealAdditionalSpeciesSections: revealAdditionalSpeciesSections,
        setUnobservedVisibility: setUnobservedVisibility,
        recentDateValues: recentDateValues,
        saveChecklistConfirmation: saveChecklistConfirmation,
        getChecklistConfirmation: getChecklistConfirmation,
        storageKey: storageKey,
        autoEffortKey: autoEffortKey,
        confirmationKey: confirmationKey
    };
    globalThis.__ebirdTextInputAssistant = api;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createPanel, { once: true });
    } else {
        createPanel();
    }
})();