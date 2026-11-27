"""Monitor exact, already catalogued corporate HTML sources.
One source per refresh; no link traversal, extraction of figures or overwriting
of verified observations. Text differences are candidates for review only.
"""
import json,re,hashlib
from datetime import datetime,timedelta
from html.parser import HTMLParser
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser
from urllib.error import HTTPError
from source_transport import download
import provenance
FILE="economic-corporate-monitor.json"
SPECS={
 "rosatom-2025":("Росатом — ключевые результаты 2025","https://report.rosatom.ru/1684.html"),
 "novatek-2025":("НОВАТЭК — производственные результаты 2025","https://www.novatek.ru/ru/press/releases/archive/index.php?id_4=7511"),
 "novatek-2023":("НОВАТЭК — архивный производственный пресс-релиз","https://www.novatek.ru/ru/press/releases/photo.php?from_4=4&id_4=6252&newsFilterFormMode_4=all")
}
NOTE="Контроль известных HTML-документов, не поиск новых отчётов. Первый хеш — техническая база, не сверка показателей. Изменение текста может быть связано с оформлением или меню; требует повторной проверки. Подтверждённая статистика не меняется автоматически."
class Blocked(Exception):pass
def clock(s):
    t=datetime.fromisoformat(s)
    if t.tzinfo is None:raise ValueError("Missing timezone")
    return t
def sha(raw):return hashlib.sha256(raw).hexdigest()
class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.parts=[];self.skip=[]
    def handle_starttag(self,tag,attrs):
        if tag in ("script","style","noscript","template"):self.skip.append(tag)
        elif not self.skip:self.parts.append(" ")
    def handle_endtag(self,tag):
        if self.skip and self.skip[-1]==tag:self.skip.pop()
        elif not self.skip:self.parts.append(" ")
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)
def fingerprints(raw,charset):
    if not isinstance(raw,bytes) or not 0<len(raw)<=2_000_000:raise ValueError("Invalid response size")
    p=Text();p.feed(raw.decode(charset,errors="strict"));p.close()
    text=" ".join("".join(p.parts).split())
    if len(text)<100:raise ValueError("Insufficient visible text")
    return sha(raw),sha(text.encode("utf-8")),len(text)
def fetch_html(url):
    u=urlsplit(url);host=u.hostname;robots="https://"+host+"/robots.txt"
    try:
        p=download(robots,hosts=(host,),path_check=lambda p:p=="/robots.txt",max_bytes=200_000,timeout=10)
        rp=RobotFileParser();rp.parse(p.raw.decode(p.charset,errors="strict").splitlines())
        if not rp.can_fetch("EconomicsMonitor",url):raise Blocked("robots.txt disallows URL")
        # No delay is bypassed: defer when any explicit request rate/delay applies.
        if rp.crawl_delay("EconomicsMonitor") or rp.request_rate("EconomicsMonitor"):raise Blocked("robots.txt rate policy requires separate scheduler")
    except HTTPError as e:
        if e.code!=404:raise
    p=download(url,hosts=(host,),path_check=lambda path:path==u.path,max_bytes=2_000_000,timeout=20)
    if p.final_url!=url or p.media_type not in ("text/html","application/xhtml+xml"):raise ValueError("Unexpected final URL or type")
    return p
def fetch(url):
    p=fetch_html(url)
    return fingerprints(p.raw,p.charset)
def blank():
    return dict(schema=1,built=None,note=NOTE,rows={k:dict(title=t,url=u,checked=None,success=None,status="waiting",raw_sha=None,text_sha=None,text_chars=None,first_text_sha=None,changed_at=None,review=False,changes=0,error=None) for k,(t,u) in SPECS.items()})
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE or set(d["rows"])!=set(SPECS):raise ValueError("Invalid monitor")
    for k,r in d["rows"].items():
        if (r["title"],r["url"])!=SPECS[k] or r["status"] not in ("waiting","baseline","unchanged","markup_only","changed","blocked","error"):raise ValueError("Invalid record")
        if type(r["review"]) is not bool or type(r["changes"]) is not int or r["changes"]<0 or r["review"]!=(r["changes"]>0):raise ValueError("Invalid review state")
        for f in ("checked","success","changed_at"):
            if r[f] is not None:clock(r[f])
        for f in ("raw_sha","text_sha","first_text_sha"):
            if r[f] is not None and not re.fullmatch(r"[a-f0-9]{64}",r[f]):raise ValueError("Invalid fingerprint")
        if r["success"] is not None and (not all(r[f] for f in ("raw_sha","text_sha","first_text_sha")) or type(r["text_chars"]) is not int or r["text_chars"]<100):raise ValueError("Invalid success")
    return True
def advance(d,stamp,refresh,loader=fetch):
    validate(d);now=clock(stamp);d["built"]=stamp
    if not refresh:return d
    due=[(k,r) for k,r in d["rows"].items() if r["checked"] is None or now-clock(r["checked"])>=timedelta(days=14)]
    if not due:return d
    k,r=min(due,key=lambda x:(x[1]["checked"] or "",x[0]))
    r["checked"]=stamp
    try:
        raw,text,n=loader(r["url"])
        if not all(isinstance(v,str) and re.fullmatch(r"[a-f0-9]{64}",v) for v in (raw,text)) or type(n) is not int or n<100:raise ValueError("Invalid loader result")
        if r["text_sha"] is None:
            r["first_text_sha"]=text;status="baseline"
        elif text!=r["text_sha"]:
            status="changed";r["changes"]+=1;r["review"]=True;r["changed_at"]=stamp
        else:status="markup_only" if raw!=r["raw_sha"] else "unchanged"
        r.update(raw_sha=raw,text_sha=text,text_chars=n,success=stamp,status=status,error=None)
    except Exception as e:
        r.update(status="blocked" if isinstance(e,Blocked) else "error",error=type(e).__name__)
    validate(d);return d
def publish(out,previous,stamp,refresh):
    d=blank();p=previous/FILE
    if p.exists():
        manifest=json.loads((previous/"data-manifest.json").read_text(encoding="utf-8"))
        if provenance.file_info(p)!=manifest["files"].get(FILE):raise ValueError("Corporate monitor checksum mismatch")
        d=json.loads(p.read_text(encoding="utf-8"))
    d=advance(d,stamp,refresh)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
