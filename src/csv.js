// CSV / TSV 解析與輸出（零依賴）。批次模式用。

/** 自動判斷分隔符號：Google Sheet 複製出來是 tab，檔案上傳多半是逗號。 */
export function sniffDelimiter(text) {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return line.split("\t").length > line.split(",").length ? "\t" : ",";
}

/** RFC 4180 風格解析，支援引號內的分隔符號、換行與 "" 跳脫。 */
export function parseDelimited(text, delimiter) {
  const d = delimiter ?? sniffDelimiter(text);
  const rows = [];
  let row = [], cell = "", quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === d) { row.push(cell); cell = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const esc = (v) => {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** 輸出 CSV 字串；加 BOM 讓 Excel 開啟中文不亂碼。 */
export function toCSV(rows, { bom = true } = {}) {
  const body = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  return (bom ? "﻿" : "") + body;
}

export function download(filename, content, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
