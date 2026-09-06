# Test cases

Run `npm ci` and `npm test` locally before publishing a batch of changes.

| Page | Status | Coverage |
| --- | --- | --- |
| https://ebird.org/atlastw/myebird/TW?continue | Automated, URL harness | Only the exact broken URL drops `?continue`; other paths and query values remain unchanged. |
| https://ebird.org/atlastw/submit/effort | Automated, mocked DOM | Traditional Chinese date controls reorder to year/month/day; English controls retain month/day/year. |
| https://ebird.org/atlastw/submit/checklist | Automated, mocked DOM | Existing parsing, entry, readback, and submission-guard tests in `tests/test-ebird-text-input-assistant*.js`; no live submission. |
| https://ebird.org/atlastw/checklist/S389816636 | Automated, reduced captured structure | `tests/test-submitted-checklist-dom.js` injects the userscript into a local HTML DOM. Covers original English/Chinese and rewritten dates, ISO duration, observer count, completeness, exact location ID, subspecies names, page order, mismatches, and hiding the panel on unrelated completed checklists. Personal data is replaced in the committed fixture. |
| https://ebird.org/atlastw/checklist/S390182240 | Automated, reduced captured structure | Covers personal-location names rendered without a link, plus expected values and reasons for missing completed-page fields. The public HTML capture was also checked locally; no live submission is performed. |

The same test file optionally reads a local public HTML capture via `EBIRD_CAPTURE_PATH` and verifies all 17 observations plus metadata. English and Chinese captures were checked locally; live page fetching and authenticated browser interaction are not CI tests.
