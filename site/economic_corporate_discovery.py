"""Discover candidate report links on two known corporate catalogues.
Do not download discovered documents, infer release dates or import statistics.
"""
import json,re
from datetime import timedelta
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit,parse_qs,urlencode
import provenance
from economic_corporate_monitor import fetch_html,clock,Blocked
FILE="economic-corporate-discovery.json"
SPECS={"rosatom":("Росатом","https://report.rosatom.ru/ar2025"),"novatek":("НОВАТЭК","https://www.novatek.ru/ru/press/releases/index.php/?newsFilterFormMode_4=releases")}
NOTE="Ссылки-кандидаты из официальных каталогов. Дата обнаружения не является датой публикации. Документы не загружены и показатели не проверены. Первая загрузка — исходная выборка, не новые публикации."
LIMIT=500
class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.href=None;self.parts=[];self.rows=[]
    def handle_starttag(self,tag,attrs):
        if tag=="a":self.href=dict(attrs).get("href");self.parts=[]
    def handle_data(self,data):
        if self.href is not None:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag=="a" and self.href is not None:
            self.rows.append((self.href," ".join("".join(self.parts).split())));self.href=None;self.parts=[]
def candidate(key,href,title,stamp):
    if not isinstance(href,str) or not isinstance(title,str) or len(href)>2000 or not 12<=len(title)<=250 or any(ord(x)<32 or x=="\\" for x in href):return None
    title=" ".join(title.split());low=title.casefold().replace("ё","е")
    years=[int(y) for y in re.findall(r"(?<!\d)(20\d{2})(?!\d)",title)]
    if not years or not all(2020<=y<=clock(stamp).year for y in years):return None
    try:
        u=urlsplit(urljoin(SPECS[key][1],href))
        if u.scheme!="https" or u.username or u.password or u.port not in (None,443) or u.fragment:return None
        if key=="novatek":
            if u.hostname!="www.novatek.ru" or u.path not in ("/ru/press/releases/archive/index.php","/ru/press/releases/index.php","/ru/press/releases/index.php/","/ru/press/releases/photo.php"):return None
            if not re.search(r"производственн\w* (?:показател|результат)|финансов\w* результат|отчет об устойчивом развитии",low):return None
            q=parse_qs(u.query,strict_parsing=True)
            if set(q)-{"id_4","from_4","newsFilterFormMode_4"} or len(q.get("id_4",[]))!=1 or not re.fullmatch(r"\d{1,8}",q["id_4"][0]):return None
            url="https://www.novatek.ru"+u.path+"?"+urlencode({"id_4":q["id_4"][0]})
        else:
            if u.hostname not in ("report.rosatom.ru","www.report.rosatom.ru") or u.query:return None
            if not re.search(r"отчет|итоги деятельности|ключевые результаты",low):return None
            if not re.fullmatch(r"/(?:\d{1,8}(?:\.html)?|[A-Za-z0-9_/-]+\.pdf)",u.path) or ".." in u.path:return None
            url="https://"+u.hostname+u.path
        return dict(company=key,title=title,url=url,years=sorted(set(years)),format="pdf" if u.path.lower().endswith(".pdf") else "html")
    except (ValueError,TypeError):return None
def parse(key,raw,charset,stamp):
    if len(raw)>2_000_000:raise ValueError("Too large")
    p=Links();p.feed(raw.decode(charset,errors="strict"));p.close()
    found={}
    for href,title in p.rows:
        r=candidate(key,href,title,stamp)
        if r:found.setdefault(r["url"],r)
    if not found:raise ValueError("No matching report links; schema or availability requires review")
    return list(found.values())[:100]
def fetch(key,stamp):
    p=fetch_html(SPECS[key][1])
    return parse(key,p.raw,p.charset,stamp)
def blank():
    return dict(schema=1,built=None,note=NOTE,sources={k:dict(title=t,url=u,checked=None,success=None,status="waiting",error=None) for k,(t,u) in SPECS.items()},rows={})
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE or set(d["sources"])!=set(SPECS) or len(d["rows"])>LIMIT:raise ValueError("Invalid catalogue")
    for k,r in d["sources"].items():
        if (r["title"],r["url"])!=SPECS[k] or r["status"] not in ("waiting","ok","blocked","error"):raise ValueError("Invalid source")
        for f in ("checked","success"):
            if r[f] is not None:clock(r[f])
    for url,r in d["rows"].items():
        if url!=r["url"] or r["company"] not in SPECS or not candidate(r["company"],url,r["title"],r["last_seen"]) or clock(r["first_seen"])>clock(r["last_seen"]) or type(r["initial"]) is not bool:raise ValueError("Invalid candidate")
    return True
def advance(d,stamp,refresh,loader=fetch):
    validate(d);now=clock(stamp);d["built"]=stamp
    if not refresh:return d
    due=[(k,r) for k,r in d["sources"].items() if r["checked"] is None or now-clock(r["checked"])>=timedelta(days=7)]
    if not due:return d
    k,r=min(due,key=lambda x:(x[1]["checked"] or "",x[0]));r["checked"]=stamp
    try:
        new=loader(k,stamp)
        if not new or len(new)>100:raise ValueError("Invalid catalogue result")
        staged={}
        for row in new:
            clean=candidate(k,row["url"],row["title"],stamp)
            if clean!=row:raise ValueError("Unvalidated candidate")
            old=d["rows"].get(row["url"])
            staged[row["url"]]=dict(row,first_seen=old["first_seen"] if old else stamp,last_seen=stamp,initial=old["initial"] if old else r["success"] is None)
        if len(set(d["rows"])|set(staged))>LIMIT:raise ValueError("Catalogue capacity reached")
        d["rows"].update(staged);r.update(status="ok",success=stamp,error=None)
    except Exception as e:r.update(status="blocked" if isinstance(e,Blocked) else "error",error=type(e).__name__)
    validate(d);return d
def publish(out,previous,stamp,refresh):
    d=blank();p=previous/FILE
    if p.exists():
        manifest=json.loads((previous/"data-manifest.json").read_text(encoding="utf-8"))
        if provenance.file_info(p)!=manifest["files"].get(FILE):raise ValueError("Corporate discovery checksum mismatch")
        d=json.loads(p.read_text(encoding="utf-8"))
    d=advance(d,stamp,refresh)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
