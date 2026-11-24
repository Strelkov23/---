"""Official Amur regional project workbook, independently scoped and dated."""
import csv,hashlib,io,json,re,zipfile
from datetime import date,timedelta,datetime
from html import escape
from urllib.parse import urljoin,urlsplit,unquote
from investment_projects import fetch,number,norm,csv_cell
from industrial_parks import Tree,Node,clean

SOURCE="https://www.invest.amurobl.ru/investor/investment-projects/?section=292"
BASELINE="https://www.invest.amurobl.ru/upload/iblock/f3b/3p1q88k692k67ub94yaa643moq6cyd8w/Reestr-investitsionnyy-proektov-01.10.2026.xlsx"
REGION="Амурская область"
MAX=8_000_000
NOTE="Региональный перечень реализуемых и запланированных проектов. Плановый объем инвестиций и заявленные рабочие места не подтверждают фактическое освоение средств и занятость. «Наличие инвестора» — статус, не название компании. Статусы, отрасли и стадии сохраняются в исходной классификации. Номера действительны только внутри редакции. Не суммируется с Бурятией, ФРП и СЗПК."
HEADERS=[
"№ п/п","Наименование инвестиционного проекта","Наличие инвестора",
"Наименование органа исполнительной власти Амурской области/органа местного самоуправления Амурской области, в сфере ведения которого",
"Отрасль реализации инвестиционного проекта","Статус инвестиционного проекта",
"Стадия реализации инвестиционного проекта","Применяемый механизм/категория инвестиционного проекта",
"Наименование муниципального образования Амурской области, на территории которого реализуется или планируется к реализации инвестиционный проект",
"Место реализации инвестиционного проекта","Период реализации инвестиционного проекта",
"Плановый объем инвестиций, млн рублей","Количество рабочих мест, ед."
]
TEXT_FIELDS=["name","investor_availability","agency","sector","status","stage","support","municipality","location","period"]
FIELDS=["record","region",*TEXT_FIELDS,"cost_mln_rub","jobs","cost_raw","jobs_raw","cost_state","jobs_state","sheet","row","edition","source","sha256"]

def release(url):
    p=urlsplit(url);path=unquote(p.path)
    if p.scheme!="https" or p.netloc!="www.invest.amurobl.ru" or p.query or p.fragment or not re.fullmatch(r"/upload/iblock/[a-z0-9]+/[a-z0-9]+/[^/]+\.xlsx",path,re.I):raise ValueError("Ссылка вне реестра Амурской области")
    m=re.fullmatch(r"Reestr[-_ ]investitsionnyy[-_ ]proektov[-_ ](\d{2}\.\d{2}\.20\d{2})\.xlsx",path.rsplit("/",1)[-1],re.I)
    if not m:raise ValueError("Не распознана дата файла")
    return datetime.strptime(m[1],"%d.%m.%Y").date()

def discover(raw,today):
    if not 0<len(raw)<=MAX:raise ValueError("Размер каталога")
    tree=Tree();tree.feed(raw.decode("utf-8-sig"));tree.close()
    def anchors(n):
        for c in n.children:
            if isinstance(c,Node):
                if c.tag=="a":yield c
                yield from anchors(c)
    hits=[]
    for a in anchors(tree.root):
        u=urljoin(SOURCE,a.attrs.get("href",""))
        try:day=release(u)
        except ValueError:continue
        if release(BASELINE)<=day<=today:hits.append((day,u))
    if not hits:raise ValueError("Не обнаружена датированная книга")
    latest=max(x[0] for x in hits)
    urls={u for day,u in hits if day==latest}
    if len(urls)!=1:raise ValueError("Несколько ссылок одной редакции")
    return next(iter(urls))

def match_header(values):
    if len(values)<13:return False
    return all(norm(v).startswith(norm(h)) if i==3 else norm(v)==norm(h) for i,(h,v) in enumerate(zip(HEADERS,values)))

def numeric(raw,integer=False):
    # Preserve explicit textual source markers, never turn them into zero.
    t=norm(raw)
    if t in ("","-","—","–","н/д","нет данных","не определено","уточняется","на уточнении","не предусмотрено","не требуется","нет","н.д.","н/а"):
        return None,"missing" if not t else "source_marker"
    try:v=number(raw,integer)
    except ValueError:raise ValueError("Нераспознанное числовое поле: "+str(raw)[:80])
    return v,"numeric" if v is not None else "source_marker"

def parse(raw,url):
    day=release(url).isoformat()
    if not 0<len(raw)<=MAX:raise ValueError("Размер XLSX")
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        if len(z.infolist())>200 or sum(x.file_size for x in z.infolist())>50_000_000:raise ValueError("Предел распаковки")
    import openpyxl
    book=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    digest=hashlib.sha256(raw).hexdigest();tables=[]
    try:
        for ws in book:
            if (ws.max_row or 0)>10000 or (ws.max_column or 0)>200:raise ValueError("Размер листа")
            rows=[];found=False
            for pos,v in enumerate(ws.iter_rows(max_col=13,values_only=True),1):
                if pos>10000:raise ValueError("Предел строк")
                if not found:
                    if pos>20:break
                    found=match_header(v);continue
                if not any(x is not None and norm(x) for x in v):continue
                if tuple(v)==tuple(range(1,14)) and not rows:continue
                if not re.fullmatch(r"\d+",norm(v[0])):raise ValueError("Строка без номера: "+str(pos))
                n=int(norm(v[0]))
                if n!=len(rows)+1:raise ValueError("Непоследовательный номер: "+str(n))
                fields={k:clean(str(x if x is not None else "")) for k,x in zip(TEXT_FIELDS,v[1:11])}
                if not fields["name"] or not fields["sector"] or not fields["status"]:raise ValueError("Неполная карточка: "+str(n))
                cost_raw=str(v[11] if v[11] is not None else "");jobs_raw=str(v[12] if v[12] is not None else "")
                try:cost,cs=numeric(cost_raw);jobs,js=numeric(jobs_raw,True)
                except ValueError as e:raise ValueError("Строка "+str(pos)+": "+str(e))
                rows.append(dict(record=n,region=REGION,**fields,cost_mln_rub=cost,jobs=jobs,cost_raw=cost_raw,jobs_raw=jobs_raw,cost_state=cs,jobs_state=js,sheet=ws.title,row=pos,edition=day,source=url,sha256=digest))
            if found and rows:tables.append(rows)
    finally:book.close()
    if len(tables)!=1:raise ValueError("Неоднозначная таблица")
    if not 100<=len(tables[0])<=3000:raise ValueError("Неожиданный охват")
    return tables[0]

def empty(stamp):
    return dict(schema=1,built=stamp,source_page=SOURCE,note=NOTE,status="not_loaded",checked=None,success=None,edition=None,source=None,sha256=None,rows=[])

def quality(d):
    if d["schema"]!=1 or d["source_page"]!=SOURCE or d["status"] not in ("ok","cached","unavailable","not_loaded"):raise ValueError("Метаданные")
    rows=d["rows"]
    if not isinstance(rows,list):raise ValueError("Строки")
    if rows:
        if not 100<=len(rows)<=3000 or not d["success"] or d["status"] not in ("ok","cached") or release(d["source"]).isoformat()!=d["edition"] or not re.fullmatch(r"[a-f0-9]{64}",d["sha256"] or ""):raise ValueError("Охват/происхождение")
    elif d["status"] in ("ok","cached") or any(d[k] is not None for k in ("success","edition","source","sha256")):raise ValueError("Пустой успешный импорт")
    seen=set()
    for i,r in enumerate(rows,1):
        k=(r["sheet"],r["row"])
        if set(r)!=set(FIELDS) or r["record"]!=i or r["region"]!=REGION or not r["name"] or not r["sector"] or not r["status"] or not r["sheet"] or type(r["row"]) is not int or r["row"]<3 or k in seen or any(r[x]!=d[x] for x in ("edition","source","sha256")):raise ValueError("Запись")
        seen.add(k)
        if (r["cost_mln_rub"],r["cost_state"])!=numeric(r["cost_raw"]) or (r["jobs"],r["jobs_state"])!=numeric(r["jobs_raw"],True):raise ValueError("Число/маркер")
    return dict(amur_project_records=len(rows),amur_project_cost_records=sum(r["cost_state"]=="numeric" for r in rows),amur_project_jobs_records=sum(r["jobs_state"]=="numeric" for r in rows),amur_project_sectors=len({r["sector"] for r in rows}),amur_project_municipalities=len({r["municipality"] for r in rows if r["municipality"]}))

def verify_csv(path,d):
    with path.open(encoding="utf-8-sig",newline="") as f:
        r=csv.DictReader(f)
        if r.fieldnames!=FIELDS or list(r)!=[{k:csv_cell(x[k]) for k in FIELDS} for x in d["rows"]]:raise ValueError("Амур CSV/JSON mismatch")

def sync(previous,stamp,refresh):
    d=empty(stamp)
    try:
        old=json.loads((previous/"amur-projects.json").read_text(encoding="utf-8"));quality(old)
        d={**old,"built":stamp}
        if d["rows"]:d["status"]="cached"
    except (OSError,ValueError,TypeError,KeyError):pass
    today=date.fromisoformat(stamp[:10])
    if refresh and (not d["checked"] or today>=date.fromisoformat(d["checked"][:10])+timedelta(days=7 if d["checked"]==d["success"] else 2)):
        try:
            # Verified direct baseline is a fallback if catalogue discovery fails.
            try:url=discover(fetch(SOURCE),today)
            except Exception:
                url=d["source"] or BASELINE
            if release(url)>today or d["edition"] and release(url).isoformat()<d["edition"]:raise ValueError("Редакция устарела или будущая")
            raw=fetch(url);rows=parse(raw,url)
            if d["rows"] and len(rows)<.8*len(d["rows"]):raise ValueError("Резкое сокращение охвата")
            candidate={**empty(stamp),"status":"ok","checked":stamp,"success":stamp,"edition":release(url).isoformat(),"source":url,"sha256":hashlib.sha256(raw).hexdigest(),"rows":rows}
            quality(candidate);d=candidate
        except Exception as e:d.update(status="cached" if d["rows"] else "unavailable",checked=stamp,error=str(e)[:250])
    return d

def render(d):
    e=lambda v:escape(str(v if v is not None and v!="" else "—"),quote=True)
    rows=d["rows"];counts=quality(d)
    status={"ok":"Загружено","cached":"Сохраненная редакция","unavailable":"Источник недоступен","not_loaded":"Ожидается загрузка"}[d["status"]]
    body='<section class="mast"><p class="kicker">Инвестиции · Амурская область</p><h1>Инвестиционные проекты Амурской области</h1><p>'+e(NOTE)+'</p><p><a href="investment-projects.html">Региональные реестры: Бурятия</a> · <a href="'+SOURCE+'">Официальный портал</a> · <a href="economic-map.html">Экономическая карта</a> · <a href="methodology.html#amur-projects-method">Методика</a></p></section>'
    body+='<section><h2>Охват и актуальность</h2><p>'+status+' · Редакция: '+e(d["edition"])+' · Проверка: '+e(d["checked"])+' · Последняя успешная загрузка: '+e(d["success"])+'</p>'
    if d.get("error"):body+='<p role="status">'+e(d["error"])+'</p>'
    body+='<p>Записей: '+str(len(rows))+' · Отраслевых категорий: '+str(counts["amur_project_sectors"])+' · Муниципальных наименований: '+str(counts["amur_project_municipalities"])+' · Числовая стоимость: '+str(counts["amur_project_cost_records"])+' · Числовые рабочие места: '+str(counts["amur_project_jobs_records"])+'</p>'
    if d["source"]:body+='<p><a href="'+e(d["source"])+'">Оригинальный XLSX</a> · SHA-256: <code style="overflow-wrap:anywhere">'+e(d["sha256"])+'</code></p>'
    body+='<p><a href="amur-projects.csv">CSV</a> · <a href="amur-projects.json">JSON</a></p></section><section><h2>Фильтры проектов</h2><label>Поиск по названию и месту<input type="search" id="amur-query"></label>'
    for field,label in (("sector","Отрасль"),("status","Статус"),("stage","Стадия"),("municipality","Муниципальное образование"),("investor_availability","Наличие инвестора")):
        body+='<label>'+label+'<select id="amur-'+field+'" data-amur-filter="'+field+'"><option value="">Все</option>'
        for v in sorted({r[field] for r in rows if r[field]}):body+='<option value="'+e(v)+'">'+e(v)+'</option>'
        body+='</select></label>'
    body+='<p role="status" id="amur-count">Записей в выборке: '+str(len(rows))+'</p><div class="table-scroll"><table><thead><tr>'+''.join('<th>'+h+'</th>' for h in ("№","Проект","Отрасль","Статус","Стадия","Муниципалитет","Место","Инвестор","Механизм","Период","Плановые инвестиции, млн руб.","Рабочие места, ед.","Орган власти"))+'</tr></thead><tbody id="amur-rows">'
    for r in rows:
        body+='<tr '+ ' '.join('data-amur-'+f.replace("_","-")+'="'+e(r[f])+'"' for f in ("sector","status","stage","municipality","investor_availability"))+'>'
        body+=''.join('<td>'+e(r[f])+'</td>' for f in ("record","name","sector","status","stage","municipality","location","investor_availability","support","period"))
        for field,raw in (("cost_mln_rub","cost_raw"),("jobs","jobs_raw")):body+='<td>'+e(r[field] if r[field] is not None else r[raw])+'</td>'
        body+='<td>'+e(r["agency"])+'</td></tr>'
    return body+'</tbody></table></div><p>Плановые значения не складываются с фактическими показателями ВРП, промышленного выпуска и инвестиционной статистики Росстата. Отсутствие записи не означает отсутствие проекта.</p></section><script defer src="amur-projects.js"></script>'

def publish(page,out,previous,stamp,refresh):
    d=sync(previous,stamp,refresh);quality(d)
    (out/"amur-projects.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"amur-projects.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows({k:csv_cell(r[k]) for k in FIELDS} for r in d["rows"])
    verify_csv(out/"amur-projects.csv",d);page("amur-projects.html",render(d))
    return d
