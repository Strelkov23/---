"""Overview of distinct investment registers. Counts measure coverage, not performance."""
import csv,json
from collections import Counter
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

DIMENSIONS={
    "RU-BU":[("status","Статус"),("location","Место по источнику")],
    "RU-AMU":[("status","Статус"),("sector","Отрасль"),("stage","Стадия"),("municipality","Муниципальное образование"),("investor_availability","Наличие инвестора")],
    "RU-KDA":[("sector","Отрасль"),("municipality","Муниципальное образование")],
}
BREAKDOWN_FIELDS=["iso","region","edition","source","sha256","dimension","dimension_label","category","category_missing","records","denominator"]
BREAKDOWN_NOTE="Доли рассчитаны внутри одной редакции одного реестра: число записей категории / все записи этого реестра × 100. Категории сохранены буквально, пустые значения выделены отдельно; классификаторы разных регионов не унифицированы. Доли характеризуют структуру источника, а не объём инвестиций или экономику региона."

def breakdown(iso,region,d):
    rows=d["rows"]
    result=[]
    for field,label in DIMENSIONS[iso]:
        counts=Counter(r[field] if r[field] else None for r in rows)
        for category,count in sorted(counts.items(),key=lambda item:(-item[1],item[0] is None,item[0] or "")):
            result.append(dict(iso=iso,region=region,edition=d["edition"],source=d["source"],sha256=d["sha256"],dimension=field,dimension_label=label,category=category,category_missing=category is None,records=count,denominator=len(rows)))
    return result

def collect(out,stamp):
    rows=[]
    groups=[]
    for iso,region,slug,mod,kind,scope in SPECS:
        d=json.loads((out/(slug+".json")).read_text(encoding="utf-8"));mod.quality(d)
        r=d["rows"];available=bool(r)
        rows.append(dict(iso=iso,region=region,page=slug+".html",register_type=kind,scope=scope,edition=d["edition"],status=d["status"],checked=d["checked"],success=d["success"],records=len(r) if available else None,cost_numeric=sum(x["cost_mln_rub"] is not None for x in r) if available and mod is not kd else None,jobs_numeric=sum(x["jobs"] is not None for x in r) if available and mod is not kd else None,source=d["source"],source_page=d["source_page"],sha256=d["sha256"]))
        groups.extend(breakdown(iso,region,d))
    return dict(schema=1,built=stamp,note=NOTE,rows=rows,breakdown_note=BREAKDOWN_NOTE,breakdown=groups)

def quality(d,out):
    if d!=collect(out,d["built"]):raise ValueError("Сводка не соответствует региональным реестрам")
    return dict(project_registers_configured=len(d["rows"]),project_registers_available=sum(r["records"] is not None for r in d["rows"]))

def verify_csv(path,d):
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if reader.fieldnames!=FIELDS or list(reader)!=[{k:bu.csv_cell(r[k]) for k in FIELDS} for r in d["rows"]]:raise ValueError("Сводка CSV/JSON mismatch")

def verify_breakdown_csv(path,d):
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if reader.fieldnames!=BREAKDOWN_FIELDS or list(reader)!=[{k:bu.csv_cell(r[k]) for k in BREAKDOWN_FIELDS} for r in d["breakdown"]]:raise ValueError("Разрезы CSV/JSON mismatch")

def share(count,total):
    if count is None or total is None or total<=0:return "—"
    return f"{count} из {total} ({100*count/total:.1f} %)".replace(".",",")

def render(d):
    e=lambda v:escape(str(v if v is not None else "—"),quote=True)
    states={"ok":"Загружено","cached":"Сохраненная редакция","unavailable":"Источник недоступен","not_loaded":"Ожидается загрузка"}
    body='<section class="mast"><p class="kicker">Инвестиции · охват источников</p><h1>Инвестиционные проекты регионов</h1><p>'+e(NOTE)+'</p><p><a href="economic-map.html">Экономическая карта</a> · <a href="freshness.html">Актуальность данных</a> · <a href="methodology.html#project-coverage-method">Методика</a></p></section>'
    body+='<section><h2>Подключённые реестры</h2><div class="portal-grid" id="project-coverage-cards">'
    for r in d["rows"]:
        body+='<article><p class="kicker">'+e(r["register_type"])+'</p><h3><a href="'+e(r["page"])+'">'+e(r["region"])+'</a></h3><p>'+e(r["scope"])+'</p><p><strong>'+e(r["records"])+'</strong> записей · '+e(states[r["status"]])+'</p><p>Редакция: '+e(r["edition"])+'</p><p><a href="'+e(r["page"])+'">Реестр и фильтры</a> · <a href="project-coverage.html?project-region='+e(r["iso"])+'#project-search">Поиск по региону</a> · <a href="regional-manufacturing.html?rm-region='+e(r["iso"])+'">Отраслевая статистика региона</a> · <a href="industrial-parks.html?park-iso='+e(r["iso"])+'">Индустриальные парки региона</a> · <a href="'+e(r["source_page"])+'">Источник</a></p></article>'
    body+='</div></section><section id="project-search"><h2>Единый поиск по региональным источникам</h2><p>Поиск по названиям, инвесторам и исходным категориям. Статусы и отрасли разных источников не унифицированы. Не рейтинг и не суммарный реестр уникальных проектов. <a href="methodology.html#project-search-method">Методика</a>.</p><div class="project-controls"><label>Регион<select id="project-search-region" disabled></select></label><label>Поиск<input id="project-search-query" type="search" placeholder="Название, инвестор, место" disabled></label><label>Отрасль источника<select id="project-search-sector" disabled></select></label><label>Статус источника<select id="project-search-state" disabled></select></label><label>Числовые сведения<select id="project-search-numeric" disabled><option value="">Все записи</option><option value="cost">Есть стоимость</option><option value="jobs">Есть рабочие места</option><option value="both">Есть оба значения</option></select></label></div><p id="project-search-status" role="status">Проверка наборов…</p><div class="metrics" id="project-search-summary"></div><div class="table-scroll" id="project-search-table" tabindex="0" aria-label="Поиск инвестиционных записей"></div><button id="project-search-prev" disabled type="button">Назад</button> <button id="project-search-next" disabled type="button">Далее</button> <button id="project-search-export" disabled type="button">Скачать выборку CSV</button></section><section><h2>Покрытие числовых полей</h2><p>Количество записей с числовым значением. Прочерк — неизвестный охват или поле отсутствует в источнике. Ноль — поле предусмотрено, но числовых значений нет.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Охват реестров"><table><thead><tr><th>Регион</th><th>Редакция</th><th>Записей</th><th>Стоимость</th><th>Рабочие места</th><th>Последняя проверка</th></tr></thead><tbody id="project-coverage-rows">'
    for r in d["rows"]:
        body+='<tr><td><a href="'+e(r["page"])+'">'+e(r["region"])+'</a></td>'+''.join('<td>'+e(r[k])+'</td>' for k in ("edition","records"))+''.join('<td>'+e(share(r[k],r["records"]))+'</td>' for k in ("cost_numeric","jobs_numeric"))+'<td>'+e(r["checked"])+'</td>'+'</tr>'
    body+='</tbody></table></div><p><a href="project-coverage.csv">CSV охвата</a> · <a href="project-coverage.json">JSON с метаданными</a></p></section>'
    body+='<section><h2>Структура записей внутри каждого реестра</h2><p>'+e(BREAKDOWN_NOTE)+'</p><p><a href="project-breakdown.csv">CSV категорий и знаменателей</a></p>'
    for r in d["rows"]:
        body+='<article><h3>'+e(r["region"])+'</h3><p>Редакция: '+e(r["edition"])+'</p>'
        if r["records"] is None:body+='<p>Нет подтвержденной редакции.</p>'
        for field,label in DIMENSIONS[r["iso"]]:
            groups=[g for g in d["breakdown"] if g["iso"]==r["iso"] and g["dimension"]==field]
            if not groups:continue
            body+='<details><summary>'+e(label)+' — '+str(len(groups))+' категорий</summary><div class="table-scroll" tabindex="0" role="region" aria-label="'+e(label)+'"><table><thead><tr><th>Категория источника</th><th>Записей и доля</th></tr></thead><tbody>'
            for g in groups:
                body+='<tr data-project-breakdown="1"><td>'+e("Не указано в источнике" if g["category_missing"] else g["category"])+'</td><td>'+e(share(g["records"],g["denominator"]))+'</td></tr>'
            body+='</tbody></table></div></details>'
        body+='</article>'
    body+='</section><section><h2>Связанные данные</h2><p><a href="frp-snapshot.html">Фонд развития промышленности</a> — документальные агрегаты. <a href="https://invest.nalog.gov.ru/public-registry-szpk">Реестр СЗПК</a> — отдельный федеральный источник, импорт не подключён.</p><p><a href="facility-map.html">Карта площадок</a> · <a href="industrial-parks.html">Парки и ОЭЗ</a> · <a href="capital.html">Основные фонды и загрузка мощностей</a>.</p></section>'
    return body+'<script defer src="provenance.js"></script><script defer src="project-search.js"></script>'

def publish(page,out,stamp):
    d=collect(out,stamp);quality(d,out)
    (out/"project-coverage.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"project-coverage.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows({k:bu.csv_cell(r[k]) for k in FIELDS} for r in d["rows"])
    with (out/"project-breakdown.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=BREAKDOWN_FIELDS);w.writeheader();w.writerows({k:bu.csv_cell(r[k]) for k in BREAKDOWN_FIELDS} for r in d["breakdown"])
    verify_breakdown_csv(out/"project-breakdown.csv",d)
    verify_csv(out/"project-coverage.csv",d);page("project-coverage.html",render(d));return d
