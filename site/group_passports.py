"""Documentary snapshots of issuer disclosures, separate from FNS legal entities."""
import json,re
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit
FILE="group-passports.json"
HOSTS={"ar2025.phosagro.ru","limited.rosneft.ru","www.x5.ru","www.company.rt.ru","storage.ir.mts.ru","rspp.ru","storage.yandexcloud.net"}
def quality(d):
    if d.get("schema")!=1 or d.get("mode")!="documentary_snapshot":raise ValueError("Тип снимка")
    from datetime import date
    checked=date.fromisoformat(d["checked"])
    ids=set();count=0
    for g in d["groups"]:
        if not re.fullmatch(r"[a-z0-9-]+",g["id"]) or g["id"] in ids or g["scope"]!="consolidated" or g["standard"]!="IFRS":raise ValueError("Периметр группы")
        ids.add(g["id"])
        u=urlsplit(g["source"])
        if u.scheme!="https" or u.hostname not in HOSTS or not all(g[k] for k in ("name","sector","role","section")):raise ValueError("Паспорт источника")
        mids=set()
        for m in g["metrics"]:
            if m["id"] in mids or m["unit"] not in ("млн руб.","млрд руб.","%","тыс. т") or not m["label"]:raise ValueError("Показатель")
            if m.get("comparable") is not None and (m["comparable"]!="annual_consolidated_revenue_rub" or m["id"]!="revenue" or m["unit"] not in ("млн руб.","млрд руб.")):raise ValueError("Несопоставимый показатель")
            mids.add(m["id"]);years=[]
            for r in m["observations"]:
                if type(r["year"]) is not int or not 1990<=r["year"]<checked.year or not re.fullmatch(r"-?\d+(?:\.\d+)?",r["value"]):raise ValueError("Наблюдение")
                if not Decimal(r["value"]).is_finite():raise ValueError("Число")
                years.append(r["year"]);count+=1
            if not years or years!=sorted(set(years)):raise ValueError("Дубликаты лет")
        if {"assets","equity","liabilities"}<=mids:
            balance={m["id"]:{r["year"]:Decimal(r["value"]) for r in m["observations"]} for m in g["metrics"] if m["id"] in ("assets","equity","liabilities")}
            for year in balance["assets"].keys() & balance["equity"].keys() & balance["liabilities"].keys():
                if balance["assets"][year]!=balance["equity"][year]+balance["liabilities"][year]:raise ValueError("Баланс активов и обязательств")
        if not mids:raise ValueError("Нет показателей")
    if not ids:raise ValueError("Пустой каталог")
    return {"group_passports":len(ids),"group_observations":count}
def publish(out):
    raw=Path(__file__).with_name(FILE).read_bytes();d=json.loads(raw);quality(d)
    (out/FILE).write_bytes(raw)
