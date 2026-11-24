"""Separate official workbook imports; manual transcription is not overwritten."""
import csv,io,json,math,re,hashlib
from datetime import datetime,timedelta,timezone
from html import escape
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
MAX=8_000_000
def norm(v):return " ".join(str(v or "").lower().replace("ё","е").split())
def valid_url(url):
    u=urlsplit(url)
    return u.scheme=="https" and u.hostname=="data.nalog.ru" and not u.username and not u.password and u.port in (None,443) and u.path.lower().endswith((".xls",".xlsx"))
def value(v):
    if norm(v).rstrip(".")=="отр":return None,"negative_unspecified"
    if isinstance(v,bool) or v is None:return None,"missing"
    try:
        n=float(str(v).strip().replace(" ","").replace(",",".").replace("−","-"))
        if math.isfinite(n):return n,"numeric"
    except ValueError:pass
    return None,"missing"
def parse_sheet(rows,year,sheet,url):
    # Header cells may be split over adjacent lines; only exact metric names qualify.
    width=max((len(r) for r in rows[:30]),default=0)
    header=None
    for i in range(min(25,len(rows))):
        cols=[" ".join(norm(r[j]) for r in rows[i:i+2] if j<len(r)) for j in range(width)]
        sales=[j for j,t in enumerate(cols) if "рентабельност" in t and "проданн" in t and ("товар" in t or "продукц" in t)]
        assets=[j for j,t in enumerate(cols) if "рентабельност" in t and "актив" in t]
        names=[j for j,t in enumerate(cols) if "вид" in t and "экономическ" in t and "деятельност" in t]
        if len(sales)==len(assets)==len(names)==1 and len(set(sales+assets+names))==3:
            header=(i+1,names[0],sales[0],assets[0]);break
    if header is None:return []
    # Calendar year must be explicitly present in workbook header, not only in filename.
    start,n,s,a=header
    header_text=" ".join(norm(v) for r in rows[:start+2] for v in r)
    if not re.search(r"\b"+str(year)+r"\b",header_text):return []
    result=[];seen=set()
    for i,r in enumerate(rows[start:],start+1):
        if max(n,s,a)>=len(r):continue
        title=str(r[n] or "").strip()
        if not re.search(r"[А-Яа-яЁё]",title) or norm(title).startswith(("примечан","источник","рентабельност","вид экономическ")):continue
        pair=[value(r[s]),value(r[a])]
        if all(sign=="missing" for _,sign in pair):continue
        key=norm(title)
        if key in seen:raise ValueError("Повтор наименования")
        seen.add(key)
        for metric,(v,sign),j in zip(("sales","assets"),pair,(s,a)):
            result.append(dict(year=year,title=title,code=hashlib.sha256(key.encode()).hexdigest()[:16],metric=metric,value=v,sign=sign,raw=str(r[j] if r[j] is not None else ""),source=url,sheet=sheet,row=i,column=j+1))
    if len(seen)<15 or not any(k in ("всего","итого","всего по экономике","всего по видам экономической деятельности") for k in seen):return []
    return result
def parse(raw,year,url):
    if raw[:4]==b"PK\x03\x04":
        import openpyxl,zipfile
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            if sum(x.file_size for x in z.infolist())>60_000_000:raise ValueError("Слишком большой XLSX")
        book=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
        try:sheets=[(s.title,list(s.iter_rows(max_row=min(s.max_row or 1000,1000),max_col=min(s.max_column or 50,50),values_only=True))) for s in book]
        finally:book.close()
    elif raw[:8]==bytes.fromhex("d0cf11e0a1b11ae1"):
        import xlrd
        book=xlrd.open_workbook(file_contents=raw,on_demand=True)
        try:sheets=[(s.name,[s.row_values(i,0,min(s.ncols,50)) for i in range(min(s.nrows,1000))]) for s in book.sheets()]
        finally:book.release_resources()
    else:raise ValueError("Не XLS/XLSX")
    results=[r for name,rows in sheets if (r:=parse_sheet(rows,year,name,url))]
    if len(results)!=1:raise ValueError("Не найдена единственная однозначная годовая таблица")
    return results[0]
def fetch(url):
    if not valid_url(url):raise ValueError("Неподтверждённый URL")
    with urlopen(Request(url,headers={"User-Agent":"EconomicsMonitor/2.5"}),timeout=20) as f:
        if not valid_url(f.geturl()):raise ValueError("Неожиданное перенаправление")
        raw=f.read(MAX+1)
    if len(raw)>MAX:raise ValueError("Превышен лимит")
    return raw
def sync(db,stamp,refresh,files):
    db.execute("create table if not exists finance_workbooks(year integer primary key,url text,checked text,success text,status text,sha text,rows text)")
    old={r[0]:r for r in db.execute("select year,url,checked,success,status,sha,rows from finance_workbooks")}
    if refresh:
        now=datetime.fromisoformat(stamp)
        candidates=[]
        for y,u in files.items():
            y=int(y);r=old.get(y)
            if not r or (now-datetime.fromisoformat(r[2]))>=timedelta(days=30 if r[2]==r[3] else 7):candidates.append((y,u))
        for y,u in sorted(candidates,key=lambda x:(x[0] in old,-x[0]))[:2]:
            r=old.get(y)
            try:
                raw=fetch(u);rows=parse(raw,y,u)
                with db:db.execute("insert or replace into finance_workbooks values(?,?,?,?,?,?,?)",(y,u,stamp,stamp,"Импортировано",hashlib.sha256(raw).hexdigest(),json.dumps(rows,ensure_ascii=False,allow_nan=False)))
            except Exception as e:
                with db:db.execute("insert or replace into finance_workbooks values(?,?,?,?,?,?,?)",(y,r[1] if r and r[3] else u,stamp,r[3] if r else None,"Ошибка: "+str(e)[:180],r[5] if r else None,r[6] if r else "[]"))
    result=[]
    for y,u,c,s,status,sha,rows in db.execute("select year,url,checked,success,status,sha,rows from finance_workbooks order by year desc"):
        result.append(dict(year=y,url=u,checked=c,success=s,status=status,sha256=sha,rows=json.loads(rows)))
    return dict(schema=1,built=stamp,years=result)
def quality(d):
    if d.get("schema")!=1:raise ValueError("schema")
    years=set();count=0
    for batch in d["years"]:
        y=batch["year"];rows=batch["rows"]
        if y in years:raise ValueError("duplicate year")
        years.add(y);keys=set()
        if rows and (not batch["success"] or not re.fullmatch(r"[a-f0-9]{64}",batch["sha256"] or "") or not valid_url(batch["url"])):raise ValueError("missing provenance")
        for r in rows:
            key=(r["code"],r["metric"])
            if key in keys or r["year"]!=y or r["source"]!=batch["url"] or r["metric"] not in ("sales","assets") or r["sign"] not in ("numeric","missing","negative_unspecified"):raise ValueError("bad row")
            keys.add(key)
            if (r["sign"]=="numeric")!=(type(r["value"]) in (float,int) and math.isfinite(r["value"])):raise ValueError("bad value")
        count+=len(rows)
    return dict(finance_workbook_years=sum(bool(x["rows"]) for x in d["years"]),finance_workbook_observations=count)
def publish(page,out,d):
    quality(d)
    (out/"finance-workbooks.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    fields=["year","title","metric","value","sign","raw","source","sheet","row","column"]
    with (out/"finance-workbooks.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction="ignore");w.writeheader()
        for b in d["years"]:w.writerows(b["rows"])
    body="<h1>Автоматический импорт рентабельности ФНС</h1><p>Отдельный набор оригинальных таблиц, не замена ручной транскрипции. Отрицательные величины без числа не преобразуются в ноль.</p><p><a href='finance.html'>Ручной документальный набор</a> · <a href='finance-workbooks.csv'>CSV</a> · <a href='finance-workbooks.json'>JSON</a></p>"
    if not d["years"]:body+="<p>Пока нет попыток импорта.</p>"
    for b in d["years"]:
        body+="<section><h2>"+str(b["year"])+"</h2><p>"+escape(b["status"])+" · наблюдений: "+str(len(b["rows"]))+" · последний успех: "+escape(str(b["success"] or "—"))+"</p>"
        if b["rows"]:
            body+="<p>SHA-256: "+escape(b["sha256"])+"</p><details><summary>Открыть исходные значения</summary><table><tr><th>Вид деятельности</th><th>Показатель</th><th>Значение, %</th><th>Ячейка</th></tr>"
            for r in b["rows"]:
                body+="<tr>"+"".join("<td>"+escape(str(v))+"</td>" for v in (r["title"],"Продажи к затратам" if r["metric"]=="sales" else "Активы",r["raw"],r["sheet"]+" / "+str(r["row"])+":"+str(r["column"])))+"</tr>"
            body+="</table></details>"
        body+="</section>"
    page("finance-workbooks.html",body)
