"""Labor productivity diagnostics, with explicit output and employment concepts."""
import csv
import json
import math
import hashlib
from html import escape
from pathlib import Path

SECTORS=[
 ("agriculture","Сельское, лесное хозяйство и рыболовство","NV.AGR.EMPL.KD","SL.AGR.EMPL.ZS"),
 ("industry","Промышленность и строительство","NV.IND.EMPL.KD","SL.IND.EMPL.ZS"),
 ("services","Услуги","NV.SRV.EMPL.KD","SL.SRV.EMPL.ZS"),
]
REGIONAL_GRP="GRP_95b8dd2585"
REGIONAL_EMP="R_65254a01945743d3_1db3db8e79"
def finite(x):
    return type(x) in (int,float) and math.isfinite(x)
def valid(x,positive=False):
    return finite(x) and (x>0 if positive else x>=0)
def broad(compare,catalog):
    rows=[]
    for ident,title,pc,ec in SECTORS:
        p=compare[pc]["values"]; e=compare[ec]["values"]
        for year in sorted(set(p)|set(e),key=int):
            prod=p.get(year);share=e.get(year)
            prod=prod if valid(prod,True) else None
            share=share if valid(share) and share<=100 else None
            prev=p.get(str(int(year)-1))
            rows.append(dict(sector=ident,title=title,year=int(year),productivity_usd2015_per_worker=prod,
                workers_per_million_usd2015_va=1e6/prod if prod is not None else None,
                productivity_change_pct=(prod/prev-1)*100 if prod is not None and valid(prev,True) else None,
                employment_share_pct=share,productivity_source=catalog[pc]["source"],employment_source=catalog[ec]["source"],
                productivity_checked=catalog[pc].get("success"),employment_checked=catalog[ec].get("success")))
    return rows

def index_unique(values):
    # Exact names only. Ambiguous duplicates are excluded instead of choosing a value.
    index={};duplicates=set()
    for r in values:
        k=(r["region"],r["year"])
        if k in index:duplicates.add(k)
        index[k]=r
    for k in duplicates:index.pop(k,None)
    return index,duplicates

def regional(grp,emp):
    if grp["unit"]!="млн руб." or emp["unit"]!="Тысяч человек":
        raise ValueError("Regional unit mismatch")
    a,dupa=index_unique(grp["values"]);b,dupb=index_unique(emp["values"])
    rows=[]
    for key in sorted(a.keys()&b.keys(),key=lambda k:(k[1],k[0])):
        x,y=a[key],b[key]
        if not valid(x["value"]) or not valid(y["value"],True):continue
        rows.append(dict(territory=key[0],year=key[1],grp_mrub=x["value"],employment_thousands=y["value"],
            nominal_grp_rub_per_employed=x["value"]/y["value"]*1000,
            grp_source=grp["source"],employment_source=emp["source"],
            grp_cell={k:x.get(k) for k in ("sheet","row","column","note","seen")},
            employment_cell={k:y.get(k) for k in ("sheet","row","column","note","seen")}))
    return rows,dict(grp_keys=len(a),employment_keys=len(b),exact_pairs=len(a.keys()&b.keys()),
        valid_pairs=len(rows),grp_only=len(a.keys()-b.keys()),employment_only=len(b.keys()-a.keys()),
        ambiguous_grp=len(dupa),ambiguous_employment=len(dupb))

def read(out,name):
    return json.loads((out/name).read_text(encoding="utf-8"))
def regional_inputs(out):
    data=read(out,"historical.json")
    index={r["code"]:r for r in data["series"]}
    if REGIONAL_GRP not in index or REGIONAL_EMP not in index:return [],{"status":"Нет одного или обоих исходных рядов"}
    def load(code):
        meta=index[code];d=read(out,meta["file"])
        return dict(meta,values=d["values"])
    rows,coverage=regional(load(REGIONAL_GRP),load(REGIONAL_EMP))
    return rows,dict(coverage,status="Точное совпадение названий и годов; границы и методологии требуют проверки")

def publish(page,out,stamp):
    b=broad(read(out,"compare.json"),read(out,"catalog.json"))
    r,coverage=regional_inputs(out)
    data=dict(built=stamp,broad=b,regional=r,coverage=coverage,
        note="WDI: ВДС на занятого; регионы: номинальный ВРП на занятого. Не коэффициенты валового выпуска ОКПД2.")
    (out/"labor-data.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    for name,rows,headers in (("labor-broad.csv",b,list(b[0]) if b else ["sector","year"]),
        ("labor-regional.csv",r,["territory","year","grp_mrub","employment_thousands","nominal_grp_rub_per_employed","grp_source","employment_source","grp_cell","employment_cell"])):
        with (out/name).open("w",encoding="utf-8-sig",newline="") as f:
            w=csv.DictWriter(f,fieldnames=headers);w.writeheader()
            for row in rows:w.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,dict) else v for k,v in row.items()})
    m=json.loads(Path("sectors.json").read_text(encoding="utf-8"))
    with (out/"labor-coefficients-template.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f);w.writerow(["group_id","group_name","year","output_million_rub","annual_fte","source"])
        for i,(name,v) in enumerate(zip(m["names"],m["output"]),1):w.writerow([i,name,2021,v,"",""])
    page("labor.html",'<section class="mast"><p class="kicker">Статистика · трудовые ресурсы</p><h1>Занятость и производительность труда</h1><p>Сопоставление измеряемых статистических показателей, отдельно от сценарных коэффициентов. Добавленная стоимость не равна валовому выпуску; ОКВЭД2 не совпадает с продуктовой номенклатурой ОКПД2.</p><p><a href="labor-broad.csv">Отраслевые агрегаты CSV</a> · <a href="labor-regional.csv">Региональные расчёты CSV</a> · <a href="labor-data.json">JSON</a> · <a href="methodology.html#labor-data-method">Методика</a></p></section><section><h2>Производительность трёх укрупнённых секторов</h2><p>ВДС на занятого в постоянных долларах США 2015 года, WDI. Обратный показатель — число занятых на миллион долларов ВДС, а не человеко-часы и не трудоёмкость валового выпуска.</p><label>Год <select id="labor-year"></select></label><p id="labor-status" role="status">Загрузка…</p><div id="labor-broad" class="table-scroll" tabindex="0" role="region" aria-label="Производительность секторов"></div><div id="labor-chart"></div></section><section><h2>Региональная диагностика</h2><p>Номинальный ВРП на среднегодового занятого: только точное совпадение названия территории и года. Это ориентир в текущих рублях, не измерение физической производительности; различия цен, отраслевой структуры, границ и охвата источников могут влиять на результат. Пересекающиеся территории нельзя складывать.</p><label>Год <select id="labor-region-year"></select></label><label>Поиск территории <input id="labor-region-query" type="search"></label><p id="labor-region-status" role="status"></p><div id="labor-regional" class="table-scroll" tabindex="0" role="region" aria-label="Региональные показатели"></div><p><a href="historical.html">Исходные региональные ряды</a></p></section><section id="labor-calibration"><h2>Калибровка трудоёмкости межотраслевой модели</h2><p>Скачайте шаблон по 19 продуктовым группам. Для каждой группы требуются распределённые на неё годовые эквиваленты полной занятости (FTE) за 2021 год и документированный источник. Выпуск уже указан из того же баланса. Не подставляйте численность работников ОКВЭД2 без таблицы перехода к продуктам. Шаблон не содержит выдуманных FTE.</p><p><a href="labor-coefficients-template.csv">Шаблон CSV</a> · <a href="https://rosstat.gov.ru/labour_force">Росстат: трудовые ресурсы</a> · <a href="scenario.html#dynamic-plan">Многолетняя модель</a></p><p>Если доступны совместимые данные, загрузите заполненный шаблон в многолетнюю модель. Расчёт будет выполнен локально; исходный файл не отправляется на сервер.</p></section><script defer src="labor-data.js"></script>')
