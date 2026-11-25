"""Documentary snapshots of issuer disclosures, separate from FNS legal entities."""
import json,re
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit
FILE="group-passports.json"
HOSTS={"ar2025.phosagro.ru","limited.rosneft.ru","www.x5.ru","www.company.rt.ru","storage.ir.mts.ru","rspp.ru","storage.yandexcloud.net","www.rusagrogroup.ru","www.aviaport.ru","www.alrosa.ru","reportcollection.inion.ru","ptport.ru","ar2025.nornickel.com","www.lentagroup.ru","ir.yandex.ru","ir.ozon.com"}
def quality(d):
    if d.get("schema")!=1 or d.get("mode")!="documentary_snapshot":raise ValueError("Тип снимка")
    from datetime import date
    checked=date.fromisoformat(d["checked"])
    ids=set();count=0
    for g in d["groups"]:
        if not re.fullmatch(r"[a-z0-9-]+",g["id"]) or g["id"] in ids or g["scope"]!="consolidated" or g["standard"] not in ("IFRS","IFRS_based_disclosure"):raise ValueError("Периметр группы")
        ids.add(g["id"])
        u=urlsplit(g["source"])
        if u.scheme!="https" or u.hostname not in HOSTS or not all(g[k] for k in ("name","sector","role","section")):raise ValueError("Паспорт источника")
        if g.get("source_kind") not in (None,"issuer_statement","republished_issuer_release") or g.get("source_kind") and not g.get("note"):raise ValueError("Тип источника")
        if g["standard"]=="IFRS_based_disclosure" and not g.get("note"):raise ValueError("Оговорка о стандарте")
        mids=set()
        for m in g["metrics"]:
            if m["id"] in mids or m["unit"] not in ("млн руб.","млрд руб.","%","тыс. т","тыс. чел.","млн пасс.-км","млн долл. США","млн шт.","млн чел.") or not m["label"]:raise ValueError("Показатель")
            if "source" in m or "section" in m:
                mu=urlsplit(m.get("source",""))
                if mu.scheme!="https" or mu.hostname not in HOSTS or not m.get("section") or m.get("comparable") is not None or m["id"] in ("revenue","profit","assets","equity","liabilities","ppe","operating_profit","operating_cash_flow"):raise ValueError("Отдельный источник показателя")
            if m.get("comparable") is not None and (g["standard"]!="IFRS" or m["comparable"]!="annual_consolidated_revenue_rub" or m["id"]!="revenue" or m["unit"] not in ("млн руб.","млрд руб.")):raise ValueError("Несопоставимый показатель")
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
        if g["id"]=="mmk":
            # Explicitly defined statement identities for this issuer and this unit.
            fields={m["id"]:m for m in g["metrics"]}
            identities=[
                ("assets",("current_assets","noncurrent_assets")),
                ("liabilities",("current_liabilities","noncurrent_liabilities")),
                ("gross_profit",("revenue","cost_of_sales")),
                ("cash",("cash_opening","operating_cash_flow","investment_cash_flow","financing_cash_flow","cash_fx"))]
            for target,terms in identities:
                selected=[fields[k] for k in (target,*terms)]
                if any(m["unit"]!="млн руб." for m in selected):raise ValueError("Единицы ММК")
                values=[{r["year"]:Decimal(r["value"]) for r in m["observations"]} for m in selected]
                if any(v.keys()!=values[0].keys() for v in values[1:]):raise ValueError("Периоды ММК")
                for y in values[0]:
                    if values[0][y]!=sum(v[y] for v in values[1:]):raise ValueError("Контрольное равенство ММК: "+target)
        if not mids:raise ValueError("Нет показателей")
    if not ids:raise ValueError("Пустой каталог")
    return {"group_passports":len(ids),"group_observations":count}
def publish(out):
    raw=Path(__file__).with_name(FILE).read_bytes();d=json.loads(raw);quality(d)
    (out/FILE).write_bytes(raw)
