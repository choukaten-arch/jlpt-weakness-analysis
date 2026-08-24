// 評語資料載入。以 http(s) 提供服務時直接讀 data/*.json，改 JSON 立即生效。
// 用 file:// 直接開啟時瀏覽器會擋掉 fetch 與模組載入，該情境請改用 npm run build 產出的
// dist/index.html（已把資料內嵌）。詳見 README「兩種開啟方式」。

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path} 讀取失敗（HTTP ${res.status}）`);
  return res.json();
}

export async function loadData() {
  const [levels, comments] = await Promise.all([
    loadJSON("./data/levels.json"),
    loadJSON("./data/comments.json"),
  ]);
  return { levels, comments };
}
