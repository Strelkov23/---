"""Documented national goal thresholds and comparable, dated observations."""
import csv
import json
from decimal import Decimal
from html import escape

DECREE="https://publication.pravo.gov.ru/document/0001202405070015"
METHOD="https://rosstat.gov.ru/storage/mediabank/Sborn_met_NCR_2036.htm"
POVERTY="https://rosstat.gov.ru/storage/mediabank/85_10-06-2026.html"
GINI="https://rosstat.gov.ru/folder/313/document/282523"
# Thresholds in the published 07.05.2024 decree, not a complete programme passport.
# Observations are manually sourced snapshots, not current API retrievals.
METRICS=[
 ("poverty","Уровень бедности","%","lt",{2030:7,2036:5},"3, к","Доля населения с доходами ниже границы бедности.",
  [(2025,6.7,POVERTY,"Годовая оценка, публикация 10.06.2026")]),
 ("fertility","Суммарный коэффициент рождаемости","детей на женщину","ge",{2030:1.6,2036:1.8},"3, а","Годовой показатель, не демографический прогноз.",[]),
 ("life","Ожидаемая продолжительность жизни","лет","ge",{2030:78,2036:81},"3, б","Ожидаемая продолжительность жизни при рождении.",[]),
 ("large-family","Бедность многодетных семей","%","le",{2030:12,2036:8},"3, к","Не заменяется общим уровнем бедности.",[]),
 ("gini","Коэффициент Джини Единого плана","коэффициент","le",{2030:0.37,2036:0.33},"3, л","Специальная методика Единого плана: доход после налогов с учётом региональных различий. Не смешивать с обычным Джини.",
  [(2025,0.375,GINI,"Оценка по новой методике, опубликована в 2026 году")]),
 ("minimum-wage","Федеральный МРОТ","руб./месяц","ge",{2030:35000},"3, м","Номинальный федеральный минимум; отдельное условие роста более чем вдвое здесь не оценивается.",[(2026,27093,"https://mintrud.gov.ru/employment/323","Установлено с 01.01.2026 Федеральным законом № 429-ФЗ; действующий норматив, а не средняя зарплата")]),
 ("housing","Обеспеченность жильём","м²/чел.","ge",{2030:33,2036:38},"Указ № 309, жилищные условия","Площадь жилья на человека, не годовой ввод жилья.",[]),
 ("research","Внутренние затраты на исследования и разработки","% ВВП","ge",{2030:2},"Указ № 309, технологическое лидерство","Доля всех внутренних затрат, не только бюджетных расходов.",[]),
 ("internet","Возможность качественного широкополосного доступа домохозяйств","%","ge",{2030:97,2036:99},"Указ № 309, цифровая трансформация","Доступность, а не доля фактических пользователей интернета.",[]),
]
SIGNS={"lt":"<","le":"≤","ge":"≥"}

def compare(actual,target,op):
    if actual is None:return None,None
    a,t=Decimal(str(actual)),Decimal(str(target))
    if not a.is_finite() or not t.is_finite():raise ValueError("Nonfinite value")
    if op=="ge":return float(t-a),a>=t
    if op=="le":return float(a-t),a<=t
    if op=="lt":return float(a-t),a<t
    raise ValueError("Unknown threshold")

def records():
    out=[]
    for code,title,unit,op,targets,clause,note,observations in METRICS:
        obs=max(observations,key=lambda x:x[0]) if observations else None
        for year,target in sorted(targets.items()):
            actual=obs[1] if obs else None
            gap,met=compare(actual,target,op)
            out.append(dict(id=code,title=title,unit=unit,operator=op,target_year=year,target=target,clause=clause,target_source=DECREE,
                actual_year=obs[0] if obs else None,actual=actual,actual_source=obs[2] if obs else None,actual_note=obs[3] if obs else None,
                gap=gap,threshold_met=met,note=note))
    return out

def fmt(v):
    return "—" if v is None else format(v,".8g").replace(".",",")

def publish(out):
    rows=records()
    (out/"national-goals.json").write_text(json.dumps({"reviewed":"2026-11-24","source_mode":"manual documented snapshot","rows":rows},ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"national-goals.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    body='<section id="national-goals"><h2>Национальные цели: факты и пороги на 2030–2036 годы</h2><p>Выборка из <a href="'+DECREE+'">Указа № 309 от 07.05.2024</a>. <a href="'+METHOD+'">Официальные методики расчёта</a>. Ручная документальная сверка: 24.11.2026. Это не полный реестр показателей, не годовой план и не оценка вклада конкретной программы.</p><p><a href="national-goals.csv">Скачать показатели CSV</a> · <a href="national-goals.json">JSON</a> · <a href="methodology.html#goal-method">Методика сравнения</a></p><div class="portal-grid">'
    for code,title,unit,op,targets,clause,note,observations in METRICS:
        rr=[r for r in rows if r["id"]==code];r=rr[0]
        body+='<article><h3>'+escape(title)+'</h3><p>'+escape(note)+'</p><p><strong>Факт: '+fmt(r["actual"])+'</strong> '+escape(unit)
        if r["actual_year"]:body+=' · '+str(r["actual_year"])+' г. · <a href="'+escape(r["actual_source"],quote=True)+'">Источник</a><br>'+escape(r["actual_note"])
        else:body+='<br>Сопоставимый факт пока не внесён.'
        body+='</p>'
        for a in rr:
            body+='<p><strong>'+str(a["target_year"])+'</strong>: '+escape(SIGNS[op])+' '+fmt(a["target"])+' '+escape(unit)+'<br>'
            if a["threshold_met"] is None:body+='Разрыв не рассчитан'
            elif a["threshold_met"]:body+='Факт соответствует порогу; достижение к сроку не подтверждено'
            else:body+='Разрыв до границы: '+fmt(a["gap"])+' '+escape("п.п." if unit=="%" else unit)+(' (необходимо строго ниже)' if op=="lt" else '')
            body+='</p>'
        body+='</article>'
    return body+'</div><p>Отсутствие числа не означает нулевое значение. Факт одного года не доказывает достижение цели в будущем или результативность конкретного проекта.</p></section>'
