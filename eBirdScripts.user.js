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
        console.log('addExtraLinks called');
        // Find all <li> elements that contain the hotspot link
        const hotspotLinks = document.querySelectorAll('li > a[href^="/hotspot/L"]');
        console.log(`Found ${hotspotLinks.length} hotspot links.`);

        hotspotLinks.forEach(link => {
            console.log('Processing link:', link.href);
            const li = link.parentElement;
            if (li && !li.dataset.extraLinksAdded) { // Prevent adding links multiple times
                console.log('Adding extra links for:', link.href);
                // Extract the original URL and remove the "rank" parameter
                const originalUrl = new URL(link.href, window.location.origin);
                originalUrl.searchParams.delete('rank');
                console.log('Original URL after removing rank parameter:', originalUrl.href);

                const basePath = originalUrl.pathname;
                const params = originalUrl.search;

                // Create "最近鳥種" link
                const birdListLi = document.createElement('li');
                const birdListLink = document.createElement('a');
                birdListLink.href = `${basePath}/bird-list${params}`;
                birdListLink.textContent = '最近鳥種';
                birdListLi.appendChild(birdListLink);
                console.log('Created link for 最近鳥種:', birdListLink.href);

                // Create "最近紀錄" link
                const recentRecordsLi = document.createElement('li');
                const recentRecordsLink = document.createElement('a');
                recentRecordsLink.href = `${basePath}${params}`;
                recentRecordsLink.textContent = '最近紀錄';
                recentRecordsLi.appendChild(recentRecordsLink);
                console.log('Created link for 最近紀錄:', recentRecordsLink.href);

                // Insert the new <li> elements after the original <li>
                li.insertAdjacentElement('afterend', birdListLi);
                birdListLi.insertAdjacentElement('afterend', recentRecordsLi);
                console.log('Inserted new links after:', link.href);

                // Mark this <li> as processed
                li.dataset.extraLinksAdded = 'true';
                console.log('Marked li as processed:', li);
            } else {
                console.log('Skipping link, already processed or invalid li:', link.href);
            }
        });
    }

    // Run the script when the page is loaded
    window.addEventListener('load', () => {
        console.log('Page loaded, running addExtraLinks');
        addExtraLinks();

        // Also observe DOM changes to ensure the script works for dynamically loaded content
        const observer = new MutationObserver(mutations => {
            let addedNodes = false;
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    addedNodes = true;
                }
            });
            if (addedNodes) {
                console.log('DOM mutation detected, running addExtraLinks');
                addExtraLinks();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        console.log('MutationObserver set up to watch for DOM changes');
    });
})();