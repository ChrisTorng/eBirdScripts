# eBird Scripts

## 緣起

使用新版 [eBird](https://ebird.org) 網站中，發現一些不甚好用的地方，因此製作此腳本以改善使用體驗。

## 功能

eBird Scripts 是一個 [Tampermonkey](https://www.tampermonkey.net/) 使用者腳本，用於增強 [eBird](https://ebird.org) 網站的功能。

- 日期格式由「21 十月 2024」或「21日 10月 2024年」改為「2024/10/21」格式顯示。
- [eBird 熱門鳥點](https://ebird.org/hotspots)
  - 開啟地圖時自動定位到目前位置，時間範圍設為今年全年度。
  - 點出各別地點的彈跳畫面內，新增「最近鳥種」及「最近紀錄」連結。

![](demo.png)

## 安裝

1. **安裝 [Tampermonkey](https://www.tampermonkey.net/)**<br>
   這是一個可用於管理使用者腳本的瀏覽器擴充套件。

2. **點選[安裝 eBird Scripts](https://github.com/ChrisTorng/eBirdScripts/raw/main/eBirdScripts.user.js)**<br>
   會自動開啟 Tampermonkey Install 畫面，請按 Install 鈕安裝。

3. 若先前已開啟了 [eBird](https://ebird.org/) 相關網頁，請重新整理網頁。

## 使用說明

- 進入 [eBird 熱門鳥點](https://ebird.org/hotspots) 時，預設會定位到目前所在位置，時間範圍設定為今年全年。

- 在 [eBird 熱門鳥點](https://ebird.org/hotspots) 中點開任一熱點時，會看到新增的「最近鳥種」和「最近紀錄」的連結。

- 在各 eBird 網頁中的中文日期，會代換為 2021/10/21 的格式，比如在 [我的 eBird](https://ebird.org/myebird)
 中「最新紀錄清單」裡的日期

## 設定

- 開啟 Tampermonkey 外掛畫面，或由 [eBird](https://ebird.org/) 網站中 (除地圖外) 任意處按右鍵，選擇 Tampermonkey - eBird Scripts 之下，可看到設定功能

![](TampermonkeySettings.png)

- 目前支援設定「設定經緯度增量範圍」，也就是開啟 [eBird 熱門鳥點](https://ebird.org/hotspots) 時預設地圖放大的範圍，預設值 0.05。數字越小，預設顯示地圖越放大。

## 相關作品

請參考我製作的 [eBird 鳥訊快報整理](https://christorng.github.io/InfoProcess/eBird/)，幫助快速瀏覽 [eBird 鳥訊快報](https://ebird.org/alerts)郵件內容。

## 問題與建議

如果遇到任何問題或功能建議，請至 [GitHub 頁面](https://github.com/ChrisTorng/eBirdScripts/) 提交 [issue](https://github.com/ChrisTorng/eBirdScripts/issues)。