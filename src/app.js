// 日檢弱點分析網頁 — UI 組裝。判定與評語邏輯一律走 logic.js，這裡不重複實作任何規則。
import { judge, assemble, validate } from "./logic.js";
import { parseDelimited, toCSV, download } from "./csv.js";

const DRAFT_KEY = "jlpt-comment-draft-v1";
const LEVEL_ORDER = ["N5", "N4", "N3", "N2", "N1"];
const BATCH_COLS = ["姓名", "級數", "言語知識", "讀解", "聽解", "文字語彙", "文法"];

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};
const num = (v) => (v === "" || v == null ? NaN : Number(v));

export function bootstrap(levels, baseComments) {
  const state = {
    levels,
    base: baseComments,
    comments: structuredClone(baseComments),
    draft: readDraft(),
    single: { level: "N5", lk: "", r: "", c: "", refVocab: "", refGrammar: "" },
    batch: { rows: [], raw: "" },
  };
  applyDraft(state);

  const app = $("#app");
  app.replaceChildren(
    el("div", { className: "tabs", role: "tablist" }),
    el("div", { id: "panel" }),
  );
  const tabsEl = $(".tabs", app);
  const panel = $("#panel", app);

  const tabs = [
    { id: "single", label: "單人模式", render: () => renderSingle(state) },
    { id: "batch", label: "批次模式", render: () => renderBatch(state) },
    { id: "editor", label: "評語編輯", render: () => renderEditor(state, () => show(current)) },
  ];
  let current = "single";
  const show = (id) => {
    current = id;
    for (const b of tabsEl.children) b.setAttribute("aria-selected", String(b.dataset.id === id));
    panel.replaceChildren(draftBanner(state, () => show(current)), tabs.find((t) => t.id === id).render());
    window.scrollTo({ top: 0 });
  };
  tabsEl.replaceChildren(...tabs.map((t) => {
    const b = el("button", { type: "button", textContent: t.label, onclick: () => show(t.id) });
    b.dataset.id = t.id;
    b.setAttribute("role", "tab");
    return b;
  }));
  show("single");
}

/* ---------------------------------------------------------------- 草稿 */

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}"); } catch { return {}; }
}
function writeDraft(draft) {
  try {
    if (Object.keys(draft).length) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch { /* 無痕模式等情況直接忽略，草稿僅存在記憶體 */ }
}
function applyDraft(state) {
  state.comments = structuredClone(state.base);
  for (const [key, patch] of Object.entries(state.draft)) {
    if (state.comments[key]) Object.assign(state.comments[key], patch);
  }
}
function draftBanner(state, rerender) {
  const n = Object.keys(state.draft).length;
  if (!n) return el("div");
  const wipe = el("button", {
    type: "button", className: "action ghost", textContent: "捨棄草稿、還原原始評語",
    onclick: () => { state.draft = {}; writeDraft(state.draft); applyDraft(state); rerender(); },
  });
  return el("div", { className: "banner" }, [
    el("div", { textContent: `目前套用「編輯草稿」，有 ${n} 則評語與 data/comments.json 不同。草稿只存在這台裝置的瀏覽器，正式生效請到「評語編輯」匯出 JSON 覆蓋 data/comments.json。` }),
    el("div", { className: "row" }, [wipe]),
  ]);
}

/* ------------------------------------------------------------ 判定描述 */

function failedSections(input, L) {
  const out = [];
  const check = (key, name, value) => {
    const sec = L.sections[key];
    if (!sec) return;
    if (Number.isFinite(value) && value < sec.min) out.push({ name, short: sec.min - value });
  };
  check("LK", L.sections.LK.name, num(input.lk));
  check("R", "讀解", num(input.r));
  check("C", "聽解", num(input.c));
  return out;
}

/** 產生給學生看的一行判定，例：不合格・聽解未達門檻（差 5 分） */
function verdictLine(j, input, L) {
  if (j.passed) return { cls: "pass", text: `合格（超過 ${j.diff} 分）` };
  const failed = failedSections(input, L);
  if (j.aCode === "單科未達") {
    const parts = failed.map((f) => `${f.name}未達門檻（差 ${f.short} 分）`).join("、");
    return { cls: "partial", text: `不合格・${parts}` };
  }
  const tail = failed.length ? `，另有 ${failed.map((f) => f.name).join("、")}未達門檻` : "";
  return { cls: "fail", text: `不合格（差 ${-j.diff} 分${tail}）` };
}

/* -------------------------------------------------------------- 單人模式 */

function renderSingle(state) {
  const form = el("div", { className: "card" });
  const result = el("div", { className: "card" });

  const rerender = () => {
    form.replaceChildren(...buildFields(state, rerender, paint));
    paint();
  };
  const paint = () => result.replaceChildren(...buildResult(state));

  form.replaceChildren(...buildFields(state, rerender, paint));
  paint();
  return el("div", {}, [form, result]);
}

function buildFields(state, rerenderAll, repaint) {
  const s = state.single;
  const L = state.levels[s.level];
  const out = [el("h2", { textContent: "輸入成績" })];

  const levelSel = el("select", {
    value: s.level,
    onchange: (e) => { s.level = e.target.value; s.r = ""; rerenderAll(); },
  }, LEVEL_ORDER.map((lv) => el("option", { value: lv, textContent: `${lv}（及格 ${state.levels[lv].pass} 分）`, selected: lv === s.level })));
  out.push(el("div", { className: "field" }, [el("label", { textContent: "級數" }), levelSel]));

  const scoreField = (prop, label, sec) => {
    const input = el("input", {
      type: "number", inputMode: "numeric", min: 0, max: sec.max, step: 1,
      value: s[prop], placeholder: `0 – ${sec.max}`,
      oninput: (e) => { s[prop] = e.target.value; repaint(); },
    });
    return el("div", { className: "field" }, [
      el("label", { textContent: `${label}（0–${sec.max}，門檻 ${sec.min}）` }), input,
    ]);
  };
  out.push(scoreField("lk", L.sections.LK.name, L.sections.LK));
  if (L.sections.R) out.push(scoreField("r", "讀解", L.sections.R));
  out.push(scoreField("c", "聽解", L.sections.C));

  const abc = (prop, label) => {
    const seg = el("div", { className: "seg" }, ["A", "B", "C"].map((v) => {
      const b = el("button", { type: "button", textContent: v, onclick: () => { s[prop] = v; rerenderAll(); } });
      b.setAttribute("aria-pressed", String(s[prop] === v));
      return b;
    }));
    return el("div", { className: "field" }, [el("span", { className: "lab", textContent: `參考情報 ${label}` }), seg]);
  };
  out.push(abc("refVocab", "文字・語彙"), abc("refGrammar", "文法"));
  out.push(el("p", { className: "hint", textContent: "參考情報是成績單上「参考情報」欄的 A／B／C。總分由網頁自動加總，不需另外填。" }));
  return out;
}

function buildResult(state) {
  const s = state.single;
  const L = state.levels[s.level];
  const untouched = s.lk === "" && s.c === "" && s.r === "" && !s.refVocab && !s.refGrammar;
  if (untouched) return [el("h2", { textContent: "結果" }), el("p", { className: "detail", textContent: "填好上面的欄位就會自動算出總分與評語。" })];

  const input = { level: s.level, lk: s.lk, r: L.sections.R ? s.r : undefined, c: s.c, refVocab: s.refVocab, refGrammar: s.refGrammar };
  const errs = validate(input, state.levels);
  if (errs.length) {
    return [
      el("h2", { textContent: "結果" }),
      el("div", { className: "errors" }, [el("ul", {}, errs.map((e) => el("li", { textContent: e })))]),
    ];
  }

  const out = assemble(input, state.levels, state.comments);
  const v = verdictLine(out, input, L);
  const copyBtn = el("button", { type: "button", className: "action", textContent: "複製評語", onclick: () => copy(out.text, copyBtn) });

  return [
    el("h2", { textContent: "結果" }),
    el("div", { className: "verdict" }, [
      el("div", { className: "total" }, [document.createTextNode(String(out.total)), el("small", { textContent: ` / ${L.totalMax} 分` })]),
      el("span", { className: `badge ${v.cls}`, textContent: v.text }),
    ]),
    el("p", { className: "detail" }, [
      document.createTextNode(`${s.level} 及格分 ${L.pass}。各科：`),
      el("strong", { textContent: `${L.sections.LK.name} ${out.lkBand}` }),
      document.createTextNode("、"),
      ...(L.sections.R ? [el("strong", { textContent: `讀解 ${out.rBand}` }), document.createTextNode("、")] : []),
      el("strong", { textContent: `聽解 ${out.cBand}` }),
      document.createTextNode("。"),
    ]),
    el("div", { className: "comment", textContent: out.text }),
    el("div", { className: "row" }, [copyBtn]),
    detailBlock(out, L),
  ];
}

function detailBlock(out, L) {
  const dl = el("dl");
  const add = (k, v) => { dl.append(el("dt", { textContent: k }), el("dd", { textContent: v })); };
  add("總判定代碼", out.aCode);
  add(`${L.sections.LK.name}區間`, out.lkBand);
  if (out.rBand) add("讀解區間", out.rBand);
  add("聽解區間", out.cBand);
  add("參考情報組合", out.refRaw + (out.ref === out.refRaw ? "" : ` → ${out.ref}（高段塌縮）`));
  add("〇〇 代入", out.cItem);
  for (const [k, v] of Object.entries(out.keys)) if (v) add(`鍵 ${k}`, v);
  return el("details", { className: "debug" }, [el("summary", { textContent: "判定明細（老師 debug 用）" }), dl]);
}

/* -------------------------------------------------------------- 批次模式 */

function normLevel(v) { return String(v ?? "").trim().toUpperCase(); }
function normABC(v) { return String(v ?? "").trim().toUpperCase(); }

/** 解析一列 → { name, ok, out|errors, input } */
function runRow(cells, state) {
  const [name, lvRaw, lk, r, c, vocab, grammar] = cells.map((x) => String(x ?? "").trim());
  const level = normLevel(lvRaw);
  const L = state.levels[level];
  if (!L) return { name, level: lvRaw, ok: false, errors: [`級數「${lvRaw || "（空白）"}」不正確，需為 N1～N5`] };

  const hasR = !!L.sections.R;
  if (!hasR && r !== "" && Number(r) !== 0) {
    return { name, level, ok: false, errors: [`${level} 沒有獨立讀解科，讀解欄請留空（目前填 ${r}）`] };
  }
  const input = {
    level, lk, r: hasR ? r : undefined, c,
    refVocab: normABC(vocab), refGrammar: normABC(grammar),
  };
  const errors = validate(input, state.levels);
  if (errors.length) return { name, level, ok: false, errors };
  const out = assemble(input, state.levels, state.comments);
  return { name, level, ok: true, out, input, L };
}

function renderBatch(state) {
  const ta = el("textarea", {
    placeholder: `${BATCH_COLS.join(", ")}\n王小明, N5, 70, , 14, B, A\n陳小美, N2, 40, 28, 37, A, B`,
    value: state.batch.raw,
  });
  const file = el("input", { type: "file", accept: ".csv,.tsv,.txt,text/csv,text/plain" });
  const runBtn = el("button", { type: "button", className: "action", textContent: "產生評語" });
  const dlBtn = el("button", { type: "button", className: "action ghost", textContent: "下載 CSV", disabled: true });
  const output = el("div");

  const run = () => {
    state.batch.raw = ta.value;
    const text = ta.value.trim();
    if (!text) { output.replaceChildren(el("p", { className: "detail", textContent: "先貼上資料再按「產生評語」。" })); dlBtn.disabled = true; return; }
    let rows = parseDelimited(text);
    if (rows.length && String(rows[0][0] ?? "").trim().startsWith("姓名")) rows = rows.slice(1);
    const results = rows.map((cells) => runRow(cells, state));
    state.batch.rows = results;
    dlBtn.disabled = results.length === 0;
    output.replaceChildren(...buildBatchOutput(results, state));
  };
  runBtn.onclick = run;
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    ta.value = await f.text();
    run();
  };
  dlBtn.onclick = () => {
    const header = ["姓名", "級數", "總分", "判定", "評語"];
    const body = state.batch.rows.map((r) => r.ok
      ? [r.name, r.level, r.out.total, verdictLine(r.out, r.input, r.L).text, r.out.text]
      : [r.name, r.level, "", "資料有誤", r.errors.join("；")]);
    download(`日檢評語_${stamp()}.csv`, toCSV([header, ...body]));
  };

  return el("div", {}, [
    el("div", { className: "card" }, [
      el("h2", { textContent: "批次模式" }),
      el("div", { className: "field" }, [
        el("label", { textContent: "貼上 CSV 或從 Google Sheet 複製的資料" }), ta,
        el("p", { className: "hint", textContent: `欄位順序：${BATCH_COLS.join(" / ")}。N4、N5 的「讀解」欄留空。有標題列會自動略過。` }),
      ]),
      el("div", { className: "row" }, [runBtn, dlBtn, file]),
    ]),
    output,
  ]);
}

function buildBatchOutput(results, state) {
  if (!results.length) return [el("p", { className: "detail", textContent: "沒有讀到任何資料列。" })];
  const okRows = results.filter((r) => r.ok);

  const table = el("table", {}, [
    el("thead", {}, [el("tr", {}, ["#", "姓名", "級數", "總分", "判定", "評語"].map((h) => el("th", { textContent: h })))]),
    el("tbody", {}, results.map((r, i) => {
      if (!r.ok) {
        const tr = el("tr", { className: "err" }, [
          el("td", { textContent: String(i + 1) }),
          el("td", { textContent: r.name || "（無姓名）" }),
          el("td", { textContent: r.level || "—" }),
          el("td", { colSpan: 3, textContent: `資料有誤：${r.errors.join("；")}` }),
        ]);
        return tr;
      }
      const v = verdictLine(r.out, r.input, r.L);
      return el("tr", {}, [
        el("td", { textContent: String(i + 1) }),
        el("td", { className: "nowrap", textContent: r.name || "—" }),
        el("td", { textContent: r.level }),
        el("td", { textContent: String(r.out.total) }),
        el("td", {}, [el("span", { className: `badge ${v.cls}`, textContent: v.text })]),
        el("td", { className: "cmt", textContent: r.out.text }),
      ]);
    })),
  ]);

  const nErr = results.length - okRows.length;
  const head = el("p", { className: "detail", textContent: `共 ${results.length} 列，成功 ${okRows.length} 列${nErr ? `，${nErr} 列有誤（標紅）` : ""}。` });
  return [
    el("div", { className: "card" }, [el("h2", { textContent: "結果" }), head, el("div", { className: "scroll" }, [table])]),
    ...(okRows.length ? [buildStats(okRows, state)] : []),
  ];
}

function buildStats(rows, state) {
  const byLevel = new Map();
  for (const r of rows) {
    const e = byLevel.get(r.level) ?? { n: 0, pass: 0 };
    e.n += 1; if (r.out.passed) e.pass += 1;
    byLevel.set(r.level, e);
  }
  const secFail = new Map();
  for (const r of rows) for (const f of failedSections(r.input, r.L)) secFail.set(f.name, (secFail.get(f.name) ?? 0) + 1);
  const cVocab = rows.filter((r) => r.input.refVocab === "C").length;
  const cGram = rows.filter((r) => r.input.refGrammar === "C").length;

  const cards = [...byLevel.entries()]
    .sort((a, b) => LEVEL_ORDER.indexOf(b[0]) - LEVEL_ORDER.indexOf(a[0]))
    .map(([lv, e]) => el("div", { className: "stat" }, [
      el("b", { textContent: `${Math.round((e.pass / e.n) * 100)}%` }),
      el("span", { textContent: `${lv} 合格率（${e.pass}/${e.n}）` }),
    ]));

  const worst = [...secFail.entries()].sort((a, b) => b[1] - a[1])[0];
  cards.push(el("div", { className: "stat" }, [
    el("b", { textContent: worst ? String(worst[1]) : "0" }),
    el("span", { textContent: worst ? `人「${worst[0]}」未達門檻（最多）` : "沒有人單科未達門檻" }),
  ]));
  cards.push(el("div", { className: "stat" }, [
    el("b", { textContent: cVocab === cGram ? "持平" : cVocab > cGram ? "單字" : "文法" }),
    el("span", { textContent: `參考情報 C 集中處（單字 ${cVocab} 人 / 文法 ${cGram} 人）` }),
  ]));

  const detail = [...secFail.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} 人`).join("、");
  return el("div", { className: "card" }, [
    el("h2", { textContent: "全班統計" }),
    el("div", { className: "stats" }, cards),
    ...(detail ? [el("p", { className: "hint", textContent: `未達門檻人次：${detail}` })] : []),
  ]);
}

/* ------------------------------------------------------------ 評語編輯器 */

const TABLE_LABEL = { A_總判定: "表A 總判定", B_言語知識: "表B 言語知識", R_讀解: "表R 讀解", C_聽解: "表C 聽解" };

function renderEditor(state, rerenderShell) {
  const pick = { level: "N5", table: "A_總判定" };
  const list = el("div");

  const paint = () => {
    const keys = Object.keys(state.base).filter((k) => k.startsWith(`${pick.level}|${pick.table}|`));
    list.replaceChildren(...(keys.length
      ? keys.map((k) => editorItem(state, k, rerenderShell))
      : [el("p", { className: "detail", textContent: "這個級數沒有這張表（N4／N5 沒有獨立讀解科）。" })]));
  };

  const levelSel = el("select", { onchange: (e) => { pick.level = e.target.value; paint(); } },
    LEVEL_ORDER.map((lv) => el("option", { value: lv, textContent: lv, selected: lv === pick.level })));
  const tableSel = el("select", { onchange: (e) => { pick.table = e.target.value; paint(); } },
    Object.entries(TABLE_LABEL).map(([v, t]) => el("option", { value: v, textContent: t, selected: v === pick.table })));

  const exportBtn = el("button", {
    type: "button", className: "action", textContent: "匯出 comments.json",
    onclick: () => download("comments.json", JSON.stringify(state.comments, null, 2), "application/json;charset=utf-8"),
  });
  const resetBtn = el("button", {
    type: "button", className: "action ghost", textContent: "全部還原",
    onclick: () => { state.draft = {}; writeDraft(state.draft); applyDraft(state); rerenderShell(); },
  });

  paint();
  return el("div", {}, [
    el("div", { className: "card" }, [
      el("h2", { textContent: "評語編輯" }),
      el("p", { className: "hint", textContent: "改動會立刻套用到「單人／批次」模式（存在這台裝置的瀏覽器草稿裡）。要讓所有人生效，請匯出 comments.json 覆蓋專案的 data/comments.json 再重新部署。" }),
      el("div", { className: "row" }, [levelSel, tableSel, exportBtn, resetBtn]),
    ]),
    el("div", { className: "card" }, [list]),
  ]);
}

function editorItem(state, key, rerenderShell) {
  const base = state.base[key];
  const cur = state.comments[key];
  const box = el("div", { className: "ed-group" });
  const flag = el("span", { className: "edited", textContent: state.draft[key] ? "已修改" : "" });
  box.append(el("div", {}, [el("span", { className: "ed-key", textContent: key }), document.createTextNode(" "), flag]));
  if (base.desc) box.append(el("p", { className: "hint", textContent: base.desc }));

  const fieldFor = (prop, label) => {
    const ta = el("textarea", { value: cur[prop] ?? "" });
    ta.oninput = () => {
      const v = ta.value;
      const patch = state.draft[key] ?? {};
      if (v === base[prop]) delete patch[prop]; else patch[prop] = v;
      if (Object.keys(patch).length) state.draft[key] = patch; else delete state.draft[key];
      state.comments[key][prop] = v;
      writeDraft(state.draft);
      flag.textContent = state.draft[key] ? "已修改" : "";
    };
    return el("div", { className: "ed-item" }, [el("span", { className: "lab", textContent: label }), ta]);
  };
  if (base.opener != null) box.append(fieldFor("opener", "開頭句"), fieldFor("closer", "結尾句"));
  else box.append(fieldFor("text", "評語"));
  return box;
}

/* ------------------------------------------------------------------ 雜項 */

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function toast(msg) {
  let t = $(".toast");
  if (!t) { t = el("div", { className: "toast" }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("on"), 1600);
}

async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el("textarea", { value: text });
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta); ta.select();
    try { document.execCommand("copy"); } catch { toast("複製失敗，請手動選取"); ta.remove(); return; }
    ta.remove();
  }
  toast("已複製評語");
  if (btn) { const o = btn.textContent; btn.textContent = "已複製 ✓"; setTimeout(() => { btn.textContent = o; }, 1400); }
}
