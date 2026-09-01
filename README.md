# eBird Scripts

## 緣起

使用新版 [eBird](https://ebird.org) 網站中，發現一些不甚好用的地方，因此製作此腳本以改善使用體驗。

## 功能

### eBird Scripts

eBird Scripts 是一個 [Tampermonkey](https://www.tampermonkey.net/) 使用者腳本，用於增強 [eBird](https://ebird.org) 網站的功能。

- 日期格式由「21 十月 2024」、「21日 10月 2024年」或「20 8月 2026」改為「2024/10/21」或「2026/8/20」格式顯示。
- [eBird 熱門鳥點](https://ebird.org/hotspots)
  - 開啟地圖時自動定位到目前位置，時間範圍設為今年全年度。
  - 點出各別地點的彈跳畫面內，新增「最近鳥種」及「最近紀錄」連結。

![](demo.png)

### eBird 文字輸入助手

[eBird 文字輸入助手](https://github.com/ChrisTorng/eBirdScripts/raw/main/EBirdTextInputAssistant.user.js)可將慣用的臺灣賞鳥文字紀錄帶入 eBird 提交表單：

- 解析日期、地點、開始時間、持續分鐘與鳥種數量。
- 支援「唱歌」、「聽到」與「一對」等細節，並填入繁殖代碼或備註。
- 可在 Tampermonkey 本機設定「地名簡稱 → eBird 地點、預設距離與人數」；設定不會上傳。
- 支援常用鳥種簡稱及新版、舊版 eBird 鳥種欄位 ID。
- 盡量填完所有鳥種後一次列出未完成項目。
- 不會按下最後的送出按鈕；紀錄必須由使用者人工確認。

## 安裝

1. **安裝 [Tampermonkey](https://www.tampermonkey.net/)**<br>
   這是一個可用於管理使用者腳本的瀏覽器擴充套件。

2. **選擇要安裝的腳本：**
   - [安裝 eBird Scripts](https://github.com/ChrisTorng/eBirdScripts/raw/main/eBirdScripts.user.js)
   - [安裝 eBird 文字輸入助手](https://github.com/ChrisTorng/eBirdScripts/raw/main/EBirdTextInputAssistant.user.js)

3. 會自動開啟 Tampermonkey Install 畫面，請按 Install 鈕安裝。

4. 若先前已開啟了 [eBird](https://ebird.org/) 相關網頁，請重新整理網頁。

## 使用說明

### eBird Scripts

- 進入 [eBird 熱門鳥點](https://ebird.org/hotspots) 時，會要求取得位置之權限，只要選擇允許，就會預設定位到目前所在位置，時間範圍設定為今年全年。

- 在 [eBird 熱門鳥點](https://ebird.org/hotspots) 中點開任一熱點時，會看到新增的「最近鳥種」和「最近紀錄」的連結。

- 在各 eBird 網頁中的中文日期，會代換為 2021/10/21 的格式，比如在 [我的 eBird](https://ebird.org/myebird)
 中「最新紀錄清單」裡的日期

### eBird 文字輸入助手

1. 在 eBird「提交觀察紀錄」中選擇地點，進入日期與努力量頁。
2. 展開「管理本機地點」，按「帶入目前地點」，填寫文字紀錄中的地名簡稱、預設距離與人數後儲存。
3. 貼上文字紀錄並按「解析、填入並前往物種」。例如：

```text
2026/8/30
後港新公園
8：38 開始 28 分鐘
金背 1
珠頸 6 唱歌，1 聽到
麻雀 28
```

4. 到鳥種頁後，助手會填入能辨識的項目並一次列出問題。
5. 人工檢查日期、努力量、鳥種、數量及細節；助手不會送出紀錄。

## 設定

### eBird Scripts

- 開啟 Tampermonkey 外掛畫面，或由 [eBird](https://ebird.org/) 網站中 (除地圖外) 任意處按右鍵，選擇 Tampermonkey - eBird Scripts 之下，可看到設定功能

![](TampermonkeySettings.png)

- 目前支援設定「設定經緯度增量範圍」，也就是開啟 [eBird 熱門鳥點](https://ebird.org/hotspots) 時預設地圖放大的範圍，預設值 0.05。數字越小，預設顯示地圖越放大。

### eBird 文字輸入助手

- 地點設定儲存在 Tampermonkey 本機空間，可自由新增、修改或刪除。
- 每個地名簡稱可設定 eBird 地點 ID、顯示名稱、預設距離與人數。
- 若文字中的地點或鳥種無法確定，助手會停止或列出錯誤，不會猜測後送出。

## 相關作品

請參考我製作的 [eBird 鳥訊快報整理](https://christorng.github.io/InfoProcess/eBird/)，幫助快速瀏覽 [eBird 鳥訊快報](https://ebird.org/alerts)郵件內容。

## 問題與建議

如果遇到任何問題或功能建議，請至 [GitHub 頁面](https://github.com/ChrisTorng/eBirdScripts/) 提交 [issue](https://github.com/ChrisTorng/eBirdScripts/issues)。
