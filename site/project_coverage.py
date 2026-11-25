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
    body+='</div></section><section id="project-search"><h2>Единый поиск по региональным источникам</h2><p>Поиск по названиям, инвесторам и исходным категориям. Статусы и отрасли разных источников не унифицированы. Не рейтинг и не суммарный реестр уникальных проектов. <a href="methodology.html#project-search-method">Методика</a>.</p><div class="project-controls"><label>Регион<select id="project-search-region" disabled></select></label><label>Поиск<input id="project-search-query" type="search" placeholder="Название, инвестор, место" disabled></label><label>Отрасль источника<select id="project-search-sector" disabled></select></label><label>Статус источника<select id="project-search-state" disabled></select></label><label>Числовые сведения<select id="project-search-numeric" disabled><option value="">Все записи</option><option value="cost">Есть стоимость</option><option value="jobs">Есть рабочие места</option><option value="both">Есть оба значения</option></select></label></div><p id="project-search-status" role="status">Проверка наборов…</p><div class="metrics" id="project-search-summary"></div><h3>Заявленные параметры выбранного источника</h3><div id="project-search-totals"></div><button id="project-search-totals-export" type="button" disabled>Скачать сводку параметров CSV</button><div class="table-scroll" id="project-search-table" tabindex="0" aria-label="Поиск инвестиционных записей"></div><button id="project-search-prev" disabled type="button">Назад</button> <button id="project-search-next" disabled type="button">Далее</button> <button id="project-search-export" disabled type="button">Скачать выборку CSV</button></section><section><h2>Покрытие числовых полей</h2><p>Количество записей с числовым значением. Прочерк — неизвестный охват или поле отсутствует в источнике. Ноль — поле предусмотрено, но числовых значений нет.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Охват реестров"><table><thead><tr><th>Регион</th><th>Редакция</th><th>Записей</th><th>Стоимость</th><th>Рабочие места</th><th>Последняя проверка</th></tr></thead><tbody id="project-coverage-rows">'
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


# These are source-discovery candidates, not integrated registers.
DISCOVERY_FILE="project-source-discovery.json"
DISCOVERY_NOTE="Кандидаты файлов региональных реестров. Число ссылок не число проектов. Содержимое файлов и поля ещё не проверены."
DISCOVERY={
    "RU-ROS":("Ростовская область","https://invest-don.com/ru/register_investment_projects/",".xlsx"),
    "RU-PER":("Пермский край","https://investinperm.permkrai.ru/investoram/realizuemye-proekty/",".pdf"),
}
def discovery_allowed(key,url):
    from urllib.parse import urlsplit
    try:
        p=urlsplit(url);expected=urlsplit(DISCOVERY[key][1])
        return p.scheme=="https" and p.hostname==expected.hostname and p.port in (None,443) and not p.username and not p.password and not p.fragment and len(url)<=1500
    except (ValueError,KeyError):return False
def discovery_parse(key,raw):
    from corporate_discovery import Links
    from urllib.parse import urljoin,urldefrag,urlsplit,unquote
    if not 0<len(raw)<=4*1024*1024:raise ValueError("Размер HTML")
    p=Links();p.feed(raw.decode("utf-8",errors="strict"));p.close()
    rows={}
    for href,title in p.links:
        if not href:continue
        url=urldefrag(urljoin(DISCOVERY[key][1],href))[0]
        if not discovery_allowed(key,url) or not unquote(urlsplit(url).path).lower().endswith(DISCOVERY[key][2]):continue
        rows[url]=dict(url=url,title=(title or unquote(urlsplit(url).path).rsplit("/",1)[-1])[:300])
    if not 0<len(rows)<=100:raise ValueError("Нет однозначной ограниченной выборки ссылок")
    return [rows[k] for k in sorted(rows)]
def discovery_fetch(key):
    from corporate_discovery import Redirect
    from urllib.request import Request,build_opener
    req=Request(DISCOVERY[key][1],headers={"User-Agent":"EconomicMonitor/1.0","Accept-Encoding":"identity"})
    with build_opener(Redirect()).open(req,timeout=12) as response:
        if not discovery_allowed(key,response.geturl()) or response.headers.get_content_type()!="text/html":raise ValueError("Не HTML каталога")
        return discovery_parse(key,response.read(4*1024*1024+1))
def discovery_blank(key):
    name,url,ext=DISCOVERY[key]
    return dict(region=name,source=url,format=ext[1:],checked=None,success=None,status="waiting",error=None,candidates=[])
def discovery_quality(d):
    from corporate_watch import time
    from urllib.parse import urlsplit,unquote
    if d["schema"]!=1 or d["note"]!=DISCOVERY_NOTE or set(d["rows"])!=set(DISCOVERY):raise ValueError("Паспорт поиска")
    for key,r in d["rows"].items():
        base=discovery_blank(key)
        if any(r[k]!=base[k] for k in ("region","source","format")) or r["status"] not in ("waiting","ok","unavailable"):raise ValueError("Источник")
        checked=time(r["checked"]) if r["checked"] else None
        success=time(r["success"]) if r["success"] else None
        if success and (not checked or success>checked):raise ValueError("Даты")
        if r["status"]=="waiting" and r!=base or r["status"]=="ok" and (not success or success!=checked or r["error"]) or r["status"]=="unavailable" and (not checked or not r["error"]):raise ValueError("Состояние")
        rows=r["candidates"]
        if bool(rows)!=bool(success) or len(rows)>100 or len({x["url"] for x in rows})!=len(rows):raise ValueError("Охват")
        for x in rows:
            if not discovery_allowed(key,x["url"]) or not unquote(urlsplit(x["url"]).path).lower().endswith(DISCOVERY[key][2]) or not isinstance(x["title"],str) or not 0<len(x["title"])<=300:raise ValueError("Ссылка")
    return {"project_discovery_sources":len(DISCOVERY),"project_discovery_success":sum(bool(r["success"]) for r in d["rows"].values()),"project_discovery_candidates":sum(len(r["candidates"]) for r in d["rows"].values())}
def discover(out,previous,stamp,refresh,fetcher=discovery_fetch):
    from datetime import timedelta
    from corporate_watch import time
    from concurrent.futures import ThreadPoolExecutor
    d=dict(schema=1,note=DISCOVERY_NOTE,rows={k:discovery_blank(k) for k in DISCOVERY})
    try:
        old=json.loads((previous/DISCOVERY_FILE).read_text(encoding="utf-8"));discovery_quality(old);d=old
    except (OSError,ValueError,KeyError,TypeError,AttributeError):pass
    now=time(stamp) if refresh else None
    todo=[k for k,r in d["rows"].items() if refresh and (not r["checked"] or now>=time(r["checked"])+timedelta(days=2 if r["status"]=="unavailable" else 7))]
    def one(k):
        row=dict(d["rows"][k],checked=stamp)
        try:
            row.update(status="ok",success=stamp,error=None,candidates=fetcher(k))
            discovery_quality(dict(d,rows={**d["rows"],k:row}))
        except Exception as exc:
            row=dict(d["rows"][k],checked=stamp,status="unavailable",error=(str(exc) or type(exc).__name__)[:180])
        return row
    with ThreadPoolExecutor(max_workers=2) as pool:
        for k,r in zip(todo,pool.map(one,todo)):d["rows"][k]=r
    discovery_quality(d);(out/DISCOVERY_FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    return d
def discovery_render(d):
    discovery_quality(d)
    e=lambda x:escape(str(x),quote=True)
    body='<section id="project-discovery"><h2>Новые источники региональных реестров</h2><p>'+e(DISCOVERY_NOTE)+'</p><p>Автоматический поиск ссылок на официальных страницах раз в семь суток, при сбое — через двое суток. Файлы не импортируются до проверки формата и единиц.</p>'
    labels={"waiting":"Ожидает проверки","ok":"Ссылки обнаружены","unavailable":"Источник недоступен или формат не распознан"}
    for r in d["rows"].values():
        body+='<article><h3>'+e(r["region"])+'</h3><p><a href="'+e(r["source"])+'">Страница реестра</a> · '+e(r["format"].upper())+' · '+e(labels[r["status"]])+'</p>'
        if r["checked"]:body+='<p>Проверка: '+e(r["checked"])+'</p>'
        if r["error"]:body+='<p>'+e(r["error"])+'</p>'
        if r["candidates"]:
            body+='<p>Последняя успешная проверка: '+e(r["success"])+'</p><ul>'+''.join('<li><a href="'+e(x["url"])+'">'+e(x["title"])+'</a></li>' for x in r["candidates"])+'</ul>'
        body+='</article>'
    return body+'<p><a href="'+DISCOVERY_FILE+'">Протокол JSON</a></p></section>'

def publish(page,out,stamp,previous=None,refresh=False):
    d=collect(out,stamp);quality(d,out)
    (out/"project-coverage.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"project-coverage.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows({k:bu.csv_cell(r[k]) for k in FIELDS} for r in d["rows"])
    with (out/"project-breakdown.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=BREAKDOWN_FIELDS);w.writeheader();w.writerows({k:bu.csv_cell(r[k]) for k in BREAKDOWN_FIELDS} for r in d["breakdown"])
    verify_breakdown_csv(out/"project-breakdown.csv",d)
    verify_csv(out/"project-coverage.csv",d)
    candidates=discover(out,previous or out,stamp,refresh)
    page("project-coverage.html",render(d)+discovery_render(candidates));return d
