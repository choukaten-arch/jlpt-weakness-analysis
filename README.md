# 日檢弱點分析

學生輸入 JLPT 正式成績 → 自動產生老師口吻的弱點分析評語。
純前端、免後端、免登入。原本是 Google Sheet 查表，現在是一個網頁。

- **單人模式**：學生自己輸入分數，即時看到總分、合格判定與完整評語，一鍵複製。
- **批次模式**：老師貼上全班成績（CSV／從 Google Sheet 複製的 TSV），一次產生所有評語，下載 CSV 貼回 Sheet。
- **評語編輯**：老師直接在網頁上改評語、匯出 `comments.json`，不需要碰程式或 Python。

## 兩種開啟方式

| 方式 | 指令／檔案 | 什麼時候用 |
|---|---|---|
| 本機伺服器 | `npm start` → http://localhost:4173 | 開發、或想「改 JSON 立刻生效」時 |
| 單檔版 | `npm run build` → `dist/index.html` | 直接用瀏覽器開檔案（`file://`）、或寄給別人 |

```bash
npm test     # 6 個測試，改任何東西後都要保持全綠
npm start    # 本機預覽
npm run build  # 產生 dist/index.html（單檔、已內嵌資料）
```

**為什麼要有單檔版？** 瀏覽器在 `file://` 下會擋掉 `fetch` 和 ES module 載入（CORS），所以根目錄的
`index.html` 只能在 http(s) 下運作。`npm run build` 會把 CSS、JS 與兩份 JSON 全部內嵌成一個
`dist/index.html`，沒有任何外部請求，雙擊就能開。兩邊跑的是同一份 `src/logic.js`，不會有兩套邏輯。

## 部署到 GitHub Pages

Settings → Pages → Source 選 **Deploy from a branch**，branch `main`、資料夾 `/ (root)`。
根目錄的 `index.html` 會直接被服務，`data/*.json` 用 fetch 讀取，所以**改完 JSON 推上去就生效**，不用 build。

> 私有 repo 要開 GitHub Pages 需要 GitHub Pro／Team 方案。免費方案的私有 repo 只能在本機用
> `npm start`，或把 `dist/index.html` 直接傳給需要的人。

## 老師要改評語

**建議做法（不需要終端機）**：開網頁 → 「評語編輯」分頁 → 選級數與表 → 直接改 → 「匯出 comments.json」，
把下載到的檔案覆蓋 `data/comments.json`，推上 GitHub 即可。

編輯中的內容會即時套用到「單人／批次」模式，方便先預覽；草稿只存在**你這台裝置的瀏覽器**裡，
別人看到的還是 `data/comments.json`。所以改完一定要匯出、覆蓋、推上去，才算真的生效。

**原本的 Python 流程目前不能用**：`reference/comments.py` 用了 Python 3.12+ 的 f-string 語法，
開發機上只有 Apple 內建的 Python 3.9.6，`python export_json.py` 會 SyntaxError。
要沿用那條路徑得先裝 Python 3.12+。`reference/` 底下的檔案現在等同歷史存檔與對照用。

## 目錄

```
index.html             網頁本體（模組版，需 http 服務）
src/logic.js           判定 + 評語組裝（純函式，唯一的規則來源，未改動）
src/app.js             UI 組裝：單人／批次／評語編輯
src/csv.js             CSV／TSV 解析與輸出
src/data.js            讀取 data/*.json
src/style.css          樣式（手機優先、跟隨系統深淺色）
scripts/build.mjs      產生 dist/index.html 單檔版
scripts/serve.mjs      本機靜態伺服器（零依賴）
data/levels.json       級數設定（及格分、門檻、分段線）
data/comments.json     172 筆評語（key: 級數|表|區間代碼|參考情報）
tests/                 測試 + 三位範例學生的預期輸出
dist/index.html        建置產物，單檔版（有進版控，方便直接分享）
reference/             Excel 版與 Python 產生來源，唯讀對照
```

## 批次模式的資料格式

欄位順序：`姓名, 級數, 言語知識, 讀解, 聽解, 文字語彙, 文法`

- 有標題列會自動略過（第一格以「姓名」開頭即視為標題）。
- **N4／N5 的「讀解」欄留空**（這兩級是「言語知識・讀解」合併計分）。填了非 0 的數字會被判為錯誤。
- 逗號或 Tab 都可以，會自動判斷；從 Google Sheet 直接複製貼上即可。
- 有錯的列會標紅並寫明原因，不會讓整批失敗。
- 下載的 CSV 含 BOM，Excel 開啟中文不會亂碼；錯誤列也會保留在同樣的位置，方便整欄貼回 Sheet。

## 實作時自己下的決定

CLAUDE.md 沒講到、或與現有資料有出入的地方，決定與理由記在這裡：

1. **總分自動加總，不讓使用者填。** 老師的 Excel「試算」分頁裡總分是獨立的手填輸入格（`B4` 是寫死的
   數字，沒有公式），但 CLAUDE.md 要求自動算。採用 CLAUDE.md 的做法，少一個抄錯的機會；畫面上會把
   算出來的總分放大顯示，學生對照成績單時如果對不上，就知道某一科抄錯了。
2. **不用 Vite，自己寫 40 行的內嵌腳本。** CLAUDE.md 允許用 Vite，但這個專案只需要「把幾個檔案串成
   一個 HTML」，用 `scripts/build.mjs` 就夠，零依賴、`npm install` 都不用跑。
3. **`dist/` 改成進版控。** 原本的 `.gitignore` 忽略 `dist/`（Vite 慣例），但這裡的 `dist/index.html`
   是要直接交付給人的單檔成品，留在 repo 裡比較有用。
4. **評語編輯器用 localStorage 存草稿。** CLAUDE.md 說「MVP 連 localStorage 都不需要」，指的是學生用的
   流程——學生端確實沒有用到。編輯器如果不存草稿，重新整理就把老師改的東西全部弄丟，所以只有這一個
   功能會寫 localStorage，而且畫面上有明顯的橫幅與「捨棄草稿」按鈕。
5. **批次模式的欄位順序照 CLAUDE.md 寫死。** 老師的 Google Sheet 裡沒有學生名冊分頁（只有 說明／
   級別設定／評語清單／試算），所以沒有真實欄位可以對齊。之後若有全班成績的 Sheet，再依它調整。

## 驗證紀錄

- `npm test` 6 個測試全綠。
- `tests/fixtures.json` 三位學生在單人模式的評語與 fixture **逐字相同**，四個查表鍵也相同。
- N5 言語知識・讀解 70／聽解 14／參考情報 B・A → 顯示「不合格・聽解未達門檻（差 5 分）」，
  評語開頭為「這次總分其實已經到了…」。
- 批次貼入三列（含一列 130 分的錯誤資料）→ 兩列正常、一列標紅並寫明原因；下載的 CSV 開頭是
  `EF BB BF`（BOM），含逗號與引號的評語有正確跳脫並可回讀。
- 375px 寬度下沒有橫向捲動。
- `data/*.json` 與 `reference/` 的 xlsx 逐格比對，172 筆評語與級別設定**完全一致**。
