"""Documented annual federal budget and selected programme cash outturns.

All amounts normalized to million nominal RUB, using Decimal for arithmetic.
No extrapolation or inferred missing plans; scope is not all funding sources.
"""
import csv
import json
from decimal import Decimal, ROUND_HALF_UP
from html import escape

LAW="https://base.garant.ru/415115039/1cafb24d049dcd1e7707a22d98e9858f/"
ECON="https://base.garant.ru/411685099/"
SOCIAL="https://base.garant.ru/411685101/"
HEALTH="https://base.garant.ru/411685113/"
TREASURY="https://roskazna.gov.ru/ispolnenie-byudzhetov/federalnyj-byudzhet/"
BILL="https://sozd.duma.gov.ru/bill/1260086-8"
# Exact law values in thousand rubles; plans quoted by the committee in billion rubles.
TOTALS=[
 ("revenue","Доходы", "37283772222.8","36562.2",None),
 ("expenditure","Расходы","42910312400.2","42298.7","43367.1"),
 ("deficit","Дефицит (расходы минус доходы)","5626540177.4","5736.4",None),
]
# Values in million rubles as reproduced in committee conclusions.
PROGRAMMES=[
 ("social","Социальная поддержка граждан","3487681.6","3150144.4","3145627.7",SOCIAL,
  "Суммы приведены в заключении комитета; опубликованное отношение к закону (89,7%) не совпадает с отношением указанных сумм. Здесь показан собственный расчёт, расхождение требует сверки."),
 ("health","Развитие здравоохранения","1550591.5","1605652.5","1595623.0",HEALTH,
  "Исходный закон и закон с изменениями приведены отдельно по столбцам 1 и 2 таблицы заключения."),
]
def d(v):return Decimal(v) if v is not None else None
def q(v,places="0.1"):
    return float(v.quantize(Decimal(places),rounding=ROUND_HALF_UP)) if v is not None else None
def ratio(actual,plan):
    return q(actual/plan*100,"0.01") if actual is not None and plan is not None and plan>0 else None
def change(a,b):
    return q(a-b) if a is not None and b is not None else None
def records():
    rows=[]
    for code,title,raw,law,appropriation in TOTALS:
        a=d(raw)/1000;l=d(law)*1000;s=d(appropriation)*1000 if appropriation else None
        rows.append(dict(id=code,year=2025,title=title,scope="Федеральный бюджет, итог",unit="млн руб.",initial_law=None,
            amended_law=float(l),appropriation=float(s) if s is not None else None,actual=float(a),
            ratio_initial=None,ratio_amended=ratio(a,l),ratio_appropriation=ratio(a,s),
            change_appropriation=None,unspent=change(s,a),plan_source=ECON,actual_source=LAW,
            note="Факт: статья 1 закона № 340-ФЗ от 19.10.2026; план: закон № 419-ФЗ с изменениями, округление до 0,1 млрд руб. в заключении комитета."))
    for code,title,law,appropriation,raw,source,note in PROGRAMMES:
        l,s,a=map(d,(law,appropriation,raw))
        amended=d("1557061.8") if code=="health" else None
        rows.append(dict(id=code,year=2025,title=title,scope="Отдельная госпрограмма, федеральный бюджет",unit="млн руб.",initial_law=float(l),
            amended_law=float(amended) if amended is not None else None,appropriation=float(s),actual=float(a),ratio_initial=ratio(a,l),ratio_amended=ratio(a,amended),
            ratio_appropriation=ratio(a,s),change_appropriation=change(s,l),unspent=change(s,a),
            plan_source=source,actual_source=source,note=note))
    if d(TOTALS[1][2])-d(TOTALS[0][2])!=d(TOTALS[2][2]):raise ValueError("Federal balance identity failed")
    return rows
def fmt(v,digits=1):
    return "—" if v is None else f"{v:,.{digits}f}".replace(","," ").replace(".",",")
def publish(out):
    rows=records()
    (out/"programme-budget.json").write_text(json.dumps({"reviewed":"2026-11-24","rows":rows,"mode":"manual documentary snapshot"},ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"programme-budget.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    body='<section id="programme-budget"><h2>Бюджетное финансирование: план и кассовое исполнение</h2><p>2025 год, номинальные суммы в млн рублей. Ручная документальная сверка 24.11.2026. <a href="'+LAW+'">Закон об исполнении</a> · <a href="'+BILL+'">Карточка законопроекта</a> · <a href="'+TREASURY+'">Отчётность Казначейства</a>. Не смешиваются бюджетные ассигнования, сводная бюджетная роспись и фактически проведённые платежи.</p><p><a href="programme-budget.csv">CSV</a> · <a href="programme-budget.json">JSON</a> · <a href="methodology.html#programme-budget-method">Методика</a></p>'
    for scope in dict.fromkeys(r["scope"] for r in rows):
        body+='<h3>'+escape(scope)+'</h3><div class="table-scroll" tabindex="0" role="region" aria-label="'+escape(scope,quote=True)+'"><table><thead><tr><th>Показатель</th><th>Закон (начальный)</th><th>Закон (изменённый)</th><th>Уточнённая роспись</th><th>Кассовый факт</th><th>Факт / роспись, %</th><th>Остаток к росписи</th><th>Документы</th></tr></thead><tbody>'
        for r in rows:
            if r["scope"]!=scope:continue
            body+='<tr><th scope="row">'+escape(r["title"])+'</th>'+''.join('<td>'+fmt(r[k],2 if k=="ratio_appropriation" else 1)+'</td>' for k in ("initial_law","amended_law","appropriation","actual","ratio_appropriation","unspent"))+'<td><a href="'+r["plan_source"]+'">План</a> · <a href="'+r["actual_source"]+'">Факт</a><br>'+escape(r["note"])+'</td></tr>'
        body+='</tbody></table></div>'
    body+='<h3>Изменение планов и исполнение отдельных программ</h3><div class="portal-grid">'
    for r in rows:
        if r["initial_law"] is None:continue
        body+='<article><h4>'+escape(r["title"])+'</h4><p>Изменение росписи относительно исходного закона: <strong>'+fmt(r["change_appropriation"])+' млн руб.</strong></p><p>Исполнение относительно исходной суммы: '+fmt(r["ratio_initial"],2)+'%<br>Исполнение относительно росписи: '+fmt(r["ratio_appropriation"],2)+'%</p></article>'
    import health_projects
    return body+'</div>'+health_projects.publish(out)+'<p>Две программы — выборка, а не полный перечень; её нельзя складывать с итоговыми федеральными расходами. Высокое кассовое исполнение не означает достижение результатов. Отсутствующие назначения не восстановлены расчётным путём.</p></section>'
