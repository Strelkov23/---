"""Discover candidate corporate reports from a small allowlist of official investor pages."""
import json,re
from html.parser import HTMLParser
from urllib.parse import urlsplit,urljoin,urldefrag,unquote,parse_qs
from urllib.request import Request,build_opener,HTTPRedirectHandler
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
import corporate_watch as watch

FILE="corporate-discovery.json"
NOTE="Кандидаты документов из HTML официальных страниц; не проверенные финансовые наблюдения. Дата обнаружения не дата публикации. Динамические ссылки могут отсутствовать."
CATALOGS={"x5":"https://www.x5.ru/ru/investors/investors-calendar/","yandex":"https://ir.yandex.ru/financial-releases","ozon":"https://ir.ozon.com/"}
MAX_HTML=4*1024*1024
MAX_LINKS=100
def allowed(group,url):
    try:
        u=urlsplit(url)
        if u.scheme!="https" or u.hostname!=urlsplit(CATALOGS[group]).hostname or u.username or u.password or u.port not in (None,443) or u.fragment or len(url)>1500:return False
        return True
    except (ValueError,KeyError):return False
class Redirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        u=urlsplit(newurl)
        if u.hostname!=urlsplit(req.full_url).hostname or u.scheme!="https" or u.username or u.password or u.port not in (None,443):raise ValueError("Другой хост")
        return super().redirect_request(req,fp,code,msg,headers,newurl)
class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.links=[];self.current=None
    def handle_starttag(self,tag,attrs):
        if tag=="a":
            self.current=[dict(attrs).get("href") or "",[]]
    def handle_data(self,data):
        if self.current is not None:self.current[1].append(data)
    def handle_endtag(self,tag):
        if tag=="a" and self.current is not None:
            href,parts=self.current;self.links.append((href," ".join(" ".join(parts).split())));self.current=None
def candidate(group,url,title):
    if not allowed(group,url):return False
    u=urlsplit(url);path=unquote(u.path).lower();text=(title+" "+path).lower().replace("ё","е")
    if group=="x5":return path.endswith(".pdf") and bool(re.search(r"финансов|операционн|отчетност|financial|results|ifrs|мсфо",text))
    if group=="yandex":
        q=parse_qs(u.query)
        return path.rstrip("/")=="/financial-releases" and bool(re.fullmatch(r"q[1-4]",q.get("report",[""])[0])) and bool(re.fullmatch(r"20\d{2}",q.get("year",[""])[0]))
    if group=="ozon":return path.startswith("/ru/sth/") and bool(re.search(r"финансов|отчетност|financial|finansov|results",text)) and not re.search(r"ozon-kapital|озон капитал|ozon capital",text)
    return False
def parse(group,html):
    p=Links();p.feed(html);rows={}
    for href,title in p.links:
        if not href:continue
        url=urldefrag(urljoin(CATALOGS[group],href))[0]
        if candidate(group,url,title):
            rows[url]=dict(url=url,title=(title or urlsplit(url).path.rsplit("/",1)[-1])[:300])
    if not rows:raise ValueError("Нет распознанных ссылок; возможна динамическая страница")
    if len(rows)>MAX_LINKS:raise ValueError("Слишком много ссылок")
    return [rows[k] for k in sorted(rows)]
def fetch(group):
    url=CATALOGS[group]
    req=Request(url,headers={"User-Agent":"EconomicMonitor/1.0","Accept-Encoding":"identity"})
    with build_opener(Redirect()).open(req,timeout=10) as r:
        if not allowed(group,r.geturl()) or r.headers.get_content_type()!="text/html":raise ValueError("Не HTML каталога")
        raw=r.read(MAX_HTML+1)
        if not 0<len(raw)<=MAX_HTML:raise ValueError("Размер HTML")
        return parse(group,raw.decode(r.headers.get_content_charset() or "utf-8",errors="strict"))
def blank(group):
    return dict(url=CATALOGS[group],checked=None,success=None,status="waiting",error=None,candidates=[])
def quality(d,data):
    groups={g["id"] for g in data["groups"]}
    if d.get("schema")!=1 or d.get("note")!=NOTE or set(d["rows"])!=set(CATALOGS) or not set(CATALOGS)<=groups:raise ValueError("Паспорт каталога")
    for group,r in d["rows"].items():
        if r["url"]!=CATALOGS[group] or r["status"] not in ("waiting","ok","unavailable"):raise ValueError("Источник каталога")
        checked=watch.time(r["checked"]) if r["checked"] else None
        success=watch.time(r["success"]) if r["success"] else None
        if success and (not checked or success>checked):raise ValueError("Даты каталога")
        if r["status"]=="ok" and (not success or success!=checked or r["error"] or not r["candidates"]):raise ValueError("Успех каталога")
        if r["status"]=="unavailable" and (not checked or not r["error"]):raise ValueError("Ошибка каталога")
        if r["status"]=="waiting" and (checked or success or r["error"] or r["candidates"]):raise ValueError("Непроверенный каталог")
        rows=r["candidates"]
        if len(rows)>MAX_LINKS or len({x["url"] for x in rows})!=len(rows) or bool(rows)!=bool(success):raise ValueError("Охват кандидатов")
        for x in rows:
            if not candidate(group,x["url"],x["title"]) or not 0<len(x["title"])<=300 or watch.time(x["first_seen"])>watch.time(x["last_seen"]) or watch.time(x["last_seen"])>success:raise ValueError("Кандидат")
    return dict(corporate_discovery_catalogs=len(CATALOGS),corporate_discovery_success=sum(bool(r["success"]) for r in d["rows"].values()),corporate_discovery_candidates=sum(len(r["candidates"]) for r in d["rows"].values()))
def one(group,row,stamp,fetcher):
    r=dict(row,checked=stamp)
    try:
        links=fetcher(group)
        if not links or len(links)>MAX_LINKS or len({x["url"] for x in links})!=len(links) or any(not candidate(group,x["url"],x["title"]) for x in links):raise ValueError("Некорректные кандидаты")
        old={x["url"]:x for x in row["candidates"]}
        r.update(status="ok",success=stamp,error=None,candidates=[dict(x,first_seen=old.get(x["url"],{}).get("first_seen",stamp),last_seen=stamp) for x in links])
    except Exception as e:r.update(status="unavailable",error=(str(e) or type(e).__name__)[:180])
    return r
def publish(out,previous,stamp,refresh,fetcher=fetch):
    data=json.loads((out/"group-passports.json").read_text(encoding="utf-8"))
    d=dict(schema=1,note=NOTE,rows={k:blank(k) for k in CATALOGS})
    try:
        old=json.loads((previous/FILE).read_text(encoding="utf-8"));quality(old,data);d=old
    except (OSError,ValueError,KeyError,TypeError,AttributeError):pass
    now=watch.time(stamp)
    if refresh:
        todo=[k for k,r in d["rows"].items() if not r["checked"] or now>=watch.time(r["checked"])+timedelta(days=2 if r["status"]=="unavailable" else 7)]
        with ThreadPoolExecutor(max_workers=3) as pool:
            for k,r in zip(todo,pool.map(lambda k:one(k,d["rows"][k],stamp,fetcher),todo)):d["rows"][k]=r
    quality(d,data);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    return d
