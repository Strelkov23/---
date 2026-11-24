"""Official tables, conservative parsing, explicit scope and original cell provenance."""
import csv,io,json,hashlib,re,math,zipfile
from datetime import date,timedelta
from html import escape
from urllib.parse import urlsplit
import historical as h
CATALOGS={
 "capital":"https://rosstat.gov.ru/folder/14304",
 "capacity":"https://www.rosstat.gov.ru/enterprise_industrial",
 "cost":"https://rosstat.gov.ru/statistics/instituteconomics",
 "debt":"https://rosstat.gov.ru/statistics/finance"}
# Titles must occur in workbook headers; catalogue hints alone do not prove meaning.
RULES={
 "stock":(r"наличие основных фондов.*полной учетной стоимости",r"миллион[а-я]* рубл|млн\.?\s*руб","млн руб.","capital"),
 "wear":(r"степень износа основных фондов",r"процент|%","%","capital"),
 "renewal":(r"коэффициент обновления основных фондов",r"процент|%","%","capital"),
 "disposal":(r"коэффициент выбытия основных фондов",r"процент|%","%","capital"),
 "capacity":(r"использовани[ея] среднегодовой производственной мощности",r"процент|%","%","capacity"),
 "cost":(r"структура затрат на производство и продажу",r"процент|%","%","cost"),
 "debt":(r"(?:кредиторская|дебиторская|суммарная) задолженность",r"миллиард[а-я]* рубл|млрд\.?\s*руб","млрд руб.","debt")}
HINTS={
 "capital":r"основн.*фонд|износ|обновлен|выбыт",
 "capacity":r"мощност|mosh|mo[sš]chn",
 "cost":r"структур.*затрат|zatraty_god",
 "debt":r"финансов.*состояни|задолженност|fin_sost"}
def allowed(url):
    u=urlsplit(url)
    return h.allowed(url) and (u.hostname=="rosstat.gov.ru" or u.hostname.endswith(".rosstat.gov.ru")) and u.path.lower().endswith((".xlsx",".xls"))
def candidates(group,files):
    return [f for f in files if allowed(f["url"]) and re.search(HINTS[group],h.norm(f["title"]+" "+f["url"])) and not re.search(r"субъект|региональн|федеральн.*округ",h.norm(f["title"]))]
def parse_sheet(rows,group,sheet,url,now_year):
    # Annual horizontal layouts only. Reject mixed/ambiguous metric or geographical dimensions.
    if not rows:return []
    found=[]
    for hi,row in enumerate(rows[:35]):
        yrcols=[(j,h.year(v)) for j,v in enumerate(row) if h.year(v)]
        if len(yrcols)<2 or len({y for j,y in yrcols})!=len(yrcols) or any(y>now_year for j,y in yrcols):continue
        if any(b!=a+1 for a,b in zip([y for j,y in yrcols],[y for j,y in yrcols][1:])):continue
        first=yrcols[0][0]
        if first<1:continue
        header=" ".join(h.norm(v) for line in rows[max(0,hi-8):hi+1] for v in line if v is not None)
        # National scope explicitly stated; reject regional tables.
        if not re.search(r"российск[а-я]+ федераци|в целом по россии",header) or re.search(r"по субъектам|в разрезе субъектов|по федеральным округам",header):continue
        # Multi-element tables (costs) and monthly debt are deliberately rejected until layout is mapped.
        if group in ("cost","debt"):continue
        matches=[(k,v) for k,v in RULES.items() if v[3]==group and re.search(v[0],header) and re.search(v[1],header)]
        if len(matches)!=1:continue
        metric,(_,_,unit,_)=matches[0]
        if group=="capital" and "видам экономической деятельности" not in header:continue
        if group=="capacity" and not re.search(r"без субъектов малого предпринимательства|без малых предприятий",header):continue
        result=[];seen=set()
        for i,line in enumerate(rows[hi+1:],hi+2):
            names=[str(v).strip() for v in line[:first] if isinstance(v,str) and re.search(r"[А-Яа-яЁё]",v)]
            if len(names)!=1:continue
            title=names[0];key=h.norm(title)
            if key.startswith(("примечан","источник","сноск","в том числе")):continue
            obs=[]
            for j,y in yrcols:
                v=h.numeric(line[j]) if j<len(line) else None
                if v is None or v<0 or (metric in ("wear","renewal","disposal","capacity") and v>100):continue
                obs.append(dict(metric=metric,title=title,year=y,value=v,unit=unit,source=url,sheet=sheet,row=i,column=j+1,definition=header))
            if not obs:continue
            if key in seen:raise ValueError("Повтор названия строки")
            seen.add(key);result.extend(obs)
        if len(seen)>=10:found.append(result)
    if len(found)>1:raise ValueError("Несколько возможных заголовков")
    return found[0] if found else []
def parse(raw,group,url,now_year):
    if raw[:4]==b"PK\x03\x04":
        import openpyxl
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            if sum(x.file_size for x in z.infolist())>80_000_000:raise ValueError("Слишком большой архив")
        book=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
        try:
            sheets=[]
            for s in book:
                if (s.max_row or 0)>4000 or (s.max_column or 0)>150:raise ValueError("Неожиданный размер листа")
                sheets.append((s.title,list(s.iter_rows(values_only=True))))
        finally:book.close()
    elif raw[:8]==bytes.fromhex("d0cf11e0a1b11ae1"):
        import xlrd
        book=xlrd.open_workbook(file_contents=raw,on_demand=True)
        try:
            sheets=[]
            for s in book.sheets():
                if s.nrows>4000 or s.ncols>150:raise ValueError("Неожиданный размер листа")
                sheets.append((s.name,[s.row_values(i) for i in range(s.nrows)]))
        finally:book.release_resources()
    else:raise ValueError("Не XLS/XLSX")
    result=[r for name,rows in sheets for r in parse_sheet(rows,group,name,url,now_year)]
    if not result:raise ValueError("Нет однозначной годовой таблицы нужного показателя и охвата")
    keys=[(r["metric"],h.norm(r["title"]),r["year"]) for r in result]
    if len(keys)!=len(set(keys)):raise ValueError("Неоднозначные повторные наблюдения между листами")
    return result
def sync(db,stamp,refresh,out):
    db.execute("create table if not exists rosstat_workbooks(url text primary key,grp text,checked text,success text,status text,sha text,rows text)")
    db.execute("create table if not exists rosstat_workbook_catalog(grp text primary key,checked text,success text,status text,files text)")
    historical=json.loads((out/"historical.json").read_text(encoding="utf-8"))
    for group,url in CATALOGS.items():
        source=next((s for s in historical["sources"] if s["url"]==url),None)
        old=db.execute("select checked,success,status,files from rosstat_workbook_catalog where grp=?",(group,)).fetchone()
        if source and source.get("files"):
            files=candidates(group,source["files"])
            db.execute("insert or replace into rosstat_workbook_catalog values(?,?,?,?,?)",(group,source.get("checked"),source.get("success"),source["status"],json.dumps(files,ensure_ascii=False)))
        elif refresh and (not old or not old[0] or (date.fromisoformat(stamp[:10])-date.fromisoformat(old[0][:10])).days>=7):
            try:
                raw,enc=h.get(url,5_000_000);files=candidates(group,h.discover(raw.decode(enc,errors="replace"),url))
                if not files:raise ValueError("Не обнаружено подходящих XLS/XLSX")
                db.execute("insert or replace into rosstat_workbook_catalog values(?,?,?,?,?)",(group,stamp,stamp,"Найдено файлов: "+str(len(files)),json.dumps(files,ensure_ascii=False)))
            except Exception as e:
                db.execute("insert into rosstat_workbook_catalog values(?,?,null,?,?) on conflict(grp) do update set checked=excluded.checked,status=excluded.status",(group,stamp,"Ошибка: "+str(e)[:180],"[]"))
    catalogs=[dict(group=g,checked=c,success=s,status=t,files=json.loads(f)) for g,c,s,t,f in db.execute("select grp,checked,success,status,files from rosstat_workbook_catalog")]
    if refresh:
        options=[]
        for cat in catalogs:
            # Discovery for costs/debt is useful, but unsupported table layouts are not fetched repeatedly.
            if cat["group"] not in ("capital","capacity"):continue
            for file in cat["files"]:
                u=file["url"];old=db.execute("select checked,success,sha,rows from rosstat_workbooks where url=?",(u,)).fetchone()
                if not old or (date.fromisoformat(stamp[:10])-date.fromisoformat(old[0][:10])).days>=(30 if old[0]==old[1] else 7):
                    options.append((old is not None,old[0] if old else "",u,cat["group"],old))
        for _,__,url,group,old in sorted(options,key=lambda r:r[:3])[:3]:
            try:
                raw,_=h.get(url,12_000_000);rows=parse(raw,group,url,int(stamp[:4]))
                db.execute("insert or replace into rosstat_workbooks values(?,?,?,?,?,?,?)",(url,group,stamp,stamp,"Импортировано",hashlib.sha256(raw).hexdigest(),json.dumps(rows,ensure_ascii=False,allow_nan=False)))
            except Exception as e:
                db.execute("insert or replace into rosstat_workbooks values(?,?,?,?,?,?,?)",(url,group,stamp,old[1] if old else None,"Ошибка: "+str(e)[:180],old[2] if old else None,old[3] if old else "[]"))
    return dict(schema=1,built=stamp,catalogs=catalogs,files=[dict(url=u,group=g,checked=c,success=s,status=t,sha256=sha,rows=json.loads(r)) for u,g,c,s,t,sha,r in db.execute("select url,grp,checked,success,status,sha,rows from rosstat_workbooks order by grp,url")])
def quality(d):
    if d.get("schema")!=1:raise ValueError("schema")
    urls=set();count=0
    for f in d["files"]:
        u=f["url"]
        if u in urls or not allowed(u):raise ValueError("Invalid URL")
        urls.add(u);keys=set()
        if f["rows"] and (not f["success"] or not re.fullmatch(r"[a-f0-9]{64}",f["sha256"] or "")):raise ValueError("No provenance")
        for r in f["rows"]:
            k=(r["metric"],h.norm(r["title"]),r["year"])
            if k in keys or r["source"]!=u or r["metric"] not in RULES or RULES[r["metric"]][3]!=f["group"] or r["unit"]!=RULES[r["metric"]][2] or type(r["value"]) not in (int,float) or not math.isfinite(r["value"]) or r["value"]<0 or (r["unit"]=="%" and r["value"]>100):raise ValueError("Bad observation")
            keys.add(k);count+=1
    return dict(rosstat_workbook_files=sum(bool(f["rows"]) for f in d["files"]),rosstat_workbook_observations=count)
def publish(page,out,d):
    quality(d)
    (out/"rosstat-workbooks.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"rosstat-workbooks.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=["metric","title","year","value","unit","source","sheet","row","column","definition"]);w.writeheader()
        for batch in d["files"]:w.writerows(batch["rows"])
    body="<h1>Оригинальные отраслевые таблицы Росстата</h1><p>Автоматический импорт годовых таблиц фондов и мощностей. Для затрат и задолженности пока только проверяется каталог; ручные наборы не замещаются.</p><p><a href='rosstat-workbooks.csv'>CSV</a> · <a href='rosstat-workbooks.json'>JSON</a> · <a href='capital.html'>Основные фонды</a> · <a href='cost-structure.html'>Затраты</a> · <a href='financial-state.html'>Финансовое состояние</a></p>"
    for group,url in CATALOGS.items():
        c=next((x for x in d["catalogs"] if x["group"]==group),None)
        body+="<section><h2>"+escape({"capital":"Основные фонды","capacity":"Мощности","cost":"Затраты","debt":"Задолженность"}[group])+"</h2><p><a href='"+escape(url,quote=True)+"'>Каталог Росстата</a> · "+escape(c["status"] if c else "Ожидается проверка")+"</p>"
        if c:
            body+="<details><summary>Обнаруженные файлы: "+str(len(c["files"]))+"</summary><ul>"
            for f in c["files"]:body+="<li><a href='"+escape(f["url"],quote=True)+"'>"+escape(f["title"])+"</a></li>"
            body+="</ul></details>"
        for f in d["files"]:
            if f["group"]==group:body+="<p>"+escape(f["url"].rsplit("/",1)[-1])+" · "+escape(f["status"])+" · наблюдений: "+str(len(f["rows"]))+" · последний успех: "+escape(str(f["success"] or "—"))+"</p>"
        body+="</section>"
    page("rosstat-workbooks.html",body)
