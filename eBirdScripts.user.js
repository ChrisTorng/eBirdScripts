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
            const li = link.parentElement;
            if (li && !li.dataset.extraLinksAdded) { // Prevent adding links multiple times
                // Ensure the <li> is the second <li> within its parent
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
                const { latitude, longitude } = position.coords;
                const minX = longitude - 0.05;
                const maxX = longitude + 0.05;
                const minY = latitude;
                const maxY = latitude;
                const newSearchParams = `?env.minX=${minX}&env.minY=${minY}&env.maxX=${maxX}&env.maxY=${maxY}&yr=cur`;
                window.location.replace(window.location.origin + window.location.pathname + newSearchParams);
            }, error => {
                console.error('Error getting user location:', error);
            });
        }
    }

    // Run the script when the page is loaded
    window.addEventListener('load', () => {
        console.log('Page loaded, running addExtraLinks and updateHotspotsUrl');
        updateHotspotsUrl();
        addExtraLinks();

        // Also observe DOM changes to ensure the script works for dynamically loaded content
        const observer = new MutationObserver(() => {
            console.log('DOM mutation detected, running addExtraLinks');
            addExtraLinks();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        console.log('MutationObserver set up to watch for DOM changes');
    });
})();