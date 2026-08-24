// 日檢弱點分析 — 判定與評語組裝邏輯（參考實作，純函式、零依賴）
// 與 reference/ 內 xlsx「試算」分頁的公式完全對應。前端可直接 import 使用。

/**
 * @typedef {Object} ScoreInput
 * @property {"N1"|"N2"|"N3"|"N4"|"N5"} level
 * @property {number} lk   言語知識分數（N4/N5 為「言語知識・讀解」合併分數 0–120；N1–N3 為 0–60）
 * @property {number} [r]  讀解分數 0–60（僅 N1–N3）
 * @property {number} c    聽解分數 0–60
 * @property {"A"|"B"|"C"} refVocab   參考情報 文字・語彙
 * @property {"A"|"B"|"C"} refGrammar 參考情報 文法
 * @property {number} [total] 總分；省略時 = lk + r + c
 */

export function bandOf(score, sec) {
  if (score < sec.min) return "未達";
  if (score <= sec.lowMax) return "偏低";
  if (score <= sec.midMax) return "中";
  return "高";
}

export function refCode(v, g) {
  if (v === "C" && g === "C") return "CC";
  if (v === "C" || g === "C") return "C1";
  return v + g; // AA / AB / BA / BB
}

export function judge(input, levels) {
  const L = levels[input.level];
  if (!L) throw new Error(`unknown level ${input.level}`);
  const hasR = !!L.sections.R;
  const lk = Number(input.lk), c = Number(input.c), r = hasR ? Number(input.r ?? 0) : 0;
  const total = input.total != null ? Number(input.total) : lk + r + c;
  const diff = total - L.pass;

  const sectionFail = lk < L.sections.LK.min || (hasR && r < L.sections.R.min) || c < L.sections.C.min;
  let aCode;
  if (diff >= 0 && sectionFail) aCode = "單科未達";
  else if (diff <= -20) aCode = "差20+";
  else if (diff < 0) aCode = "差1-19";
  else if (diff < 15) aCode = "過0-14";
  else if (diff < 40) aCode = "過15-39";
  else aCode = "過40+";

  const lkBand = bandOf(lk, L.sections.LK);
  const rBand = hasR ? bandOf(r, L.sections.R) : null;
  const cBand = bandOf(c, L.sections.C);

  const raw = refCode(input.refVocab, input.refGrammar);
  const ref = lkBand === "高" ? (["AA", "AB", "BA"].includes(raw) ? raw : "其他") : raw;
  const cItem = input.refVocab === "C" ? "單字" : "文法"; // 〇〇 代入

  return {
    total, diff, pass: L.pass, passed: diff >= 0 && !sectionFail, sectionFail,
    aCode, lkBand, rBand, cBand, refRaw: raw, ref, cItem,
    keys: {
      A: `${input.level}|A_總判定|${aCode}|-`,
      B: `${input.level}|B_言語知識|${lkBand}|${ref}`,
      R: hasR ? `${input.level}|R_讀解|${rBand}|-` : null,
      C: `${input.level}|C_聽解|${cBand}|-`,
    },
  };
}

export function assemble(input, levels, comments) {
  const j = judge(input, levels);
  const get = (k) => { if (!comments[k]) throw new Error(`missing comment: ${k}`); return comments[k]; };
  const A = get(j.keys.A);
  const parts = {
    opener: A.opener,
    lk: get(j.keys.B).text.replaceAll("〇〇", j.cItem),
    r: j.keys.R ? get(j.keys.R).text : "",
    c: get(j.keys.C).text,
    closer: A.closer,
  };
  return { ...j, parts, text: parts.opener + parts.lk + parts.r + parts.c + parts.closer };
}

/** 輸入檢查：回傳錯誤訊息陣列（空陣列＝合法） */
export function validate(input, levels) {
  const errs = [];
  const L = levels[input.level];
  if (!L) return ["級數不正確"];
  const chk = (v, sec, label) => {
    if (v == null || v === "" || Number.isNaN(Number(v))) errs.push(`${label}未填`);
    else if (v < 0 || v > sec.max) errs.push(`${label}需在 0～${sec.max}`);
  };
  chk(input.lk, L.sections.LK, L.sections.LK.name);
  if (L.sections.R) chk(input.r, L.sections.R, "讀解");
  chk(input.c, L.sections.C, "聽解");
  for (const [k, label] of [["refVocab", "文字・語彙"], ["refGrammar", "文法"]]) {
    if (!["A", "B", "C"].includes(input[k])) errs.push(`參考情報 ${label} 需為 A/B/C`);
  }
  return errs;
}
