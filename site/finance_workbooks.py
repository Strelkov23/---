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
    from source_transport import download
    if not valid_url(url):raise ValueError("Неподтверждённый URL")
    return download(url,hosts={"data.nalog.ru"},max_bytes=MAX,path_check=lambda p:p.lower().endswith((".xls",".xlsx"))).raw
def observation_keys(rows):
    # Normalise only the explicitly verified punctuation variant; retain exact
    # original hashes and labels in the published data.
    alias={alias:codes[0] for codes in CROSSWALK.values() for alias in codes}
    return {(alias.get(r["code"],r["code"]),r["metric"]) for r in rows if r["sign"]!="missing"}

def sync(db,stamp,refresh,files):
    db.execute("create table if not exists finance_workbooks(year integer primary key,url text,checked text,success text,status text,sha text,rows text)")
    db.execute("create table if not exists finance_workbook_attempts(year integer primary key,url text not null,checked text not null)")
    db.execute("create table if not exists finance_workbook_editions(year integer,sha text,url text,seen text,rows text,primary key(year,sha))")
    old={r[0]:r for r in db.execute("select year,url,checked,success,status,sha,rows from finance_workbooks")}
    attempts={y:(u,c) for y,u,c in db.execute("select year,url,checked from finance_workbook_attempts")}
    # Preserve already imported editions before replacing their current record.
    for y,r in old.items():
        if r[3] and r[5] and json.loads(r[6]):
            db.execute("insert or ignore into finance_workbook_editions values(?,?,?,?,?)",(y,r[5],r[1],r[3],r[6]))
    if refresh:
        now=datetime.fromisoformat(stamp)
        candidates=[]
        for y,u in files.items():
            y=int(y);r=old.get(y);previous_attempt=attempts.get(y,(r[1],r[2]) if r else (None,None))
            changed=u!=previous_attempt[0]
            if not r or changed or (now-datetime.fromisoformat(r[2]))>=timedelta(days=30 if r[2]==r[3] else 7):
                candidates.append((not changed and r is not None,r is not None,r[2] if r else "",-y,y,u))
        for _,__,___,____,y,u in sorted(candidates)[:2]:
            r=old.get(y)
            db.execute("insert or replace into finance_workbook_attempts values(?,?,?)",(y,u,stamp))
            try:
                raw=fetch(u);rows=parse(raw,y,u)
                if r and r[3]:
                    missing=observation_keys(json.loads(r[6]))-observation_keys(rows)
                    if missing:raise ValueError("Новая редакция потеряла ранее доступные позиции: "+str(len(missing)))
                sha=hashlib.sha256(raw).hexdigest()
                payload=json.dumps(rows,ensure_ascii=False,allow_nan=False)
                with db:
                    db.execute("insert or ignore into finance_workbook_editions values(?,?,?,?,?)",(y,sha,u,stamp,payload))
                    db.execute("insert or replace into finance_workbooks values(?,?,?,?,?,?,?)",(y,u,stamp,stamp,"Импортировано",sha,payload))
            except Exception as e:
                with db:db.execute("insert or replace into finance_workbooks values(?,?,?,?,?,?,?)",(y,r[1] if r and r[3] else u,stamp,r[3] if r else None,"Ошибка: "+str(e)[:240],r[5] if r else None,r[6] if r else "[]"))
    result=[]
    for y,u,c,s,status,sha,rows in db.execute("select year,url,checked,success,status,sha,rows from finance_workbooks order by year desc"):
        attempt=db.execute("select url,checked from finance_workbook_attempts where year=?",(y,)).fetchone()
        editions=db.execute("select count(*) from finance_workbook_editions where year=?",(y,)).fetchone()[0]
        result.append(dict(year=y,url=u,checked=c,success=s,status=status,sha256=sha,rows=json.loads(rows),attempt_url=attempt[0] if attempt else u,editions=editions))
    return dict(schema=1,built=stamp,years=result)
# Explicit crosswalk of the abbreviated 2023–2025 documentary labels to
# hashes of full official labels observed in the imported workbooks.
# Never use row position, numeric similarity or fuzzy matching.
CROSSWALK={
    "10":("654ca1eb343388c4",),
    "11":("6f69094bddea7dcd",),
    "12":("3d49347f7ede97b8",),
    "13":("36de537a907a9225",),
    "14":("4d28c294418d8c9e",),
    "15":("a204876f568ba574",),
    "16":("2d5fd63310cf26e3",),
    "17":("8de5a8114eec26a8",),
    "18":("8629b90c51341e99",),
    "19":("847a43d15723754a",),
    "20":("439247f1f8893b2e",),
    "21":("67185cd58dc7a403",),
    "22":("1c239f7403fdfd96",),
    "23":("cd2c3aba6277ae33",),
    "24":("ddd34d6f1164a3ed",),
    "25":("09d37cedfdc58042",),
    "26":("06bc3feddc2dc414",),
    "27":("5231922f436e5d67","34ddd4d772366280",),
    "28":("bbbe4fe018f98a46",),
    "29":("896106f6628d36ca",),
    "30":("111b517e966f4215",),
    "32":("81d7edc2bdd3284e",),
    "45":("4b44faec4a42cbac",),
    "46":("474c0970c686f11b",),
    "47":("6a12908f5635aa52",),
    "50":("e69001f696542e17",),
    "51":("10b18269000bbfa0",),
    "53":("41620a874fa9df67",),
    "72":("bc66f9b9fbab711f",),
    "total":("4c42b211a12403e1",),
    "A":("b06df494625be9c1",),
    "01":("6cd8295f90bf9181",),
    "02":("7d7f6b960c8672fd",),
    "03":("e3187cba52b4cbb3",),
    "B":("09cede93af666133",),
    "05":("5a5f98e1b250f78a",),
    "06":("b97e15642fb76875",),
    "07":("4689d0c4bbbc8b4e",),
    "08":("1346ba14a6f4c765",),
    "C":("19f8d2b402f914dc",),
    "D":("e63eda46063bf9a4",),
    "35.1":("3d570164ca083896",),
    "35.2":("bb4263f8831c90f3",),
    "35.3":("1f759c8e323a7ed6",),
    "E":("e7352bf95abc0ded",),
    "F":("5dcc6e1eb6d99b59",),
    "G":("057fc5f0fbc10fb6",),
    "I":("c769a515a6a0d22c",),
    "H":("9b36d778447584e5",),
    "49.1":("bc3dc919b2c65560",),
    "49.2":("6a3665a0b658d948",),
    "49.3":("51cfa901e9372ab2",),
    "49.4":("f82bf503eb60567e",),
    "49.5":("7d30db98c4f2c60a",),
    "J":("2b628520153643e2",),
    "K":("fe67e0bb5d636a79",),
    "L":("5781f6f47dd2f8e1",),
    "O":("ea0224006880388a",),
    "P":("830ae51a4798c2ce",),
    "Q":("f45caf52e3d7d808",),
    "R":("df027b9d1c86bf8c",),
}
RECONCILIATION_LABELS={"exact_numeric":"Числовое совпадение","same_sign":"Совпадает отрицательный знак (числа нет)","different":"Расхождение","missing":"Нет сопоставимых данных","ambiguous":"Неоднозначное соответствие"}
def reconcile(manual,workbooks):
    from collections import Counter,defaultdict
    official=defaultdict(list)
    for batch in workbooks:
        for r in batch["rows"]:official[(r["year"],r["code"],r["metric"])].append(r)
    rows=[]
    for x in manual:
        candidates=[r for code in CROSSWALK.get(x["code"],()) for r in official.get((x["year"],code,x["metric"]),[])]
        y=candidates[0] if len(candidates)==1 else None
        state="ambiguous" if len(candidates)>1 else "missing"
        if y is not None:
            if x["sign"]==y["sign"]=="numeric":
                state="exact_numeric" if x["value"]==y["value"] else "different"
            elif x["sign"]==y["sign"]=="negative_unspecified":
                state="same_sign"
            elif "missing" not in (x["sign"],y["sign"]):
                number=x["value"] if x["sign"]=="numeric" else y["value"]
                state="missing" if number is not None and number<0 else "different"
        rows.append(dict(year=x["year"],code=x["code"],metric=x["metric"],manual_title=x["title"],official_title=y["title"] if y else None,manual_value=x["value"],official_value=y["value"] if y else None,manual_sign=x["sign"],official_sign=y["sign"] if y else None,state=state,manual_source=x.get("replica") or x.get("source"),official_source=y["source"] if y else None,official_sheet=y["sheet"] if y else None,official_row=y["row"] if y else None,official_column=y["column"] if y else None))
    return dict(method="Точное соответствие по проверенному словарю полных наименований, год и показатель. Числовые значения сравниваются без допуска; отр сравнивается отдельно. Не независимый аудит.",rows=rows,counts=dict(Counter(r["state"] for r in rows)))
def quality(d,out=None):
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
    counts=dict(finance_workbook_years=sum(bool(x["rows"]) for x in d["years"]),finance_workbook_observations=count)
    if "reconciliation" in d:
        import finance_data
        expected=reconcile(finance_data.records(),d["years"])
        if d["reconciliation"]!=expected:raise ValueError("Сверка рентабельности не воспроизводится")
        counts.update({"finance_reconciliation_"+k:v for k,v in expected["counts"].items()})
        if out is not None:
            fields=["year","code","metric","manual_title","official_title","manual_value","official_value","manual_sign","official_sign","state","manual_source","official_source","official_sheet","official_row","official_column"]
            with (out/"finance-reconciliation.csv").open(encoding="utf-8-sig",newline="") as f:
                reader=csv.DictReader(f)
                if reader.fieldnames!=fields:raise ValueError("Заголовок CSV сверки не совпадает")
                actual=list(reader)
            wanted=[{k:"" if r[k] is None else str(r[k]) for k in fields} for r in expected["rows"]]
            if actual!=wanted:raise ValueError("CSV сверки не воспроизводится")
    return counts
def publish(page,out,d):
    import finance_data
    d=dict(d,reconciliation=reconcile(finance_data.records(),d["years"]))
    quality(d)
    (out/"finance-workbooks.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    fields=["year","title","metric","value","sign","raw","source","sheet","row","column"]
    with (out/"finance-workbooks.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction="ignore");w.writeheader()
        for b in d["years"]:w.writerows(b["rows"])
    body="<h1>Автоматический импорт рентабельности ФНС</h1><p>Отдельный набор оригинальных таблиц, не замена ручной транскрипции. Отрицательные величины без числа не преобразуются в ноль.</p><p><a href='finance.html'>Ручной документальный набор</a> · <a href='finance-workbooks.csv'>CSV</a> · <a href='finance-workbooks.json'>JSON</a></p>"
    reconciliation=d["reconciliation"]
    fields=["year","code","metric","manual_title","official_title","manual_value","official_value","manual_sign","official_sign","state","manual_source","official_source","official_sheet","official_row","official_column"]
    with (out/"finance-reconciliation.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(reconciliation["rows"])
    body+="<section><h2>Сверка с документальным набором 2023–2025</h2><p>"+escape(reconciliation["method"])+"</p><p><a href='finance-reconciliation.csv'>Скачать полный протокол сверки CSV</a></p><ul>"
    for k,title in RECONCILIATION_LABELS.items():
        body+="<li>"+escape(title)+": "+str(reconciliation["counts"].get(k,0))+"</li>"
    body+="</ul>"
    issues=[r for r in reconciliation["rows"] if r["state"] not in ("exact_numeric","same_sign")]
    if issues:
        body+="<details><summary>Несовпадения и пробелы (до 30 строк)</summary><div class='table-scroll'><table><tr><th>Год</th><th>Вид деятельности</th><th>Показатель</th><th>Ручное значение</th><th>Оригинал</th><th>Состояние</th></tr>"
        for x in issues[:30]:
            def displayed(v,sign):return "отр" if sign=="negative_unspecified" else "—" if v is None else str(v)
            body+="<tr>"+"".join("<td>"+escape(str(v))+"</td>" for v in (x["year"],x["manual_title"],"Продажи" if x["metric"]=="sales" else "Активы",displayed(x["manual_value"],x["manual_sign"]),displayed(x["official_value"],x["official_sign"]),RECONCILIATION_LABELS[x["state"]]))+"</tr>"
        body+="</table></div></details>"
    body+="</section>"
    if not d["years"]:body+="<p>Пока нет попыток импорта.</p>"
    for b in d["years"]:
        body+="<section><h2>"+str(b["year"])+"</h2><p>"+escape(b["status"])+" · наблюдений: "+str(len(b["rows"]))+" · последний успех: "+escape(str(b["success"] or "—"))+"</p>"
        if b.get("attempt_url") and b["attempt_url"]!=b["url"]:
            body+="<p>Последняя попытка: "+escape(b["attempt_url"])+" · отображается предыдущая успешная редакция.</p>"
        if b["rows"]:
            body+="<p>Сохранённых редакций: "+str(b.get("editions",1))+"</p>"
            body+="<p>SHA-256: "+escape(b["sha256"])+"</p><details><summary>Открыть исходные значения</summary><table><tr><th>Вид деятельности</th><th>Показатель</th><th>Значение, %</th><th>Ячейка</th></tr>"
            for r in b["rows"]:
                body+="<tr>"+"".join("<td>"+escape(str(v))+"</td>" for v in (r["title"],"Продажи к затратам" if r["metric"]=="sales" else "Активы",r["raw"],r["sheet"]+" / "+str(r["row"])+":"+str(r["column"])))+"</tr>"
            body+="</table></details>"
        body+="</section>"
    page("finance-workbooks.html",body)
