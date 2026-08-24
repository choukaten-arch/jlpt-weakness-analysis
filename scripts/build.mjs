// 產生 dist/index.html：把 CSS、logic.js/csv.js/app.js 與兩份 JSON 全部內嵌成單一檔案。
// 目的是讓「用瀏覽器直接開檔案（file://）」也能運作——瀏覽器會擋掉 file:// 下的
// fetch 與 ES module 載入，所以單檔版不能有任何 import 或 fetch。
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (p) => readFile(new URL(p, root), "utf8");

// 只移除模組語法：import 整行拿掉、export 前綴拿掉。模組是自己寫的，寫法固定，夠用。
const strip = (src) => src
  .replace(/^\s*import[\s\S]*?;\s*$/gm, "")
  .replace(/^export\s+(?=(async\s+)?(function|const|let|class)\b)/gm, "")
  .trim();

const [html, css, logic, csv, app, levels, comments] = await Promise.all([
  read("index.html"), read("src/style.css"),
  read("src/logic.js"), read("src/csv.js"), read("src/app.js"),
  read("data/levels.json"), read("data/comments.json"),
]);

// JSON 直接內嵌成字面值；</script> 在字串裡會提早結束 script 標籤，先拆開。
const inline = (json) => json.replaceAll("</", "<\\/");

const bundle = [
  `const LEVELS = ${inline(levels)};`,
  `const COMMENTS = ${inline(comments)};`,
  strip(logic), strip(csv), strip(app),
  `bootstrap(LEVELS, COMMENTS);`,
].join("\n\n");

let out = html
  .replace('<link rel="stylesheet" href="src/style.css">', `<style>\n${css}\n</style>`)
  .replace(/<script type="module">[\s\S]*?<\/script>/, `<script type="module">\n${bundle}\n</script>`);

if (out.includes("src/style.css") || out.includes("./src/app.js")) {
  throw new Error("內嵌失敗：dist 仍然參照 src/，請檢查 index.html 的標籤有沒有被改過");
}

await mkdir(new URL("dist/", root), { recursive: true });
await writeFile(new URL("dist/index.html", root), out);
console.log(`dist/index.html  ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB（單檔、可 file:// 直接開）`);
