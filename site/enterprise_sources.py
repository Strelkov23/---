"""Official registration statistics: inspect source files, do not infer factory counts."""
import hashlib,io,json,re,zipfile
from datetime import date,timedelta
from urllib.parse import urlsplit
import historical as h
SOURCE="https://www.rosstat.gov.ru/folder/522"
KINDS={"organizations":"количество организаций по данным государственной регистрации с 2017","entrepreneurs":"количество индивидуальных предпринимателей по данным государственной регистрации с 2017"}
NOTE="Диагностика оригиналов Росстата. Регистрация не доказывает производственную деятельность. Статистические наблюдения из этих книг пока не импортируются."
def candidates(raw):
    result={k:[] for k in KINDS}
    for f in h.discover(raw,SOURCE):
        u=urlsplit(f["url"])
        if f["format"]!="xlsx" or u.hostname not in ("rosstat.gov.ru","www.rosstat.gov.ru"):continue
        for k,title in KINDS.items():
            if title in h.norm(f["title"]):result[k].append(f["url"])
    return {k:sorted(set(v)) for k,v in result.items()}
def inspect(raw):
    import openpyxl
    if not 0<len(raw)<=10_000_000:raise ValueError("Размер книги")
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        if len(z.infolist())>1000 or sum(x.file_size for x in z.infolist())>80_000_000:raise ValueError("Размер распаковки")
    b=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    try:
        result=[]
        for ws in b:
            if len(result)>=40 or not ws.max_row or not ws.max_column or ws.max_row>100000 or ws.max_column>500:raise ValueError("Размер листа")
            # Header inspection only: no organization-level values or contacts collected.
            result.append(dict(name=ws.title,rows=ws.max_row,columns=ws.max_column))
        if not result:raise ValueError("Нет листов")
        return result
    finally:b.close()
def empty(stamp):
    return dict(schema=1,built=stamp,source=SOURCE,note=NOTE,rows=[dict(kind=k,status="not_loaded",checked=None,success=None,url=None,sha256=None,sheets=[]) for k in KINDS])
def quality(d):
    if d["schema"]!=1 or d["source"]!=SOURCE or d["note"]!=NOTE or [r["kind"] for r in d["rows"]]!=list(KINDS):raise ValueError("Паспорт источников")
    for r in d["rows"]:
        if r["status"] not in ("not_loaded","unavailable","ok","cached"):raise ValueError("Статус")
        if r["sheets"]:
            if r["status"] not in ("ok","cached") or not r["success"] or not r["checked"] or not re.fullmatch("[a-f0-9]{64}",r["sha256"] or "") or not h.allowed(r["url"]) or urlsplit(r["url"]).hostname not in ("rosstat.gov.ru","www.rosstat.gov.ru"):raise ValueError("Происхождение")
            if not r["url"].lower().split("?")[0].endswith(".xlsx"):raise ValueError("Формат")
            if not 1<=len(r["sheets"])<=40 or len({x["name"] for x in r["sheets"]})!=len(r["sheets"]):raise ValueError("Листы")
            if any(not x["name"] or type(x["rows"]) is not int or type(x["columns"]) is not int or not 1<=x["rows"]<=100000 or not 1<=x["columns"]<=500 for x in r["sheets"]):raise ValueError("Размер листов")
        elif r["status"] in ("ok","cached") or any(r[x] is not None for x in ("success","url","sha256")):raise ValueError("Пустой успех")
    return {"enterprise_source_workbooks_checked":sum(bool(r["sheets"]) for r in d["rows"])}
def publish(out,previous,stamp,refresh,fetch=h.get):
    d=empty(stamp)
    try:
        old=json.loads((previous/"enterprise-sources.json").read_text(encoding="utf-8"));quality(old)
        d={**old,"built":stamp}
        for r in d["rows"]:
            if r["sheets"]:r["status"]="cached"
    except (OSError,ValueError,KeyError,TypeError):pass
    due=[r for r in d["rows"] if not r["checked"] or date.fromisoformat(stamp[:10])>=date.fromisoformat(r["checked"][:10])+timedelta(days=7 if r["checked"]==r["success"] else 2)]
    if refresh and due:
        found={};failure=None
        try:
            raw,enc=fetch(SOURCE,8_000_000);found=candidates(raw.decode(enc))
        except Exception as e:failure=str(e)[:180]
        for r in due:
            try:
                if failure:raise ValueError(failure)
                urls=found.get(r["kind"],[])
                if len(urls)!=1:raise ValueError("Ожидалась одна точная ссылка, найдено "+str(len(urls)))
                raw,_=fetch(urls[0],10_000_000);sheets=inspect(raw)
                r.update(status="ok",checked=stamp,success=stamp,url=urls[0],sha256=hashlib.sha256(raw).hexdigest(),sheets=sheets);r.pop("error",None)
            except Exception as e:r.update(status="cached" if r["sheets"] else "unavailable",checked=stamp,error=str(e)[:200])
    quality(d)
    (out/"enterprise-sources.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    return d
