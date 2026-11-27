"""Limited link crawler for a reviewed economics catalogue; metadata only."""
import json,re,time
from datetime import datetime,timedelta
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit
from urllib.robotparser import RobotFileParser
from urllib.error import HTTPError
import provenance
from source_transport import download
FILE="economic-web-crawl.json"
HOST="www.federalreserve.gov"
SEED="https://"+HOST+"/econres/feds/"
ROBOTS="https://"+HOST+"/robots.txt"
NOTE="Ссылки и заголовки рабочих исследований FEDS. Не полный текст, не подтверждение результатов исследований. Дата обнаружения не является датой публикации."
MAX=1500
def stamp(s):
    d=datetime.fromisoformat(s)
    if d.tzinfo is None:raise ValueError("Timezone required")
    return d
def paper_url(href):
    try:
        u=urlsplit(urljoin(SEED,href))
        if u.scheme!="https" or u.netloc!=HOST or u.query or not re.fullmatch(r"/econres/feds/[a-z0-9][a-z0-9-]+\.htm",u.path):return None
        if re.fullmatch(r"/econres/feds/(?:index|[0-9]{4})\.htm",u.path):return None
        return "https://"+HOST+u.path
    except (ValueError,TypeError):return None
class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.heading=0;self.active=None;self.parts=[];self.rows={}
    def handle_starttag(self,tag,attrs):
        if tag in ("h2","h3","h4","h5","h6"):self.heading+=1
        if tag=="a" and self.heading:
            self.active=paper_url(dict(attrs).get("href",""));self.parts=[]
    def handle_data(self,data):
        if self.active:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag=="a" and self.active:
            title=" ".join(" ".join(self.parts).split())
            if len(title)>=8:self.rows[self.active]=title[:350]
            self.active=None;self.parts=[]
        if tag in ("h2","h3","h4","h5","h6"):self.heading=max(0,self.heading-1)
def parse(html):
    p=Links();p.feed(html);p.close()
    if not p.rows:raise ValueError("No matching research links")
    return p.rows
def fetch(url):
    return download(url,hosts=(HOST,),path_check=lambda p:p in ("/robots.txt","/econres/feds/","/econres/feds/index.htm"),max_bytes=4000000,timeout=20)
def allowed(raw):
    r=RobotFileParser();r.set_url(ROBOTS);r.parse(raw.splitlines())
    agent="EconomicsMonitor"
    if not r.can_fetch(agent,SEED) or not r.can_fetch(agent,SEED+"index.htm"):return None
    delay=r.crawl_delay(agent) or r.crawl_delay("*") or 0
    rate=r.request_rate(agent) or r.request_rate("*")
    if rate:delay=max(delay,rate.seconds/rate.requests) if rate.requests>0 else 61
    return max(3,delay)
def blank():return dict(schema=1,note=NOTE,built=None,checked=None,success=None,status="waiting",rows={},dropped=0,source=SEED,source_hash=None)
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE or d["source"]!=SEED or d["status"] not in ("waiting","ok","error","blocked") or len(d["rows"])>MAX:raise ValueError("Invalid crawl ledger")
    if d["source_hash"] is not None and not re.fullmatch(r"[a-f0-9]{64}",d["source_hash"]):raise ValueError("Invalid source hash")
    for url,r in d["rows"].items():
        if paper_url(url)!=url or not r["title"] or stamp(r["first_seen"])>stamp(r["last_seen"]):raise ValueError("Invalid item")
    return len(d["rows"])
def advance(d,now,refresh,request=fetch,sleep=time.sleep):
    validate(d);stamp(now);d["built"]=now
    if not refresh or d["checked"] and stamp(now)-stamp(d["checked"])<timedelta(hours=24):return d
    d["checked"]=now
    try:
        try:
            robot=request(ROBOTS)
            if robot.media_type!="text/plain":raise ValueError("Invalid robots response")
            delay=allowed(robot.raw.decode(robot.charset,errors="strict"))
        except HTTPError as e:
            if e.code!=404:raise
            delay=3
        if delay is None or delay>20:
            d["status"]="blocked";return d
        sleep(delay)
        payload=request(SEED)
        if payload.media_type!="text/html":raise ValueError("Not HTML")
        rows=parse(payload.raw.decode(payload.charset,errors="strict"))
        for url,title in rows.items():
            prior=d["rows"].get(url)
            d["rows"][url]=dict(title=title,first_seen=prior["first_seen"] if prior else now,last_seen=now)
        d.update(success=now,status="ok",source_hash=payload.sha256)
    except Exception:d["status"]="error"
    ordered=sorted(d["rows"].items(),key=lambda x:(x[1]["last_seen"],x[0]),reverse=True)
    d["dropped"]+=max(0,len(ordered)-MAX);d["rows"]=dict(ordered[:MAX]);validate(d);return d
def publish(out,previous,now,refresh):
    d=blank();p=previous/FILE
    if p.exists():
        manifest=json.loads((previous/"data-manifest.json").read_text(encoding="utf-8"))
        if provenance.file_info(p)!=manifest["files"].get(FILE):raise ValueError("Crawl checksum mismatch")
        d=json.loads(p.read_text(encoding="utf-8"))
    d=advance(d,now,refresh)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
