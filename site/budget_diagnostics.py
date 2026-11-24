"""Budget decomposition, separate scope comparison and reproducible exports."""
import csv
import json
from decimal import Decimal
from html import escape
from budget_programmes import q, ratio
import health_projects

AGRI="https://base.garant.ru/411685091/"
HEALTH=health_projects.SOURCE

def dec(x):
    return Decimal(str(x))

def decompose(law,appropriation,actual):
    l,p,a=map(dec,(law,appropriation,actual))
    if any(not x.is_finite() or x<0 for x in (l,p,a)):raise ValueError("Invalid amount")
    return dict(law=float(l),appropriation=float(p),actual=float(a),
      revision=q(p-l),execution_gap=q(a-p),net=q(a-l),
      rate_law=ratio(a,l),rate_appropriation=ratio(a,p),
      revision_pct=ratio(p-l,l))

def records():
    result=[]
    for r in health_projects.records():
        result.append(dict(id="health-"+str(r["row"]),title=r["title"],scope="Федеральные проекты здравоохранения",
            year=2025,unit="млн руб.",baseline="Закон с изменениями",source=r["source"],
            **decompose(r["amended_law"],r["appropriation"],r["actual"])))
    result.append(dict(id="minagri",title="Минсельхоз России",scope="Ведомство, федеральный бюджет",
        year=2025,unit="млн руб.",baseline="Назначения по закону, как указаны в заключении комитета",source=AGRI,
        **decompose("451778.9","657345.6","654870.9")))
    return result

def concentration(rows):
    # Gross positive gaps only. Negative gaps cannot cancel missing expenditure.
    positive=[(r,max(Decimal(0),dec(r["appropriation"])-dec(r["actual"]))) for r in rows]
    total=sum((v for _,v in positive),Decimal(0))
    ordered=sorted(positive,key=lambda x:(-x[1],x[0]["id"]))
    return dict(gross_gap=q(total),over_execution=q(sum((max(Decimal(0),dec(r["actual"])-dec(r["appropriation"])) for r in rows),Decimal(0))),
        top3_share=ratio(sum((v for _,v in ordered[:3]),Decimal(0)),total),
        rows=[dict(id=r["id"],title=r["title"],gap=q(v),share=ratio(v,total)) for r,v in ordered if v>0])

def fmt(v,digits=1):
    return "—" if v is None else f"{v:,.{digits}f}".replace(","," ").replace(".",",")

def publish(page,out):
    rows=records()
    health=[r for r in rows if r["id"].startswith("health-")]
    summary=concentration(health)
    (out/"budget-diagnostics.json").write_text(json.dumps(dict(rows=rows,health_concentration=summary,year=2025,
        source_mode="manual documentary snapshot; calculations derived",source_access_note="Direct fetch of Garant committee pages returned HTTP 403 during recheck; indexed excerpts remain available."),ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"budget-diagnostics.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    body='<section class="mast"><p class="kicker">Госпрограммы · финансовая диагностика</p><h1>Отклонения бюджетных расходов</h1><p>Разложение отклонения от закона на изменение назначений и кассовый разрыв. 2025 год, млн номинальных рублей. <a href="programmes.html#programme-budget">Исходный бюджетный блок</a> · <a href="methodology.html#budget-diagnostics-method">Методика</a></p><p><a href="budget-diagnostics.csv">Скачать CSV</a> · <a href="budget-diagnostics.json">JSON</a></p><p>Прямой повторный запрос к копиям заключений в ГАРАНТ вернул HTTP 403; доступны поисковые выдержки. Ранее внесённая транскрипция сохранена; полная повторная сверка требует доступа к документам.</p></section>'
    body+='<section><h2>Ведомственный срез: Минсельхоз России</h2><p>Расходы ведомства, не расходы одной государственной программы; не суммируются с показателями здравоохранения. <a href="'+AGRI+'">Заключение аграрного комитета от 01.10.2026</a>.</p><div class="portal-grid">'
    r=rows[-1]
    for title,k in (("Назначения по закону","law"),("Сводная роспись","appropriation"),("Кассовый факт","actual"),("Изменение назначений","revision"),("Разрыв к росписи (факт − план)","execution_gap"),("Исполнение к росписи, %","rate_appropriation")):
        body+='<article><h3>'+title+'</h3><p><strong>'+fmt(r[k],2 if k=="rate_appropriation" else 1)+'</strong> '+('%' if k=="rate_appropriation" else 'млн руб.')+'</p></article>'
    body+='</div></section><section><h2>Концентрация остатков по 21 проекту здравоохранения</h2><p>Сумма положительных остатков в выборке: <strong>'+fmt(summary["gross_gap"])+' млн руб.</strong> · Доля трёх крупнейших: <strong>'+fmt(summary["top3_share"],2)+'%</strong>. Это не оценка потерь или медицинской эффективности.</p><div class="budget-bars">'
    for item in summary["rows"][:10]:
        body+='<div><p>'+escape(item["title"])+' · '+fmt(item["gap"])+' млн руб. ('+fmt(item["share"],2)+'%)</p><div class="budget-bar-track" aria-hidden="true"><div class="budget-bar-fill" style="width:'+str(min(100,max(0,item["share"])))+'%"></div></div></div>'
    body+='</div><p>Источник: <a href="'+HEALTH+'">заключение комитета по охране здоровья</a>. Знаменатель — сумма положительных остатков, а не весь бюджет.</p></section><section><h2>Разложение отклонений по проектам</h2><p>Нетто-отклонение = роспись минус закон + факт минус роспись. Положительное изменение назначений не является доказательством необходимости расходов; кассовый разрыв не является доказательством потерь.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Разложение бюджетных отклонений"><table><thead><tr><th>Проект</th><th>Изменение назначений</th><th>Кассовый разрыв</th><th>Итог к закону</th><th>Исполнение к закону, %</th><th>Исполнение к росписи, %</th></tr></thead><tbody>'
    for r in sorted(health,key=lambda r:r["execution_gap"]):
        body+='<tr><th scope="row">'+escape(r["title"])+'</th>'+''.join('<td>'+fmt(r[k],2 if k.startswith("rate") else 1)+'</td>' for k in ("revision","execution_gap","net","rate_law","rate_appropriation"))+'</tr>'
    body+='</tbody></table></div></section>'
    page("budget-diagnostics.html",body)
