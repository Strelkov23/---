"""Separate official register of projects accepted for support in Krasnodar."""
import csv,hashlib,io,json,re,zipfile
from datetime import date,timedelta
from html import escape
from urllib.parse import urljoin,urlsplit
from investment_projects import fetch,norm,csv_cell
from industrial_parks import Tree,Node,clean
SOURCE="https://new.investkuban.ru/invest/"
BASELINE="https://new.investkuban.ru/upload/iblock/c65/qzhzi1g82lrwkv29in0xpayrr0e8xm89.xlsx"
REGION="Краснодарский край"
MAX=8_000_000
MONTHS="января февраля марта апреля мая июня июля августа сентября октября ноября декабря".split()
FIELDS=["record","region","name","investor","municipality","sector","edition","source","sheet","row","sha256"]
NOTE="Перечень проектов, принятых на сопровождение по приказу №70. Не реестр всех проектов региона и не доказательство их реализации. Стоимость, мощности, рабочие места и фактический выпуск в исходной таблице отсутствуют."
def allowed(u):
    p=urlsplit(u)
    return p.scheme=="https" and p.netloc=="new.investkuban.ru" and not p.query and not p.fragment and bool(re.fullmatch(r"/upload/iblock/[a-z0-9]+/[a-z0-9]+\.xlsx",p.path))
def discover(raw,today):
    if not 0<len(raw)<=MAX:raise ValueError("Размер страницы")
    t=Tree();t.feed(raw.decode("utf-8-sig"));t.close()
    def walk(n):
        for c in n.children:
            if isinstance(c,Node):
                if c.tag=="a":yield c
                yield from walk(c)
    hits=[]
    for a in walk(t.root):
        text=norm(a.text());u=urljoin(SOURCE,a.attrs.get("href",""))
        if not allowed(u) or "принятых на сопровождение" not in text or not re.search(r"№\s*70",text):continue
        m=re.search(r"по состоянию на (\d{1,2}) ([а-я]+) (20\d\d) года",text)
        if not m or m[2] not in MONTHS:continue
        d=date(int(m[3]),MONTHS.index(m[2])+1,int(m[1]))
        if date(2026,8,1)<=d<=today:hits.append((d.isoformat(),u))
    if not hits:raise ValueError("Нет датированной ссылки на перечень")
    day=max(d for d,u in hits);urls={u for d,u in hits if d==day}
    if len(urls)!=1:raise ValueError("Несколько книг одной даты")
    return day,next(iter(urls))
def parse(raw,url,edition):
    if not allowed(url) or not 0<len(raw)<=MAX:raise ValueError("URL/размер")
    date.fromisoformat(edition)
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        if len(z.infolist())>200 or sum(x.file_size for x in z.infolist())>50_000_000:raise ValueError("Распаковка")
    import openpyxl
    b=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True);tables=[];sha=hashlib.sha256(raw).hexdigest()
    try:
        for ws in b:
            if (ws.max_row or 0)>10000 or (ws.max_column or 0)>100:raise ValueError("Размер листа")
            found=False;rows=[];title=False
            for i,v in enumerate(ws.iter_rows(max_col=5,values_only=True),1):
                if i>10000:raise ValueError("Предел строк")
                if not found:
                    if i>15:break
                    if "принятых на сопровождение" in norm(v[0]):title=True
                    if [norm(x) for x in v]==["№ п/п","наименование инвестиционного проекта","инвестор","мо","отрасль"]:
                        if not title:raise ValueError("Не подтвержден тип перечня")
                        found=True
                    continue
                if not any(norm(x) for x in v):continue
                if not re.fullmatch(r"\d+",norm(v[0])) or int(norm(v[0]))!=len(rows)+1:raise ValueError("Номер строки "+str(i))
                name,investor,municipality,sector=[clean(str(x if x is not None else "")) for x in v[1:]]
                if not name or not municipality or not sector:raise ValueError("Неполная запись "+str(i))
                rows.append(dict(record=len(rows)+1,region=REGION,name=name,investor=investor,municipality=municipality,sector=sector,edition=edition,source=url,sheet=ws.title,row=i,sha256=sha))
            if found and rows:tables.append(rows)
    finally:b.close()
    if len(tables)!=1 or not 100<=len(tables[0])<=5000:raise ValueError("Неоднозначный охват")
    return tables[0]
def empty(stamp):
    return dict(schema=1,built=stamp,source_page=SOURCE,note=NOTE,status="not_loaded",checked=None,success=None,edition=None,source=None,sha256=None,rows=[])
def quality(d):
    if d["schema"]!=1 or d["source_page"]!=SOURCE or d["status"] not in ("ok","cached","not_loaded","unavailable"):raise ValueError("Метаданные")
    rows=d["rows"]
    if not isinstance(rows,list):raise ValueError("Строки")
    if rows:
        if not 100<=len(rows)<=5000 or not d["success"] or d["status"] not in ("ok","cached") or not allowed(d["source"]) or not re.fullmatch(r"[a-f0-9]{64}",d["sha256"] or ""):raise ValueError("Происхождение")
        date.fromisoformat(d["edition"])
    elif d["status"] in ("ok","cached") or any(d[k] is not None for k in ("success","edition","source","sha256")):raise ValueError("Пустой успех")
    seen=set()
    for i,r in enumerate(rows,1):
        k=(r["sheet"],r["row"])
        if set(r)!=set(FIELDS) or r["record"]!=i or r["region"]!=REGION or not r["name"] or not r["municipality"] or not r["sector"] or not r["sheet"] or type(r["row"]) is not int or r["row"]<2 or k in seen or any(r[x]!=d[x] for x in ("edition","source","sha256")):raise ValueError("Запись")
        seen.add(k)
    return dict(krasnodar_supported_project_records=len(rows),krasnodar_project_sectors=len({r["sector"] for r in rows}),krasnodar_project_municipalities=len({r["municipality"] for r in rows}))
def verify_csv(path,d):
    with path.open(encoding="utf-8-sig",newline="") as f:
        r=csv.DictReader(f)
        if r.fieldnames!=FIELDS or list(r)!=[{k:csv_cell(x[k]) for k in FIELDS} for x in d["rows"]]:raise ValueError("Краснодар CSV/JSON mismatch")
def sync(previous,stamp,refresh):
    d=empty(stamp)
    try:
        old=json.loads((previous/"krasnodar-projects.json").read_text(encoding="utf-8"));quality(old)
        d={**old,"built":stamp}
        if d["rows"]:d["status"]="cached"
    except (OSError,ValueError,KeyError,TypeError):pass
    today=date.fromisoformat(stamp[:10])
    if refresh and (not d["checked"] or today>=date.fromisoformat(d["checked"][:10])+timedelta(days=7 if d["checked"]==d["success"] else 2)):
        try:
            day,url=discover(fetch(SOURCE),today)
            if d["edition"] and day<d["edition"]:raise ValueError("Более старая редакция")
            raw=fetch(url);rows=parse(raw,url,day)
            if d["rows"] and len(rows)<.8*len(d["rows"]):raise ValueError("Резкое сокращение охвата")
            candidate={**empty(stamp),"status":"ok","checked":stamp,"success":stamp,"edition":day,"source":url,"sha256":hashlib.sha256(raw).hexdigest(),"rows":rows}
            quality(candidate);d=candidate
        except Exception as e:d.update(status="cached" if d["rows"] else "unavailable",checked=stamp,error=str(e)[:250])
    return d
def render(d):
    e=lambda v:escape(str(v if v is not None and v!="" else "—"),quote=True)
    rows=d["rows"];q=quality(d)
    state={"ok":"Загружено","cached":"Сохраненная редакция","not_loaded":"Ожидается загрузка","unavailable":"Источник недоступен"}[d["status"]]
    body='<section class="mast"><p class="kicker">Инвестиции · Краснодарский край</p><h1>Проекты на сопровождении в Краснодарском крае</h1><p><a href="project-coverage.html">Все региональные реестры и охват данных</a></p><p>'+e(NOTE)+'</p><p><a href="'+SOURCE+'">Официальный портал</a> · <a href="investment-projects.html">Бурятия</a> · <a href="amur-projects.html">Амурская область</a> · <a href="economic-map.html">Карта</a> · <a href="methodology.html#krasnodar-projects-method">Методика</a></p></section>'
    body+='<section><h2>Охват и актуальность</h2><p>'+state+' · Редакция: '+e(d["edition"])+' · Проверка: '+e(d["checked"])+' · Последняя успешная загрузка: '+e(d["success"])+'</p>'
    if d.get("error"):body+='<p role="status">'+e(d["error"])+'</p>'
    body+='<p>Записей: '+str(len(rows))+' · Отраслевых категорий: '+str(q["krasnodar_project_sectors"])+' · Муниципальных наименований: '+str(q["krasnodar_project_municipalities"])+'</p>'
    if d["source"]:body+='<p><a href="'+e(d["source"])+'">Оригинальный XLSX</a> · SHA-256: <code style="overflow-wrap:anywhere">'+e(d["sha256"])+'</code></p>'
    body+='<p><a href="krasnodar-projects.csv">CSV</a> · <a href="krasnodar-projects.json">JSON</a></p></section><section><h2>Фильтры</h2><div class="project-controls"><label>Поиск по проекту и инвестору<input id="amur-query" type="search"></label>'
    for field,label in (("sector","Отрасль"),("municipality","Муниципалитет")):
        body+='<label>'+label+'<select id="amur-'+field+'" data-amur-filter="'+field+'"><option value="">Все</option>'
        for v in sorted({r[field] for r in rows}):body+='<option value="'+e(v)+'">'+e(v)+'</option>'
        body+='</select></label>'
    body+='</div><p id="amur-count" role="status">Записей в выборке: '+str(len(rows))+'</p><div class="table-scroll project-register-table" tabindex="0" role="region" aria-label="Таблица проектов"><table><thead><tr><th>№</th><th>Проект</th><th>Инвестор</th><th>Муниципалитет</th><th>Отрасль</th></tr></thead><tbody id="amur-rows">'
    for r in rows:
        body+='<tr data-amur-sector="'+e(r["sector"])+'" data-amur-municipality="'+e(r["municipality"])+'">'+''.join('<td>'+e(r[k])+'</td>' for k in ("record","name","investor","municipality","sector"))+'</tr>'
    return body+'</tbody></table></div></section><script defer src="amur-projects.js"></script>'
def publish(page,out,previous,stamp,refresh):
    d=sync(previous,stamp,refresh);quality(d)
    (out/"krasnodar-projects.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"krasnodar-projects.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows({k:csv_cell(r[k]) for k in FIELDS} for r in d["rows"])
    verify_csv(out/"krasnodar-projects.csv",d);page("krasnodar-projects.html",render(d));return d
