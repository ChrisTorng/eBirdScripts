// ==UserScript==
// @name         eBird Scripts
// @version      2024-10-21_0.2
// @description  Enchance eBird pages.
// @match        https://ebird.org/*
// @author       ChrisTorng
// @homepage     https://github.com/ChrisTorng/eBirdScripts/
// @downloadURL  https://github.com/ChrisTorng/eBirdScripts/raw/main/eBirdScripts.user.js
// @updateURL    https://github.com/ChrisTorng/eBirdScripts/raw/main/eBirdScripts.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tampermonkey.net
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    const monthMap = {
        '一月': '01',
        '二月': '02',
        '三月': '03',
        '四月': '04',
        '五月': '05',
        '六月': '06',
        '七月': '07',
        '八月': '08',
        '九月': '09',
        '十月': '10',
        '十一月': '11',
        '十二月': '12'
    };

    function replaceDates() {
        // 搜尋整個網頁中的文字節點
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        
        let node;
        while (node = walker.nextNode()) {
            let text = node.nodeValue;

            // 格式 1: 2 十月 2024 -> 2024/10/02
            text = text.replace(/(\d{1,2})\s(一月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月)\s(\d{4})/g, (match, day, month, year) => {
                const monthNumber = monthMap[month];
                return `${year}/${monthNumber}/${day.padStart(2, '0')}`;
            });

            // 格式 2: 2日 10月 2024年 -> 2024/10/02
            text = text.replace(/(\d{1,2})日\s(\d{1,2})月\s(\d{4})年/g, (match, day, month, year) => {
                return `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
            });

            // 如果文字有變化，則更新節點內容
            if (node.nodeValue !== text) {
                node.nodeValue = text;
            }
        }
    }

    const defaultOffset = 0.05;

    function getUserSetting() {
        return GM_getValue('locationOffset', defaultOffset);
    }

    function setUserSetting() {
        const currentOffset = getUserSetting();
        const userInput = prompt(`請輸入經緯度增量範圍 (預設值 ${defaultOffset}，目前設定為 ${currentOffset}):`, currentOffset);
        if (userInput !== null) {
            const offset = parseFloat(userInput);
            if (!isNaN(offset)) {
                GM_setValue('locationOffset', offset);
                console.log(`使用者設定經緯度增量範圍為: ${offset}`);
            } else {
                console.log('無效輸入，保持原來的設定。');
            }
        }
    }

    GM_registerMenuCommand('設定經緯度增量範圍', setUserSetting);

    function addExtraLinks() {
        if (!window.location.pathname.startsWith('/hotspots')) {
            return; // 只有 /hotspots 頁面會啟用這個功能
        }

        console.log('addExtraLinks called');
        const hotspotLinks = document.querySelectorAll('li > a[href^="/hotspot/L"]');
        console.log(`Found ${hotspotLinks.length} hotspot links.`);

        hotspotLinks.forEach(link => {
            const li = link.parentElement;
            if (li && !li.dataset.extraLinksAdded) { // Prevent adding links multiple times
                const parentUl = li.parentElement;
                const lis = parentUl.querySelectorAll('li');
                const index = Array.from(lis).indexOf(li);

                if (index !== 1) { // Only process the second <li>
                    return;
                }

                console.log('Adding extra links for:', link.href);
                const basePath = link.pathname;

                // Create "最近鳥種" link
                const birdListLi = document.createElement('li');
                const birdListLink = document.createElement('a');
                birdListLink.href = `${basePath}/bird-list`;
                birdListLink.textContent = '最近鳥種';
                birdListLi.appendChild(birdListLink);

                // Create "最近紀錄" link
                const recentRecordsLi = document.createElement('li');
                const recentRecordsLink = document.createElement('a');
                recentRecordsLink.href = `${basePath}/recent-checklists`;
                recentRecordsLink.textContent = '最近紀錄';
                recentRecordsLi.appendChild(recentRecordsLink);

                // Insert the new <li> elements after the original <li>
                li.insertAdjacentElement('afterend', birdListLi);
                birdListLi.insertAdjacentElement('afterend', recentRecordsLi);
                console.log('Inserted new links after:', link.href);

                // Mark this <li> as processed
                li.dataset.extraLinksAdded = 'true';
            }
        });
    }

    function updateHotspotsUrl() {
        if (window.location.pathname === '/hotspots' && !window.location.search) {
            console.log('Updating URL with user location coordinates');
            navigator.geolocation.getCurrentPosition(position => {
                const offset = getUserSetting(); // Get user-defined offset value
                const { latitude, longitude } = position.coords;
                const minX = longitude - offset;
                const maxX = longitude + offset;
                const minY = latitude;
                const maxY = latitude;
                const month = ""; // "" means all month, 1-12 means specific month
                const year = "cur"; // "all"
                const newSearchParams = `?env.minX=${minX}&env.minY=${minY}&env.maxX=${maxX}&env.maxY=${maxY}&m=${month}&yr=${year}`;
                window.location.replace(window.location.origin + window.location.pathname + newSearchParams);
            }, error => {
                console.error('Error getting user location:', error);
            });
        }
    }

    window.addEventListener('load', () => {
        console.log('Page loaded, running addExtraLinks and updateHotspotsUrl');
        replaceDates();

        // 只在 /hotspots 頁面啟用這些功能
        if (window.location.pathname.startsWith('/hotspots')) {
            updateHotspotsUrl();
            addExtraLinks();
        }

        // Set up a MutationObserver to watch for DOM changes
        const observer = new MutationObserver(() => {
            replaceDates();
            if (window.location.pathname.startsWith('/hotspots')) {
                console.log('DOM mutation detected, running addExtraLinks');
                addExtraLinks();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.log('MutationObserver set up to watch for DOM changes');
    });
})();
