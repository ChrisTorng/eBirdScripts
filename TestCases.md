# Test cases

Run `npm ci` and `npm test` locally before publishing a batch of changes.

| Page | Status | Coverage |
| --- | --- | --- |
| https://ebird.org/atlastw/submit/checklist | Automated, mocked DOM | Existing parsing, entry, readback, and submission-guard tests in `tests/test-ebird-text-input-assistant*.js`; no live submission. |
| https://ebird.org/atlastw/checklist/S389816636 | Automated, reduced captured structure | `tests/test-submitted-checklist-dom.js` injects the userscript into a local HTML DOM. Covers original English/Chinese and rewritten dates, ISO duration, observer count, completeness, exact location ID, subspecies names, page order, mismatches, and hiding the panel on unrelated completed checklists. Personal data is replaced in the committed fixture. |

The same test file optionally reads a local public HTML capture via `EBIRD_CAPTURE_PATH` and verifies all 17 observations plus metadata. English and Chinese captures were checked locally; live page fetching and authenticated browser interaction are not CI tests.
