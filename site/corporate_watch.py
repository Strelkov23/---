"""Bounded HTTP metadata monitoring of known corporate documents; no automatic financial extraction."""
import hashlib,json,re
from datetime import datetime,timedelta,timezone
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.parse import urlsplit
from concurrent.futures import ThreadPoolExecutor
import group_passports as gp

FILE="corporate-watch.json"
NOTE="Контроль HTTP-метаданных известных ссылок, не сверка содержимого отчёта и не поиск новых выпусков. Сигнал изменения требует документальной проверки."
LIMIT=6
FIELDS=("etag","last_modified","length")
def time(v):
    d=datetime.fromisoformat(v.replace("Z","+00:00"))
    if d.tzinfo is None:raise ValueError("Timestamp without timezone")
    return d.astimezone(timezone.utc)
def url_ok(url):
    u=urlsplit(url)
    return u.scheme=="https" and u.hostname in gp.HOSTS and u.port in (None,443) and not u.username and not u.password and not u.fragment
class Redirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if not url_ok(newurl) or urlsplit(newurl).hostname!=urlsplit(req.full_url).hostname:raise ValueError("Перенаправление вне исходного хоста")
        return Request(newurl,headers=dict(req.header_items()),method="HEAD")
def metadata(headers):
    result={}
    for field,header in (("etag","ETag"),("last_modified","Last-Modified"),("length","Content-Length")):
        value=headers.get(header)
        if isinstance(value,str) and 0<len(value)<=512 and not re.search(r"[\x00-\x1f\x7f]",value):
            if field!="length" or re.fullmatch(r"\d{1,18}",value):result[field]=value
    return result
def fetch(url):
    if not url_ok(url):raise ValueError("URL вне разрешённого списка")
    req=Request(url,method="HEAD",headers={"User-Agent":"EconomicMonitor/1.0","Accept-Encoding":"identity"})
    with build_opener(Redirect()).open(req,timeout=8) as r:
        if not url_ok(r.geturl()) or urlsplit(r.geturl()).hostname!=urlsplit(url).hostname:raise ValueError("Другой хост")
        if not 200<=r.status<300:raise ValueError("HTTP "+str(r.status))
        return metadata(r.headers)
def digest(v):
    return hashlib.sha256(json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(",",":")).encode()).hexdigest()
def inventory(data):
    result={}
    for g in data["groups"]:
        urls={g["source"],*(m["source"] for m in g["metrics"] if m.get("source"))}
        for url in sorted(urls):
            if not url_ok(url):raise ValueError("Недопустимый URL документа")
            result[g["id"]+"-"+hashlib.sha256(url.encode()).hexdigest()[:16]]=dict(group=g["id"],name=g["name"],url=url,revision=digest(g))
    return result
def valid_meta(d):
    return isinstance(d,dict) and set(d)<=set(FIELDS) and all(isinstance(v,str) and 0<len(v)<=512 and not re.search(r"[\x00-\x1f\x7f]",v) and (k!="length" or re.fullmatch(r"\d{1,18}",v)) for k,v in d.items())
def quality(d,data):
    expected=inventory(data)
    if d.get("schema")!=1 or d.get("note")!=NOTE or not isinstance(d.get("rows"),dict) or set(d["rows"])!=set(expected):raise ValueError("Паспорт мониторинга")
    if d.get("last_batch"):time(d["last_batch"])
    for key,r in d["rows"].items():
        if any(r.get(k)!=v for k,v in expected[key].items()):raise ValueError("Редакция источника")
        if r.get("status") not in ("waiting","baseline","unchanged","changed","no_metadata","unavailable") or type(r.get("changed")) is not bool:raise ValueError("Статус")
        if not valid_meta(r["baseline"]) or not valid_meta(r["latest"]):raise ValueError("HTTP метаданные")
        checked=time(r["checked"]) if r.get("checked") else None
        success=time(r["success"]) if r.get("success") else None
        if success and (not checked or success>checked):raise ValueError("Дата успеха")
        if r["status"]=="waiting" and (checked or success or r["baseline"] or r["latest"] or r["changed"]):raise ValueError("Непроверенный источник")
        if r["status"] in ("baseline","unchanged","changed","no_metadata") and (not checked or checked!=success or r.get("error")):raise ValueError("Успех проверки")
        if r["status"]=="unavailable" and (not checked or not r.get("error")):raise ValueError("Ошибка проверки")
        if r["changed"] and not r["baseline"]:raise ValueError("Сигнал без базы")
        if r["status"]=="changed" and not r["changed"]:raise ValueError("Сигнал")
    return dict(corporate_watch_sources=len(expected),corporate_watch_checked=sum(bool(r["checked"]) for r in d["rows"].values()),corporate_watch_changed=sum(r["changed"] for r in d["rows"].values()),corporate_watch_unavailable=sum(r["status"]=="unavailable" for r in d["rows"].values()))
def one(row,stamp,fetcher):
    r=dict(row,checked=stamp,error=None)
    try:
        current=fetcher(r["url"])
        if not valid_meta(current):raise ValueError("Некорректные метаданные")
        r.update(success=stamp,latest=current)
        if not current:r["status"]="no_metadata";return r
        base=r["baseline"]
        if not base:r.update(baseline=current,status="baseline");return r
        common=set(base)&set(current)
        if any(base[k]!=current[k] for k in common):r["changed"]=True
        r["status"]="changed" if r["changed"] else "unchanged" if common else "no_metadata"
    except Exception as e:r.update(status="unavailable",error=(str(e) or type(e).__name__)[:180])
    return r
def publish(out,previous,stamp,refresh,fetcher=fetch):
    data=json.loads((out/gp.FILE).read_text(encoding="utf-8"));gp.quality(data)
    rows={k:dict(v,status="waiting",checked=None,success=None,baseline={},latest={},changed=False,error=None) for k,v in inventory(data).items()}
    last=None
    try:
        old=json.loads((previous/FILE).read_text(encoding="utf-8"))
        old_data=json.loads((previous/gp.FILE).read_text(encoding="utf-8"))
        quality(old,old_data);last=old.get("last_batch")
        for k,r in rows.items():
            p=old["rows"].get(k)
            if p and all(p.get(field)==r[field] for field in ("group","name","url","revision")):rows[k]=p
    except (OSError,ValueError,KeyError,TypeError,AttributeError):pass
    now=time(stamp)
    if refresh and (not last or time(last).date()<now.date()):
        due=[k for k,r in rows.items() if not r["checked"] or now>=time(r["checked"])+timedelta(days=2 if r["status"]=="unavailable" else 7)]
        due.sort(key=lambda k:(rows[k]["checked"] or "",k))
        todo=due[:LIMIT]
        if todo:
            with ThreadPoolExecutor(max_workers=3) as pool:
                for k,r in zip(todo,pool.map(lambda k:one(rows[k],stamp,fetcher),todo)):rows[k]=r
            last=stamp
    d=dict(schema=1,note=NOTE,last_batch=last,rows=rows)
    quality(d,data);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    return d
