"""Official registration statistics: inspect source files, do not infer factory counts."""
import hashlib,io,json,re,zipfile
from datetime import date,timedelta
from urllib.parse import urlsplit
import historical as h
SOURCE="https://www.rosstat.gov.ru/folder/522"
CATALOGS=(SOURCE,"https://rosstat.gov.ru/folder/522","https://www.rosstat.gov.ru/folder/522?print=1")
EMISS={"organizations":"58109","entrepreneurs":"58115"}
PARSER_REVISION=2
KINDS={"organizations":"количество организаций по данным государственной регистрации с 2017","entrepreneurs":"количество индивидуальных предпринимателей по данным государственной регистрации с 2017"}
NOTE="Диагностика оригиналов Росстата. Регистрация не доказывает производственную деятельность. Статистические наблюдения из этих книг пока не импортируются."
def candidates(raw,base=SOURCE):
    result={k:[] for k in KINDS}
    for f in h.discover(raw,base):
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
def discover_catalogs(fetch):
    found={k:[] for k in KINDS};attempts=[]
    for url in CATALOGS:
        try:
            raw,enc=fetch(url,8_000_000)
            discovered=candidates(raw.decode(enc),url)
            attempts.append(dict(url=url,status="ok",counts={k:len(v) for k,v in discovered.items()}))
            for k,values in discovered.items():
                for v in values:
                    u=urlsplit(v)
                    if not any((urlsplit(old).path,urlsplit(old).query)==(u.path,u.query) for old in found[k]):found[k].append(v)
            if all(len(v)==1 for v in found.values()):break
        except Exception as e:attempts.append(dict(url=url,status="unavailable",error=str(e)[:160]))
    return found,attempts

def empty(stamp):
    return dict(schema=1,parser_revision=PARSER_REVISION,built=stamp,source=SOURCE,note=NOTE,catalog_attempts=[],rows=[dict(kind=k,status="not_loaded",checked=None,success=None,url=None,sha256=None,sheets=[]) for k in KINDS])
def quality(d):
    if d["schema"]!=1 or d["source"]!=SOURCE or d["note"]!=NOTE or [r["kind"] for r in d["rows"]]!=list(KINDS):raise ValueError("Паспорт источников")
    for attempt in d.get("catalog_attempts",[]):
        if attempt["url"] not in CATALOGS or attempt["status"] not in ("ok","unavailable"):raise ValueError("Протокол каталога")
        if attempt["status"]=="ok" and (set(attempt["counts"])!=set(KINDS) or any(type(v) is not int or v<0 for v in attempt["counts"].values())):raise ValueError("Количество ссылок")
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
    d=empty(stamp);changed=False
    try:
        old=json.loads((previous/"enterprise-sources.json").read_text(encoding="utf-8"));quality(old)
        d={**old,"built":stamp,"parser_revision":PARSER_REVISION,"catalog_attempts":old.get("catalog_attempts",[])}
        changed=old.get("parser_revision")!=PARSER_REVISION
        for r in d["rows"]:
            if r["sheets"]:r["status"]="cached"
    except (OSError,ValueError,KeyError,TypeError):pass
    due=[r for r in d["rows"] if changed or not r["checked"] or date.fromisoformat(stamp[:10])>=date.fromisoformat(r["checked"][:10])+timedelta(days=7 if r["checked"]==r["success"] else 2)]
    if refresh and due:
        found,attempts=discover_catalogs(fetch);d["catalog_attempts"]=attempts
        for r in due:
            try:
                if not any(a["status"]=="ok" for a in attempts):raise ValueError("; ".join(a.get("error","") for a in attempts)[:180])
                urls=found.get(r["kind"],[])
                if len(urls)!=1:raise ValueError("Ожидалась одна точная ссылка, найдено "+str(len(urls)))
                raw,_=fetch(urls[0],10_000_000);sheets=inspect(raw)
                r.update(status="ok",checked=stamp,success=stamp,url=urls[0],sha256=hashlib.sha256(raw).hexdigest(),sheets=sheets);r.pop("error",None)
            except Exception as e:r.update(status="cached" if r["sheets"] else "unavailable",checked=stamp,error=str(e)[:200])
    quality(d)
    (out/"enterprise-sources.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    return d
