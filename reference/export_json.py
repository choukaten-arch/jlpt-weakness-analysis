# -*- coding: utf-8 -*-
"""從 comments.py 重新產生 ../data/levels.json 與 ../data/comments.json。改完評語後執行：python export_json.py"""
import json, os
from comments import LEVELS, table_A, table_B, table_R, table_C, rare_note, COMBO_DESC
here = os.path.dirname(os.path.abspath(__file__)); data = os.path.join(here, "..", "data")
levels = {}
for lv, p in LEVELS.items():
    secs = {"LK": {"name": p["subj"], "max": p["lk_max"], "min": p["lk_min"], "lowMax": p["lk_low"], "midMax": p["lk_mid"]}}
    if p["has_r"]: secs["R"] = {"name": "讀解", "max": 60, "min": p["r_min"], "lowMax": p["r_low"], "midMax": p["r_mid"]}
    secs["C"] = {"name": "聽解", "max": 60, "min": p["c_min"], "lowMax": p["c_low"], "midMax": p["c_mid"]}
    levels[lv] = {"pass": p["pass_"], "next": p["nxt"], "sections": secs, "totalMax": 180}
comments = {}
for lv in ["N1", "N2", "N3", "N4", "N5"]:
    for code, desc, op, cl in table_A(lv):
        comments[f"{lv}|A_總判定|{code}|-"] = {"opener": op, "closer": cl, "desc": desc}
    for band, d in table_B(lv).items():
        for combo, text in d.items():
            comments[f"{lv}|B_言語知識|{band}|{combo}"] = {"text": text, "desc": COMBO_DESC[combo], "note": rare_note(lv, band, combo)}
    if LEVELS[lv]["has_r"]:
        for band, text in table_R(lv).items(): comments[f"{lv}|R_讀解|{band}|-"] = {"text": text}
    for band, text in table_C(lv).items(): comments[f"{lv}|C_聽解|{band}|-"] = {"text": text}
json.dump(levels, open(os.path.join(data, "levels.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump(comments, open(os.path.join(data, "comments.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("exported", len(comments), "comments")
