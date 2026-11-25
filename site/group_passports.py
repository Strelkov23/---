"""Documentary snapshots of issuer disclosures, separate from FNS legal entities."""
import json,re
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit
FILE="group-passports.json"
HOSTS={"ar2025.phosagro.ru","limited.rosneft.ru","www.x5.ru","www.company.rt.ru","storage.ir.mts.ru","rspp.ru","storage.yandexcloud.net","www.rusagrogroup.ru","www.aviaport.ru","www.alrosa.ru","reportcollection.inion.ru","ptport.ru","ar2025.nornickel.com","www.lentagroup.ru","ir.yandex.ru","ir.ozon.com","www.novatek.ru","www.polyus.com"}
MONEY_UNITS={"млн руб.":("RUB",Decimal(1)),"млрд руб.":("RUB",Decimal(1000)),"млн долл. США":("USD",Decimal(1))}
def identity(group,target,terms,require_same_years=False):
    """Compare only money fields in the same currency, in millions of that currency."""
    fields={m["id"]:m for m in group["metrics"]}
    if any(k not in fields for k in (target,*terms)):raise ValueError("Отсутствует компонент равенства: "+target)
    selected=[fields[k] for k in (target,*terms)]
    units=[MONEY_UNITS.get(m["unit"]) for m in selected]
    if any(u is None for u in units) or len({u[0] for u in units})!=1:raise ValueError("Несовместимые единицы: "+target)
    values=[{r["year"]:Decimal(r["value"])*u[1] for r in m["observations"]} for m,u in zip(selected,units)]
    if require_same_years and any(v.keys()!=values[0].keys() for v in values[1:]):raise ValueError("Несовпадающие периоды: "+target)
    for year in set.intersection(*(set(v) for v in values)):
        if values[0][year]!=sum(v[year] for v in values[1:]):raise ValueError("Контрольное равенство: "+target)
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
            if m["id"] in mids or m["unit"] not in ("млн руб.","млрд руб.","%","тыс. т","тыс. чел.","млн пасс.-км","млн долл. США","млн шт.","млн чел.","тыс. тройских унций","долл. США/унция","тыс. м³","м³/т","раз") or not m["label"]:raise ValueError("Показатель")
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
            identity(g,"assets",("equity","liabilities"))
        # Issuer-specific identities; the signs and definitions follow the source.
        rules={
            "mmk":(
                ("assets",("current_assets","noncurrent_assets")),
                ("liabilities",("current_liabilities","noncurrent_liabilities")),
                ("gross_profit",("revenue","cost_of_sales")),
                ("cash",("cash_opening","operating_cash_flow","investment_cash_flow","financing_cash_flow","cash_fx"))),
            "novatek":(
                ("assets",("current_assets","noncurrent_assets")),
                ("liabilities",("current_liabilities","noncurrent_liabilities")),
                ("revenue",("hydrocarbon_revenue","other_revenue")),
                ("profit",("profit_before_tax","income_tax")),
                ("profit",("profit_parent","profit_noncontrolling")),
                ("cash_change",("operating_cash_flow","investment_cash_flow","financing_cash_flow","cash_fx")),
                ("cash",("cash_opening","cash_change")),
                ("comprehensive_income",("profit","other_comprehensive_income"))),
            "ozon":(
                ("revenue",("services_revenue","goods_sales_revenue","interest_revenue")),
                ("gross_profit",("revenue","cost_of_sales")),
                ("cost_of_sales",("goods_cost","marketplace_cost","fintech_cost")),
                ("operating_expenses",("sales_marketing_expenses","technology_content_expenses","administrative_expenses","fintech_credit_losses"))),
            "nornickel":(
                ("debt_total",("borrowings_noncurrent","borrowings_current","lease_liabilities")),
                ("debt_total",("net_debt","cash")),
                ("cash_change",("operating_cash_flow","investment_cash_flow","financing_cash_flow","cash_fx")),
                ("fcf",("operating_cash_flow","investment_cash_flow")))
        }
        for target,terms in rules.get(g["id"],()):
            identity(g,target,terms,require_same_years=True)
        if not mids:raise ValueError("Нет показателей")
    if not ids:raise ValueError("Пустой каталог")
    return {"group_passports":len(ids),"group_observations":count}
def publish(out):
    raw=Path(__file__).with_name(FILE).read_bytes();d=json.loads(raw);quality(d)
    (out/FILE).write_bytes(raw)
