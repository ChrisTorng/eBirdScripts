// ==UserScript==
// @name         eBird Scripts
// @version      2024-10-05_0.1
// @description  Enchance eBird pages.
// @match        https://ebird.org/hotspots*
// @author       ChrisTorng
// @homepage     https://github.com/ChrisTorng/eBirdScripts/
// @downloadURL  https://github.com/ChrisTorng/eBirdScripts/raw/main/eBirdScripts.user.js
// @updateURL    https://github.com/ChrisTorng/eBirdScripts/raw/main/eBirdScripts.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tampermonkey.net
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function addExtraLinks() {
        // Find all <li> elements that contain the hotspot link
        const hotspotLinks = document.querySelectorAll('li > a[href^="/hotspot/L"]');

        hotspotLinks.forEach(link => {
            const li = link.parentElement;
            if (li && !li.dataset.extraLinksAdded) { // Prevent adding links multiple times
                // Extract the original URL and remove the "rank" parameter
                const originalUrl = new URL(link.href, window.location.origin);
                originalUrl.searchParams.delete('rank');

                const basePath = originalUrl.pathname;
                const params = originalUrl.search;

                // Create "最近鳥種" link
                const birdListLi = document.createElement('li');
                const birdListLink = document.createElement('a');
                birdListLink.href = `${basePath}/bird-list${params}`;
                birdListLink.textContent = '最近鳥種';
                birdListLi.appendChild(birdListLink);

                // Create "最近紀錄" link
                const recentRecordsLi = document.createElement('li');
                const recentRecordsLink = document.createElement('a');
                recentRecordsLink.href = `${basePath}${params}`;
                recentRecordsLink.textContent = '最近紀錄';
                recentRecordsLi.appendChild(recentRecordsLink);

                // Insert the new <li> elements after the original <li>
                li.insertAdjacentElement('afterend', birdListLi);
                birdListLi.insertAdjacentElement('afterend', recentRecordsLi);

                // Mark this <li> as processed
                li.dataset.extraLinksAdded = 'true';
            }
        });
    }

    // Run the script when the page is loaded
    window.addEventListener('load', () => {
        addExtraLinks();

        // Also observe DOM changes to ensure the script works for dynamically loaded content
        const observer = new MutationObserver(() => {
            addExtraLinks();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();