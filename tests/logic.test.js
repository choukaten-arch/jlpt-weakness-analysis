// node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { judge, assemble, validate } from "../src/logic.js";

const levels = JSON.parse(readFileSync(new URL("../data/levels.json", import.meta.url)));
const comments = JSON.parse(readFileSync(new URL("../data/comments.json", import.meta.url)));
const fixtures = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url)));

test("fixtures from xlsx 試算 sheet reproduce exactly", () => {
  for (const f of fixtures) {
    const out = assemble(f.input, levels, comments);
    assert.deepEqual(out.keys, f.keys);
    assert.equal(out.text, f.text);
  }
});

test("single-section fail takes priority only when total passes", () => {
  const a = judge({ level: "N5", lk: 70, c: 14, refVocab: "A", refGrammar: "A" }, levels);
  assert.equal(a.aCode, "單科未達");
  const b = judge({ level: "N5", lk: 40, c: 14, refVocab: "A", refGrammar: "A" }, levels); // total 54 → 差20+
  assert.equal(b.aCode, "差20+");
});

test("band edges", () => {
  const s = levels.N5.sections.LK; // min 38 lowMax 59 midMax 89
  const b = (x) => judge({ level: "N5", lk: x, c: 30, refVocab: "A", refGrammar: "A" }, levels).lkBand;
  assert.equal(b(37), "未達"); assert.equal(b(38), "偏低"); assert.equal(b(59), "偏低");
  assert.equal(b(60), "中"); assert.equal(b(89), "中"); assert.equal(b(90), "高");
  assert.ok(s);
});

test("high band collapses odd ref combos to 其他; 〇〇 substitution", () => {
  const j = judge({ level: "N4", lk: 100, c: 50, refVocab: "B", refGrammar: "B" }, levels);
  assert.equal(j.ref, "其他");
  const o = assemble({ level: "N3", lk: 25, r: 30, c: 30, refVocab: "C", refGrammar: "B" }, levels, comments);
  assert.ok(o.parts.lk.includes("單字這塊")); assert.ok(!o.parts.lk.includes("〇〇"));
});

test("every key in comments.json is reachable and no key is missing", () => {
  const keys = new Set(Object.keys(comments));
  const seen = new Set();
  for (const level of Object.keys(levels)) {
    const L = levels[level];
    for (let lk = 0; lk <= L.sections.LK.max; lk += 1)
      for (let c = 0; c <= 60; c += 3)
        for (const r of L.sections.R ? [0, 20, 40, 60] : [undefined])
          for (const v of "ABC") for (const g of "ABC") {
            const j = judge({ level, lk, r, c, refVocab: v, refGrammar: g }, levels);
            for (const k of Object.values(j.keys)) if (k) { assert.ok(keys.has(k), `missing ${k}`); seen.add(k); }
          }
  }
  for (const k of keys) assert.ok(seen.has(k), `unreachable ${k}`);
});

test("validate catches out-of-range and missing", () => {
  assert.deepEqual(validate({ level: "N5", lk: 70, c: 30, refVocab: "A", refGrammar: "B" }, levels), []);
  assert.ok(validate({ level: "N5", lk: 130, c: 30, refVocab: "A", refGrammar: "B" }, levels).length > 0);
  assert.ok(validate({ level: "N2", lk: 30, c: 30, refVocab: "A", refGrammar: "B" }, levels).length > 0); // 讀解未填
});
