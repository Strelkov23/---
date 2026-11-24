"""Pilot regional investment register; declared project parameters, never actual expenditure."""
import calendar,csv,hashlib,io,json,re,zipfile
from datetime import date,timedelta
from decimal import Decimal,InvalidOperation
from html import escape
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
from industrial_parks import Tree,Node,clean

SOURCE="https://invest-buryatia.ru/reestr"
BASELINE="https://file.invest-buryatia.ru/docs/registries/reestr3q2026.xlsx"
REGION="Республика Бурятия"
MAX=8_000_000
NOTE="Пилот: опубликованный реестр одного региона. Стоимость проекта и количество создаваемых рабочих мест — заявленные параметры, а не фактические инвестиции или занятость. Статус относится к дате реестра, не к сегодняшнему дню. Нумерация относится к редакции, а не к постоянному идентификатору проекта. Отсутствие региона не означает отсутствие проектов."
FIELDS=["record","region","name","investor","location","status","period","cost_mln_rub","jobs","cost_raw","jobs_raw","sheet","row","edition","source","sha256"]
STATUS={"реализуемый","планируемый","перспективный","приостановленный","завершенный"}

def norm(v):
    return clean(str(v if v is not None else "")).lower().replace("ё","е")

def release(url):
    u=urlsplit(url)
    m=re.fullmatch(r"/docs/registries/reestr([1-4])q(20\d{2})\.xlsx",u.path)
    if u.scheme!="https" or u.netloc!="file.invest-buryatia.ru" or u.query or u.fragment or not m:
        raise ValueError("Неизвестная ссылка на квартальный реестр")
    month=int(m[1])*3;year=int(m[2])
    return date(year,month,calendar.monthrange(year,month)[1])

def discover(raw,today):
    if not 0<len(raw)<=MAX:raise ValueError("Размер страницы")
    p=Tree();p.feed(raw.decode("utf-8-sig"));p.close()
    def anchors(n):
        for c in n.children:
            if isinstance(c,Node):
                if c.tag=="a":yield c
                yield from anchors(c)
    whole=p.root.text()
    candidates=[]
    for a in anchors(p.root):
        url=a.attrs.get("href","")
        try:day=release(url)
        except ValueError:continue
        if date(2026,9,30)<=day<=today and day.strftime("%d.%m.%Y") in whole:
            candidates.append((day,url))
    if not candidates:raise ValueError("Нет подтвержденной датированной ссылки на XLSX")
    return max(candidates)[1]

def number(v,integer=False):
    if v is None or norm(v) in ("","-","—","–","н/д","нет данных"):return None
    if isinstance(v,bool):raise ValueError("Логическое значение вместо числа")
    try:n=Decimal(str(v).replace(" ","").replace("\u00a0","").replace("\u202f","").replace(",","."))
    except InvalidOperation:raise ValueError("Неизвестное число: "+str(v)[:60])
    if not n.is_finite() or n<0 or n>Decimal("1e12") or integer and n!=n.to_integral_value():raise ValueError("Недопустимое число")
    return int(n) if integer else format(n,"f")

def header(row):
    cells=[norm(x) for x in row]
    tests=[lambda s:s in ("№","№ п/п","номер","№п/п"),lambda s:"наименование" in s and "проект" in s,
           lambda s:"инициатор" in s or "инвестор" in s,lambda s:"место" in s and "реализац" in s,
           lambda s:"статус" in s and "проект" in s,lambda s:"срок" in s and "реализац" in s,
           lambda s:"стоимость" in s and "млн" in s and "руб" in s,lambda s:"рабоч" in s and "мест" in s]
    matches=[[i for i,x in enumerate(cells) if test(x)] for test in tests]
    if not all(len(x)==1 for x in matches):return None
    idx=[x[0] for x in matches]
    return idx if len(set(idx))==len(idx) else None

def parse(raw,url):
    day=release(url).isoformat()
    if not 0<len(raw)<=MAX:raise ValueError("Размер XLSX")
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        if len(z.infolist())>200 or sum(x.file_size for x in z.infolist())>50_000_000:raise ValueError("Предел распаковки XLSX")
    import openpyxl
    book=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    digest=hashlib.sha256(raw).hexdigest();tables=[]
    try:
        for ws in book:
            if ws.max_row and ws.max_row>20000 or ws.max_column and ws.max_column>100:raise ValueError("Размер листа")
            ix=None;rows=[]
            for pos,values in enumerate(ws.iter_rows(values_only=True),1):
                if pos>20000:raise ValueError("Предел строк")
                if ix is None:
                    if pos>40:break
                    ix=header(values)
                    continue
                v=[values[i] if i<len(values) else None for i in ix]
                no=norm(v[0])
                if not re.fullmatch(r"\d+",no):
                    # Blank numbering with populated project and status may hide a record.
                    if norm(v[1]) and norm(v[4]) in STATUS:raise ValueError("Запись без номера")
                    continue
                n=int(no)
                if n!=len(rows)+1:raise ValueError("Непоследовательная нумерация")
                name,investor,location,status,period=[clean(str(x if x is not None else "")) for x in v[1:6]]
                if not name or not location or norm(status) not in STATUS:raise ValueError("Неизвестная структура записи "+str(n))
                rows.append(dict(record=n,region=REGION,name=name,investor=investor,location=location,status=norm(status),period=period,
                    cost_mln_rub=number(v[6]),jobs=number(v[7],True),cost_raw=str(v[6] if v[6] is not None else ""),jobs_raw=str(v[7] if v[7] is not None else ""),
                    sheet=ws.title,row=pos,edition=day,source=url,sha256=digest))
            if ix is not None and rows:tables.append(rows)
    finally:book.close()
    if len(tables)!=1:raise ValueError("Таблица реестра не найдена однозначно")
    rows=tables[0]
    if day=="2026-09-30" and len(rows)!=63:raise ValueError("Ожидается 63 записи по опубликованной редакции")
    if not 30<=len(rows)<=5000:raise ValueError("Неожиданный охват реестра")
    return rows


HTML_HEADER="№;Наименование проекта;Сведения об Инициаторе проекта/инвестор;Краткое описание проекта;Место реализации проекта;Статус проекта;Срок реализации проекта, годы;Общая стоимость проекта, млн. руб.;Количество создаваемых рабочих мест"
HTML_SHEET="HTML: таблица реестра"

def parse_html(raw,url):
    """Fallback for the independently counted and dated Q3 2026 edition only."""
    if url!=BASELINE or not 0<len(raw)<=MAX:raise ValueError("HTML: неизвестная редакция или размер")
    tree=Tree();tree.feed(raw.decode("utf-8-sig"));tree.close()
    text=re.sub(r"\s*;\s*",";",tree.root.text())
    if text.count(HTML_HEADER)!=1 or "30.09.2026" not in text:raise ValueError("HTML: неоднозначный заголовок или дата")
    text=text.split(HTML_HEADER,1)[1].strip()
    # End of table is an explicit heading in the published page.
    if "Архив реестров" not in text:raise ValueError("HTML: нет границы таблицы")
    text=text.split("Архив реестров",1)[0].strip()
    # Tilda inserts the literal UI label after the final record; do not strip other text.
    text=re.sub(r"(?<=\d)\s+Button$", "", text)
    digest=hashlib.sha256(raw).hexdigest();rows=[]
    for n in range(1,64):
        if not text.startswith(str(n)+";"):raise ValueError("HTML: пропущена запись "+str(n))
        if n<63:
            matches=[m for m in re.finditer(r"\s+(?="+str(n+1)+r";)",text) if len(text[:m.start()].split(";"))==9]
            if len(matches)!=1:raise ValueError("HTML: неоднозначная граница "+str(n))
            m=matches[0];part=text[:m.start()];text=text[m.end():]
        else:part=text
        values=part.split(";")
        if len(values)!=9:raise ValueError("HTML: количество полей "+str(n))
        no,name,investor,description,location,status,period,cost,jobs=map(clean,values)
        if no!=str(n) or not name or location!=REGION or norm(status) not in STATUS or not re.fullmatch(r"\d{4}(?:\s*[-–—]\s*\d{4})?",period):raise ValueError("HTML: структура записи "+str(n))
        rows.append(dict(record=n,region=REGION,name=name,investor=investor,location=location,status=norm(status),period=period,cost_mln_rub=number(cost),jobs=number(jobs,True),cost_raw=cost,jobs_raw=jobs,sheet=HTML_SHEET,row=n+1,edition=release(url).isoformat(),source=SOURCE,sha256=digest))
    return rows

def empty(stamp):
    return dict(schema=1,built=stamp,source_page=SOURCE,note=NOTE,status="not_loaded",checked=None,success=None,edition=None,source=None,source_format=None,workbook_url=None,sha256=None,rows=[])

def quality(d):
    if d["schema"]!=1 or d["source_page"]!=SOURCE or d["status"] not in ("ok","cached","unavailable","not_loaded"):raise ValueError("Метаданные реестра")
    rows=d["rows"]
    if not isinstance(rows,list):raise ValueError("Некорректные строки")
    if rows:
        if not d["success"] or d["status"] not in ("ok","cached") or release(d.get("workbook_url") or d["source"]).isoformat()!=d["edition"] or not re.fullmatch(r"[0-9a-f]{64}",d["sha256"] or ""):raise ValueError("Происхождение реестра")
        fmt=d.get("source_format","xlsx")
        if fmt not in ("html","xlsx") or fmt=="html" and (d["source"]!=SOURCE or d.get("workbook_url")!=BASELINE) or fmt=="xlsx" and d["source"]!=(d.get("workbook_url") or d["source"]):raise ValueError("Тип источника")
        if not 30<=len(rows)<=5000 or d["edition"]=="2026-09-30" and len(rows)!=63:raise ValueError("Охват")
    elif d["status"] in ("ok","cached") or any(d[k] is not None for k in ("success","edition","source","sha256")):raise ValueError("Пустой подтвержденный реестр")
    seen=set()
    for i,r in enumerate(rows,1):
        k=(r["sheet"],r["row"])
        if set(r)!=set(FIELDS) or r["record"]!=i or r["region"]!=REGION or not r["name"] or not r["location"] or r["status"] not in STATUS or not r["sheet"] or type(r["row"]) is not int or r["row"]<2 or k in seen or any(r[x]!=d[x] for x in ("edition","source","sha256")):raise ValueError("Строка реестра")
        seen.add(k)
        if d.get("source_format")=="html" and (r["sheet"]!=HTML_SHEET or r["row"]!=i+1):raise ValueError("Координата HTML")
        if r["cost_mln_rub"]!=number(r["cost_raw"]) or r["jobs"]!=number(r["jobs_raw"],True):raise ValueError("Число не соответствует исходному полю")
    return dict(investment_project_records=len(rows),investment_project_regions=int(bool(rows)),investment_project_cost_records=sum(r["cost_mln_rub"] is not None for r in rows),investment_project_jobs_records=sum(r["jobs"] is not None for r in rows))

def csv_cell(v):
    if v is None:return ""
    s=str(v)
    return "'"+s if s.lstrip().startswith(("=","+","-","@","\t","\r")) else s

def verify_csv(path,d):
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if reader.fieldnames!=FIELDS or list(reader)!=[{k:csv_cell(r[k]) for k in FIELDS} for r in d["rows"]]:raise ValueError("Реестр CSV/JSON mismatch")

def fetch(url):
    with urlopen(Request(url,headers={"User-Agent":"EconomicMonitor/3.0 (public data research)"}),timeout=25) as f:
        if f.geturl()!=url:raise ValueError("Неожиданное перенаправление")
        raw=f.read(MAX+1)
    if not 0<len(raw)<=MAX:raise ValueError("Предел загрузки")
    return raw

def sync(previous,stamp,refresh):
    d=empty(stamp)
    try:
        old=json.loads((previous/"investment-projects.json").read_text(encoding="utf-8"));quality(old)
        d={**old,"built":stamp}
        if d["rows"]:d["status"]="cached"
    except (OSError,ValueError,KeyError,TypeError):pass
    today=date.fromisoformat(stamp[:10])
    due=not d["checked"] or today>=date.fromisoformat(d["checked"][:10])+timedelta(days=7 if d["checked"]==d["success"] else 2)
    if refresh and due:
        try:
            page_raw=fetch(SOURCE)
            url=discover(page_raw,today)
            if d["edition"] and release(url).isoformat()<d["edition"]:raise ValueError("Более старая редакция")
            fmt="xlsx";source=url;workbook_error=None
            try:
                raw=fetch(url);rows=parse(raw,url)
            except Exception as e:
                workbook_error=str(e)[:250]
                if d["edition"]==release(url).isoformat() and d.get("source_format","xlsx")=="xlsx" and d["rows"]:raise
                raw=page_raw;rows=parse_html(raw,url);fmt="html";source=SOURCE
            if d["rows"] and len(rows)<0.8*len(d["rows"]):raise ValueError("Резкое сокращение охвата — сохранена прежняя редакция")
            candidate={**empty(stamp),"status":"ok","checked":stamp,"success":stamp,"edition":release(url).isoformat(),"source":source,"source_format":fmt,"workbook_url":url,"sha256":hashlib.sha256(raw).hexdigest(),"rows":rows}
            if workbook_error:candidate["workbook_error"]=workbook_error
            quality(candidate);d=candidate
        except Exception as e:d.update(status="cached" if d["rows"] else "unavailable",checked=stamp,error=str(e)[:250])
    return d

def render(d):
    e=lambda v:escape(str(v if v is not None else "—"),quote=True)
    state={"ok":"Получена новая редакция","cached":"Сохраненная редакция","unavailable":"Источник недоступен","not_loaded":"Ожидается первая загрузка"}[d["status"]]
    body='<section class="mast"><p class="kicker">Инвестиции · пилотный реестр</p><h1>Инвестиционные проекты регионов</h1><p>'+e(NOTE)+'</p><p><a href="'+SOURCE+'">Реестр Бурятии</a> · <a href="https://invest.nalog.gov.ru/public-registry-szpk">Федеральный реестр СЗПК (отдельный охват)</a> · <a href="frp-snapshot.html">Итоги ФРП</a> · <a href="industrial-parks.html">Индустриальные парки</a> · <a href="methodology.html#investment-projects-method">Методика</a></p></section>'
    body+='<section><h2>Охват и актуальность</h2><p>'+e(state)+' · Регион: '+REGION+' · Редакция: '+e(d["edition"])+' · Проверка: '+e(d["checked"])+' · Последняя успешная загрузка: '+e(d["success"])+'</p>'
    if d.get("error"):body+='<p role="status">Ошибка обновления: '+e(d["error"])+'</p>'
    body+='<p>Записей: '+str(len(d["rows"]))+'. Покрытие: '+str(int(bool(d["rows"])))+' регион из пилотного источника. Это не общероссийский итог.</p>'
    if d["source"]:
        label="Официальная HTML-таблица (резервный импорт)" if d.get("source_format")=="html" else "Оригинальная книга XLSX"
        body+='<p><a href="'+e(d["source"])+'">'+label+'</a> · SHA-256: <code style="overflow-wrap:anywhere">'+e(d["sha256"])+'</code></p>'
        if d.get("workbook_error"):body+='<p>Книга XLSX не проверена: '+e(d["workbook_error"])+' · <a href="'+e(d["workbook_url"])+'">Ссылка на книгу</a>. Номер строки HTML — порядковый номер записи с заголовком, а не ячейка XLSX.</p>'
    body+='<p><a href="investment-projects.csv">CSV всех записей</a> · <a href="investment-projects.json">JSON и метаданные</a></p></section>'
    body+='<section><h2>Поиск по реестру</h2><label>Название, инициатор, место<input id="project-query" type="search" placeholder="Введите часть названия"></label><label>Статус по реестру<select id="project-status"><option value="">Все статусы</option>'
    for status in sorted({r["status"] for r in d["rows"]}):body+='<option>'+e(status)+'</option>'
    body+='</select></label><p id="project-count" role="status">Записей в выборке: '+str(len(d["rows"]))+'</p><div class="table-scroll"><table><thead><tr><th>№</th><th>Проект</th><th>Инициатор</th><th>Место</th><th>Статус</th><th>Срок</th><th>Стоимость, млн руб.</th><th>Рабочие места, заявлено</th></tr></thead><tbody id="project-rows">'
    for r in d["rows"]:
        body+='<tr data-project-status="'+e(r["status"])+'">'+''.join('<td>'+e(r[k])+'</td>' for k in ("record","name","investor","location","status","period","cost_mln_rub","jobs"))+'</tr>'
    body+='</tbody></table></div><p>Прочерк — отсутствие значения. Ноль — только явно указанное число. Суммы не агрегируются: возможны пересечения проектов и различный охват.</p></section><script defer src="investment-projects.js"></script>'
    return body

def publish(page,out,previous,stamp,refresh):
    d=sync(previous,stamp,refresh);quality(d)
    (out/"investment-projects.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"investment-projects.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows({k:csv_cell(r[k]) for k in FIELDS} for r in d["rows"])
    verify_csv(out/"investment-projects.csv",d)
    page("investment-projects.html",render(d))
    return d
