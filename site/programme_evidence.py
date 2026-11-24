"""Reproducible contextual budget/outcome evidence; no attribution or composite score."""
import csv
import hashlib
import json
from html import escape

# The national outcome and federal programme budget are distinct scopes.
# The relationship is thematic, not an official mapping of programme KPIs.
PAIRS=(
    ("social","poverty","Социальная поддержка и бедность"),
    ("health","life","Здравоохранение и продолжительность жизни"),
)

def read_snapshot(out,name):
    raw=(out/name).read_bytes()
    return json.loads(raw),hashlib.sha256(raw).hexdigest()

def assemble(budget,annual,year):
    b={r["id"]:r for r in budget["rows"] if r["year"]==year and r["scope"]=="Отдельная госпрограмма, федеральный бюджет"}
    a={r["id"]:r for r in annual["rows"] if r["year"]==year}
    result=[]
    for bid,aid,title in PAIRS:
        br,ar=b.get(bid),a.get(aid)
        result.append(dict(year=year,title=title,budget_id=bid,indicator_id=aid,
            budget_title=br["title"] if br else None,
            budget_actual_mrub=br["actual"] if br else None,
            appropriation_mrub=br["appropriation"] if br else None,
            cash_execution_pct=br["ratio_appropriation"] if br else None,
            budget_source=br["actual_source"] if br else None,
            budget_plan_source=br["plan_source"] if br else None,
            indicator_title=ar["title"] if ar else None,indicator_unit=ar["unit"] if ar else None,
            annual_plan=ar["plan"] if ar else None,
            annual_fact=ar["actual"] if ar else None,
            favorable_gap=ar["favorable_gap"] if ar else None,
            annual_plan_source=ar["plan_source"] if ar else None,
            annual_fact_source=ar["actual_source"] if ar else None,
            annual_plan_vintage=ar["plan_vintage"] if ar else None,
            evidence_status="Совместный год, разные уровни наблюдения" if br and br["actual"] is not None and ar and ar["actual"] is not None else "Недостаточно сопоставимых данных",
            causal_effect=None,
            relationship="Тематическое сопоставление; не паспортный показатель данной госпрограммы"))
    return result

def fmt(x):
    return "—" if x is None else f"{x:,.3f}".rstrip("0").rstrip(".").replace(","," ").replace(".",",")

def describe(r):
    lines=[f"Год: {r['year']}. {r['relationship']}.",
        f"Кассовые расходы: {fmt(r['budget_actual_mrub'])} млн руб.; роспись: {fmt(r['appropriation_mrub'])} млн руб.; исполнение: {fmt(r['cash_execution_pct'])}%.",
        f"Национальный показатель: {r['indicator_title'] or 'нет данных'}; план {fmt(r['annual_plan'])}; факт {fmt(r['annual_fact'])}; благоприятное отклонение {fmt(r['favorable_gap'])} ({'п.п.' if r['indicator_unit']=='%' else r['indicator_unit'] or 'единица не определена'}).",
        f"Статус: {r['evidence_status']}. Причинный эффект и эффективность расходов не оценены."]
    return lines

def publish(page,out,stamp):
    budget,bhash=read_snapshot(out,"programme-budget.json")
    annual,ahash=read_snapshot(out,"annual-goals.json")
    years=sorted({r["year"] for r in budget["rows"] if r["scope"]=="Отдельная госпрограмма, федеральный бюджет"})
    rows=[r for year in years for r in assemble(budget,annual,year)]
    hashes={"programme-budget.json":bhash,"annual-goals.json":ahash}
    result=dict(built=stamp,rows=rows,input_sha256=hashes,scope="context only",budget_reviewed=budget.get("reviewed"),annual_reviewed=annual.get("reviewed"))
    (out/"programme-evidence.json").write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    if rows:
        with (out/"programme-evidence.csv").open("w",encoding="utf-8-sig",newline="") as f:
            w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    else:(out/"programme-evidence.csv").write_text("year,title\n",encoding="utf-8-sig")
    markdown=["# Расходы и социально-экономические результаты","",f"Сборка: {stamp}.",
        "Данные взяты из документальных снимков. Новое время сборки не означает нового факта. Сопоставление тематическое, не причинное. Национальные результаты зависят от многих программ, регионов, домохозяйств и внешних факторов.",""]
    body='<section class="mast"><p class="kicker">Аналитика · государственная политика</p><h1>Расходы и социально-экономические результаты</h1><p>Сопоставление за один год: финансовые показатели отдельных федеральных госпрограмм и национальные показатели Единого плана. Это не доказательство влияния бюджета на результат и не оценка эффективности.</p><p>Сборка: '+escape(stamp)+' · Даты проверки исходных снимков: бюджет '+escape(str(budget.get("reviewed") or "не указана"))+', план '+escape(str(annual.get("reviewed") or "не указана"))+'.</p><p><a href="programme-evidence.md" download>Скачать аналитическую справку (Markdown)</a> · <a href="programme-evidence.csv">CSV</a> · <a href="programme-evidence.json">JSON</a> · <a href="methodology.html#programme-evidence-method">Методика</a></p><p><a href="programmes.html#annual-goals">Годовые цели</a> · <a href="programmes.html#programme-budget">Исходные расходы</a> · <a href="budget-diagnostics.html">Бюджетная диагностика</a></p></section>'
    if not rows:body+='<p>Нет годовых финансовых наблюдений для сопоставления.</p>'
    for r in rows:
        markdown.extend(["## "+r["title"],"",*describe(r),""])
        body+='<article><h2>'+escape(r["title"])+'</h2>'+''.join('<p>'+escape(line)+'</p>' for line in describe(r))
        if r["annual_plan_vintage"]:
            body+='<p>Версия плана: '+escape(r["annual_plan_vintage"])+'</p>'
            markdown.extend(["Версия плана: "+r["annual_plan_vintage"],""])
        for key,label in (("budget_source","Факт расходов"),("budget_plan_source","Бюджетный план"),("annual_plan_source","Годовой план"),("annual_fact_source","Национальный факт")):
            if r[key]:
                body+='<p><a href="'+escape(r[key],quote=True)+'">'+label+'</a></p>'
                markdown.append(f"- {label}: {r[key]}")
        markdown.append("")
        body+='</article>'
    limitations="Для причинной оценки необходимы паспортные результаты программы, фактические объёмы услуг, охват получателей, данные по регионам и другим источникам финансирования, сопоставимая контрольная группа или обоснованная модель контрфактического сценария. Отсутствующий факт не заменяется нулём. Не рассчитывается стоимость одного процентного пункта бедности или года жизни."
    markdown.extend(["## Ограничения",limitations,"","## Контрольные суммы входных наборов",*[f"- {k}: {v}" for k,v in hashes.items()]])
    body+='<section><h2>Что требуется для оценки эффективности</h2><p>'+escape(limitations)+'</p><details><summary>Воспроизводимость расчёта</summary>'+''.join('<p>'+escape(k)+': <code>'+escape(v)+'</code></p>' for k,v in hashes.items())+'</details></section>'
    (out/"programme-evidence.md").write_text("\n\n".join(markdown)+"\n",encoding="utf-8")
    page("programme-evidence.html",body)
