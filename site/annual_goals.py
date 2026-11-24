"""Fixed published plan vintage; year-matched comparisons only."""
import csv
import json
from html import escape
from decimal import Decimal

PLAN="https://meganorm.ru/mega_doc/dop1/13/ukaz_prezidenta_rf_ot_07_05_2024_N_309_o_natsionalnykh/0/edinyy_plan_po_dostizheniyu_natsionalnykh_tseley_razvitiya.html"
ANNOUNCEMENT="https://rfi.mnr.gov.ru/news/news-rfi/?ELEMENT_ID=917"
VINTAGE="Опубликованная редакция, январь 2025; актуальность цифровой редакции не подтверждена"
YEARS=tuple(range(2025,2031))
# Section numbers refer to the statistical indicator tables in the plan.
TRAJECTORIES={
 "poverty":("Уровень бедности","%","le","1.10.а","Единый план",(7.9,7.6,7.3,7.0,6.7,6.5)),
 "large-family":("Бедность многодетных семей","%","le","1.10.б","НП «Семья»",(22.9,20.7,18.5,16.4,14.2,12.0)),
 "fertility":("Суммарный коэффициент рождаемости","детей на женщину","ge","1.1.а","НП «Семья»",(1.443,1.473,1.503,1.533,1.563,1.593)),
 "life":("Ожидаемая продолжительность жизни при рождении","лет","ge","1.2.а","НП «Продолжительная и активная жизнь»",(74.5,75.2,75.9,76.6,77.3,78.0)),
}
FACTS={("poverty",2025):(6.7,"https://rosstat.gov.ru/storage/mediabank/85_10-06-2026.html","Годовая оценка в публикации 10.06.2026")}
def gap(actual,plan,op):
    if actual is None:return None
    a,p=Decimal(str(actual)),Decimal(str(plan))
    if not a.is_finite() or not p.is_finite():raise ValueError("nonfinite")
    if op=="ge":return float(a-p)
    if op=="le":return float(p-a)
    raise ValueError("invalid direction")
def records():
    rows=[]
    for code,(name,unit,op,section,programme,values) in TRAJECTORIES.items():
        if len(values)!=len(YEARS):raise ValueError("invalid trajectory")
        for year,plan in zip(YEARS,values):
            fact=FACTS.get((code,year))
            a=fact[0] if fact else None
            rows.append(dict(id=code,title=name,unit=unit,year=year,plan=plan,actual=a,
                favorable_gap=gap(a,plan,op),direction=op,plan_section=section,programme=programme,
                plan_source=PLAN,plan_vintage=VINTAGE,actual_source=fact[1] if fact else None,
                actual_note=fact[2] if fact else None))
    return rows
def fmt(x):
    return "—" if x is None else format(x,".8g").replace(".",",")
def publish(out):
    rows=records()
    (out/"annual-goals.json").write_text(json.dumps({"rows":rows,"reviewed":"2026-11-24"},ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"annual-goals.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    body='<section id="annual-goals"><h2>Годовые траектории: план и факт</h2><p>'+escape(VINTAGE)+'. <a href="'+PLAN+'">Таблицы Единого плана</a> · <a href="'+ANNOUNCEMENT+'">Официальное сообщение об утверждении</a>. Годовые значения не интерполируются из Указа № 309; это отдельный снимок опубликованного плана.</p><p><a href="annual-goals.csv">Скачать CSV</a> · <a href="annual-goals.json">JSON</a> · <a href="methodology.html#annual-goal-method">Методика</a></p>'
    for code,(name,unit,op,section,programme,values) in TRAJECTORIES.items():
        body+='<article><h3>'+escape(name)+'</h3><p>'+escape(programme)+' · строка '+escape(section)+' · '+escape(unit)+'</p><div class="table-scroll" tabindex="0" role="region" aria-label="'+escape(name,quote=True)+'"><table><thead><tr><th>Год</th><th>План</th><th>Факт</th><th>Отклонение в благоприятную сторону</th><th>Источник факта</th></tr></thead><tbody>'
        for r in rows:
            if r["id"]!=code:continue
            delta=r["favorable_gap"]
            note='<a href="'+escape(r["actual_source"],quote=True)+'">Источник</a> · '+escape(r["actual_note"]) if r["actual_source"] else "Нет сопоставимого факта"
            body+='<tr><td>'+str(r["year"])+'</td><td>'+fmt(r["plan"])+'</td><td>'+fmt(r["actual"])+'</td><td>'+(("+" if delta>0 else "")+fmt(delta)+" "+escape("п.п." if unit=="%" else unit) if delta is not None else "—")+'</td><td>'+note+'</td></tr>'
        body+='</tbody></table></div></article>'
    return body+'<p>Сравнение проводится только для одного года. Положительный разрыв означает более благоприятное значение, не доказательство эффективности проекта. Специальный Джини не сравнивается со старой годовой траекторией до проверки сопоставимости. Новая цифровая редакция плана может отличаться.</p></section>'
