# 隨走隨記 · eBird Mobile Counter

這是 **純 HTML / CSS / JavaScript 靜態網頁**，不是 userscript，不需要 Tampermonkey、後端、API 金鑰或外部代理服務。`EBirdTextInputAssistant.user.js` 只作為簡稱與文字格式的相容依據。

## 開啟與 GitHub Pages

- 網頁入口：`counter/index.html`，所有資源採相對路徑，支援專案子目錄。
- 在既有 `christorng.idv.tw` 的 GitHub Pages 設定下，預期網址為 `https://christorng.idv.tw/eBirdScripts/counter/`。
- `.github/workflows/pages.yml` 在 `main` 上執行測試、產生專案首頁、打包靜態檔並部署 Pages。Repository Settings → Pages 的 Source 需為 **GitHub Actions**。若仍使用既有分支式 Pages，亦可直接發布包含 `counter/` 的儲存庫根目錄。
- 推送 `feature/mobile-counter` **不會**部署或修改 main；需合併後才發布。未更動 DNS、CNAME 或網域根目錄的其他網站。
- 可使用手機瀏覽器的「加入主畫面」。首次成功載入後，service worker 快取計鳥頁；離線重新開啟仍可使用已保存資料。更新部署時須同步提高 `sw.js` 的 CACHE 版本；新版在舊分頁關閉後啟用，以免計數中途更換程式。

## 計數流程

1. 選擇地點，開始時間預設現在。可直接輸入日期時間或 ±1 分／10 分／1 小時；未來時間會限制為現在。可選擇是否啟用 GPS。
2. 鳥種按開始日期的月份頻率排序，每列固定為 `+10 +5 + − 鳥名 繁殖 聽 + −`。左側記「看到」，右側記「只聽到」，同一隻鳥不要計入兩邊。輸出總數為兩者相加。
3. 搜尋支援完整鳥名、助手所有簡稱與本機簡稱。多字搜尋要求每個字都出現；不限制連續位置。`input`、`compositionupdate`、`compositionend` 都會更新篩選。注音候選尚未轉成漢字時，瀏覽器不提供候選鳥名，不能承諾在所有輸入法下以未選字的注音找到漢字。
4. 「停止」固定在右下角。停止後可編輯輸出、複製、下載文字或完整 JSON 備份。複製失敗不會標成已複製；未複製就重新開始會再次確認。編輯文字後會清除已複製狀態。
5. 桌面同樣限制為最大 440px 的直式畫面。已以 390px 手機 viewport 驗證操作；320px 亦採較窄按鈕排列。

## 可擴充地點與資料取得

初次建立本機 registry 時預置：

| ID | 簡稱 | 隨附分類項目數 |
| --- | --- | ---: |
| L16381971 | 後港新公園 | 67 |
| L18412499 | 建國二路 | 63 |
| L17621411 | 市場 | 18 |

地點清單存於 localStorage（不是 GM storage）。預置只用於第一次建立；刪掉的地點不會在 reload 後自動加回。每個地點都能改名、重新抓取、匯入、刪除以及切換 1–12 月預覽。進行中的紀錄使用開始時的地點名稱與鳥種排序快照。

「新增地點」接受以下格式，僅允許單一 eBird L ID，拒絕其他網域與多個地點：

```text
L16381971
https://ebird.org/barchart?r=L16381971
https://ebird.org/barchart?byr=1900&bmo=1&emo=12&r=L16381971&personal=true
```

新增後立刻嘗試抓取。先 `personal=true` + `credentials: include`；失敗、未登入、來源不符、解析失敗或空資料後，移除 personal 並以 `credentials: omit` 抓公開資料。成功時記錄 actual source、fallback 原因、資料取得時間與傳輸方式；失敗時保留原快取並顯示匯入指引。

**GitHub Pages 與 ebird.org 不同網域。** 瀏覽器是否送出 eBird cookie、以及 JavaScript 是否能讀到回應，取決於 eBird 的 CORS、cookie 與登入政策。純靜態頁無法繞過它們；不能保證貼網址就自動抓到個人或公開資料，也不會要求把帳密／cookie 貼入計鳥頁。直接請求在此環境遇到登入轉址或瀏覽器驗證，因此提供可實際使用的官方檔案匯入路徑。

### 建議更新方式：匯入官方 TXT

1. 在地點管理開啟公開或個人圖表，選擇全年 1–12 月。
2. 在 eBird 登入後，按 **Download Histogram Data** 下載 `.txt`。
3. 回到計鳥網頁，選擇正確的「公開／個人」来源，匯入檔案。
4. 預覽月份，確認鳥種與頻率後即可離線使用。

TXT 本身沒有地點 ID、來源或下載時間。若為標準下載檔名會核對 ID；任意改名的檔案須由使用者確認地點。來源採匯入時選定值，畫面會明示「檔案匯入」。本機匯入顯示匯入時間，隨附快取顯示提供檔案的修改時間，並非 eBird 伺服器資料生成時間。

三個隨附快取由使用者提供的全年官方 TXT 產生，依本次公開圖表脈絡標記為公開；後港新公園的樣本數與精確頻率已與公開折線圖交叉確認。TXT 無法自行證明 public/personal，因此另外兩份的來源是使用者提供資料的脈絡標記。原始檔案未納入 repo，只有鳥種名稱與月頻率，沒有登入資料或觀察者帳號。

維護者可重新產生公開快取（腳本禁止把 personal 檔案寫入公開 repo）：

```sh
node scripts/import-counter-data.mjs L16381971 public /path/to/ebird_L16381971__1900_2026_1_12_barchart.txt
```

### 已驗證的 eBird parser

2026-09-27 實際瀏覽指定公開頁與其 Line Graphs 連結：

- 官方下载連結為 `/barchartData?...&fmt=tsv`，實際檔案是 tab-separated TXT，而非 JSON。包含 `Number of taxa:`、Jan–Dec 每月四欄、`Sample Size:` 與鳥種名稱／48 個 0–1 比例。
- 長條圖 DOM 只有 `b0…b9` 之類的級距，**不**拿來猜百分比。
- 含 `spp=` 的全年折線圖內嵌 `var lgRaw = { ... }`，其中 `lineGraphs[type=freq].series[].values` 為百分比、`values_N` 為樣本數，`xLabels` 有 48 個週區間。已實際驗證多個 species code 以逗號連接可取得全部 67 個分類項目。
- Parser 使用 DOMParser + JSON.parse，從 Map 連結與 SpeciesName 對應 species code，不執行匯入 HTML 的程式。個人／公開來源以官方下載連結的 personal 參數核對；不一致就拒絕。
- 沒有內嵌數值時，live fetch 根據頁面鳥種 ID 再請求折線圖。匯入單純長條圖 HTML 會要求改用 TXT／全年折線圖 HTML，不會安靜退回假頻率。
- 也接受本程式的單一地點快取 JSON（id、source、updatedAt、species，months 必須為 12 個 0–100 數值或 null）。完整備份請使用首頁「還原備份」。

每月頻率＝`Σ(該週比例 × 該週樣本數) / Σ該週樣本數`。沒有樣本的月份為 `null`（顯示 —），與有樣本但沒出現的 0% 分開。TXT 原值有七位左右小數，保留精度不先四捨五入成觀察次數。

## 相近頻率的排序定義

`core.mjs` 的 `FREQUENCY_THRESHOLD_PP = 2` 是可調常數，單位為**百分點**。

先按頻率遞減；以尚未分組的最高頻率為組首，將與它相差 ≤2 百分點的鳥種放同組，同組保留 eBird 原始順序。不是相鄰兩者遞推串成一大組，也不是不具遞移性的模糊 comparator。例如 100%、98.5% 同組，97% 下一組。設 0 可僅對完全相同數值保留原序。無樣本／無快取項目置於最後。開始後排序固定，不因計數改變而讓鳥名跳動。

## 鳥種簡稱與輸出相容

- `aliases.mjs` 由 `scripts/generate-counter-aliases.js` 從 repo 內助手實際解析表產生；優先最短簡稱，相同長度保留助手原定順序。更新助手後可重新執行產生器。
- TXT 無 species code，使用唯一、可驗證的完整名稱／既有簡稱匹配（正規化台／臺、空格和括號說明）。匹配不明確者保留原名与穩定本機 ID，不猜物種。
- 例如官方「原鴿」與助手「野鴿（野化）」不會默默合併。未匹配者仍能計數、保存、自訂本機顯示簡稱與搜尋；停止頁會列出未輸出者及所有數量。新增本機簡稱不會修改另一個網站上的助手解析表；需人工確認並在助手／eBird 補填，或之後擴充助手相容表。
- 相容文字僅輸出已知鳥種。未知鳥種保留在完整 JSON 備份，永不默默刪除。
- 繁殖選項輸出完整、可匹配的中文細節。唱歌／求偶／一對直接支援；其他選項由現有助手推測代碼並要求人工確認。避免提供助手中不唯一的「築巢」文字選項。
- 地點簡稱需要在文字助手中另外設定地點 ID；兩個網域的設定不互通。
- 現有 `parseEffortLine()` 只接受 `HH:MM 開始 N 分鐘`，**不接受距離**。GPS 顯示與保存於此網頁，請在助手努力量欄手動填入，沒有偷偷在文字加一行破壞 parser。

```text
2026/9/27
後港新公園
14:41 開始 28 分鐘
珠頸 6 唱歌，1 聽到
麻雀 28
```

## 保存、恢復與 GPS 限制

- 每次計數、繁殖變更、搜尋、設定、輸出編輯和接受的 GPS 點都同步保存 localStorage，另在頁面隱藏／離開時保存。重新開啟恢復地點、開始／停止時間、counts、繁殖、搜尋、距離、最後定位與已編輯輸出。
- 耗時由絕對開始時間計算，不靠計時器累加；切 App 或 reload 後不歸零。停止後時間固定，分鐘四捨五入且至少 1 分鐘。
- GPS 必須 HTTPS 或 localhost 並授權。精度差於 50m、跳點速度超過 12m/s、逆序時間與小幅抖動不累計；距離是取樣估計，可能低估。
- 手機背景可能停止定位，沒有網頁可保證完整的背景 GPS 軌跡。超過 120 秒的點間隔記為中斷，重新設定基準而不虛構中間路線。距離與最後點仍恢復，但未觀測路段無法復原。GPS 拒絕或失效不影響計數。
- Web Locks 防止兩個分頁同時覆寫；不支援時使用 storage 事件偵測並停用舊分頁。
- 儲存額度／權限失敗會顯示固定警告，無法保存第一筆時不開始。備份內容損壞時不覆寫原資料，提供原始備份下載。
- 同網域不等於跨裝置同步；不同瀏覽器、無痕模式、清除網站資料仍會影響保存。請使用「下載完整備份」，可包含最後 GPS 座標，分享前自行確認。

## 開發與驗證

```sh
npm ci
node scripts/generate-counter-aliases.js
node --check counter/core.mjs
node --check counter/app.mjs
node --check counter/sw.js
npm test
npm run generate:index
```

使用任一靜態 HTTP server 服務 repo 根目錄，再開 `/counter/`。不直接以 `file://` 開啟（模組與 service worker 需要 HTTP）。

新增測試涵蓋 URL 驗證、實際三地快取、TXT／觀測到的 embedded JSON、加權頻率、缺樣本、個人 fallback、來源不符、相近排序、真實助手解析、未知鳥種、持久化、未來時間與 GPS 異常。UI 檢查涵蓋手機直式、看到／聽到、繁殖、搜尋、reload 恢復與未知物種停止提示。實機 GPS、所有注音輸入法與正式網域的個人登入跨網域存取仍需現場驗證。
