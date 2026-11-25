"""Overview of distinct investment registers. Counts measure coverage, not performance."""
import csv,json
from html import escape
import investment_projects as bu
import amur_projects as am
import krasnodar_projects as kd

SPECS=[
    ("RU-BU",bu.REGION,"investment-projects",bu,"Региональный реестр","Заявленная стоимость и рабочие места"),
    ("RU-AMU",am.REGION,"amur-projects",am,"Региональный реестр","Пять групп статуса; плановая стоимость и рабочие места"),
    ("RU-KDA",kd.REGION,"krasnodar-projects",kd,"Перечень сопровождения","Принятие на сопровождение, без стоимости и статуса реализации"),
]
NOTE="Число записей характеризует охват конкретного источника, а не число уникальных инвестиционных проектов России. Различаются даты и критерии включения; нельзя суммировать записи или ранжировать по ним инвестиционную активность. Неизвестный охват не равен нулю."
FIELDS=["iso","region","page","register_type","scope","edition","status","checked","success","records","cost_numeric","jobs_numeric","source","source_page","sha256"]

def collect(out,stamp):
    rows=[]
    for iso,region,slug,mod,kind,scope in SPECS:
        d=json.loads((out/(slug+".json")).read_text(encoding="utf-8"));mod.quality(d)
        r=d["rows"];available=bool(r)
        rows.append(dict(iso=iso,region=region,page=slug+".html",register_type=kind,scope=scope,edition=d["edition"],status=d["status"],checked=d["checked"],success=d["success"],records=len(r) if available else None,cost_numeric=sum(x["cost_mln_rub"] is not None for x in r) if available and mod is not kd else None,jobs_numeric=sum(x["jobs"] is not None for x in r) if available and mod is not kd else None,source=d["source"],source_page=d["source_page"],sha256=d["sha256"]))
    return dict(schema=1,built=stamp,note=NOTE,rows=rows)

def quality(d,out):
    if d!=collect(out,d["built"]):raise ValueError("Сводка не соответствует региональным реестрам")
    return dict(project_registers_configured=len(d["rows"]),project_registers_available=sum(r["records"] is not None for r in d["rows"]))

def verify_csv(path,d):
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if reader.fieldnames!=FIELDS or list(reader)!=[{k:bu.csv_cell(r[k]) for k in FIELDS} for r in d["rows"]]:raise ValueError("Сводка CSV/JSON mismatch")

def render(d):
    e=lambda v:escape(str(v if v is not None else "—"),quote=True)
    states={"ok":"Загружено","cached":"Сохраненная редакция","unavailable":"Источник недоступен","not_loaded":"Ожидается загрузка"}
    body='<section class="mast"><p class="kicker">Инвестиции · охват источников</p><h1>Инвестиционные проекты регионов</h1><p>'+e(NOTE)+'</p><p><a href="economic-map.html">Экономическая карта</a> · <a href="freshness.html">Актуальность данных</a> · <a href="methodology.html#project-coverage-method">Методика</a></p></section>'
    body+='<section><h2>Подключённые реестры</h2><div class="portal-grid" id="project-coverage-cards">'
    for r in d["rows"]:
        body+='<article><p class="kicker">'+e(r["register_type"])+'</p><h3><a href="'+e(r["page"])+'">'+e(r["region"])+'</a></h3><p>'+e(r["scope"])+'</p><p><strong>'+e(r["records"])+'</strong> записей · '+e(states[r["status"]])+'</p><p>Редакция: '+e(r["edition"])+'</p><p><a href="'+e(r["page"])+'">Реестр и фильтры</a> · <a href="'+e(r["source_page"])+'">Источник</a></p></article>'
    body+='</div></section><section><h2>Покрытие числовых полей</h2><p>Количество записей с числовым значением. Прочерк — неизвестный охват или поле отсутствует в источнике. Ноль — поле предусмотрено, но числовых значений нет.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Охват реестров"><table><thead><tr><th>Регион</th><th>Редакция</th><th>Записей</th><th>Стоимость</th><th>Рабочие места</th><th>Последняя проверка</th></tr></thead><tbody id="project-coverage-rows">'
    for r in d["rows"]:
        body+='<tr><td><a href="'+e(r["page"])+'">'+e(r["region"])+'</a></td>'+''.join('<td>'+e(r[k])+'</td>' for k in ("edition","records","cost_numeric","jobs_numeric","checked"))+'</tr>'
    body+='</tbody></table></div><p><a href="project-coverage.csv">CSV охвата</a> · <a href="project-coverage.json">JSON с метаданными</a></p></section><section><h2>Связанные данные</h2><p><a href="frp-snapshot.html">Фонд развития промышленности</a> — документальные агрегаты. <a href="https://invest.nalog.gov.ru/public-registry-szpk">Реестр СЗПК</a> — отдельный федеральный источник, импорт не подключён.</p><p><a href="facility-map.html">Карта площадок</a> · <a href="industrial-parks.html">Парки и ОЭЗ</a> · <a href="capital.html">Основные фонды и загрузка мощностей</a>.</p></section>'
    return body

def publish(page,out,stamp):
    d=collect(out,stamp);quality(d,out)
    (out/"project-coverage.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"project-coverage.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows({k:bu.csv_cell(r[k]) for k in FIELDS} for r in d["rows"])
    verify_csv(out/"project-coverage.csv",d);page("project-coverage.html",render(d));return d
