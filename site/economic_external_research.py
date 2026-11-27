"""Bounded external research discovery via arXiv's public Atom API.
Metadata only. No PDFs, abstracts, or arbitrary URL traversal.
"""
import json,re
import xml.etree.ElementTree as ET
from datetime import datetime,timedelta
from urllib.parse import urlencode
import provenance
from source_transport import download
FILE="economic-external-research.json"
NOTE="Метаданные препринтов arXiv; не подтверждение рецензирования, достоверности или полноты покрытия."
CATS=("econ.GN","econ.EM","econ.TH","q-fin.EC")
MAX=3000
NS="{http://www.w3.org/2005/Atom}"
ID=re.compile(r"https?://arxiv\.org/abs/(\d{4}\.\d{4,5})(?:v([1-9]\d*))?")
def time(s):
    d=datetime.fromisoformat(s)
    if d.tzinfo is None:raise ValueError("Missing timezone")
    return d
def url(cat):
    if cat not in CATS:raise ValueError("Unknown category")
    return "https://export.arxiv.org/api/query?"+urlencode({"search_query":"cat:"+cat,"start":0,"max_results":50,"sortBy":"submittedDate","sortOrder":"descending"})
def request(cat):
    return download(url(cat),hosts=("export.arxiv.org",),path_check=lambda p:p=="/api/query",max_bytes=2000000,timeout=20).raw
def parse(raw,cat,stamp):
    if not isinstance(raw,bytes) or len(raw)>2000000 or re.search(rb"<!\s*(?:DOCTYPE|ENTITY)",raw,re.I):raise ValueError("Unsafe feed")
    root=ET.fromstring(raw)
    if root.tag!=NS+"feed":raise ValueError("Not Atom")
    total=root.findtext("{http://a9.com/-/spec/opensearch/1.1/}totalResults")
    start=root.findtext("{http://a9.com/-/spec/opensearch/1.1/}startIndex")
    entries=root.findall(NS+"entry")
    if total is None or not total.isdigit() or start!="0" or len(entries)!=min(50,int(total)):raise ValueError("Incomplete result")
    rows={}
    for e in entries:
        match=ID.fullmatch(e.findtext(NS+"id") or "")
        title=" ".join((e.findtext(NS+"title") or "").split())
        published=e.findtext(NS+"published")
        updated=e.findtext(NS+"updated")
        categories=sorted({x.get("term","") for x in e.findall(NS+"category")})
        if not match or not title or cat not in categories or not published or not updated or time(published)>time(updated) or time(updated)>time(stamp)+timedelta(days=1):raise ValueError("Invalid entry")
        key=match.group(1)
        if key in rows:raise ValueError("Duplicate preprint")
        authors=[" ".join((a.findtext(NS+"name") or "").split())[:160] for a in e.findall(NS+"author")][:30]
        rows[key]=dict(title=title[:350],url="https://arxiv.org/abs/"+key,published=published,updated=updated,version=int(match.group(2) or 1),categories=categories,authors=authors,seen=stamp)
    return rows
def blank():
    return dict(schema=1,note=NOTE,built=None,next_category=0,checked=None,success=None,status="waiting",rows={},dropped=0)
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE or type(d["next_category"]) is not int or not 0<=d["next_category"]<len(CATS) or d["status"] not in ("waiting","ok","error") or len(d["rows"])>MAX:raise ValueError("Invalid external index")
    for key,r in d["rows"].items():
        if not re.fullmatch(r"\d{4}\.\d{4,5}",key) or r["url"]!="https://arxiv.org/abs/"+key or not r["title"] or not set(CATS)&set(r["categories"]) or type(r["version"]) is not int or r["version"]<1 or time(r["published"])>time(r["updated"]):raise ValueError("Invalid preprint")
        time(r["seen"])
    return len(d["rows"])
def advance(d,stamp,refresh,fetch=request):
    validate(d);time(stamp);d["built"]=stamp
    if not refresh or d["checked"] and time(stamp)-time(d["checked"])<timedelta(hours=24):return d
    cat=CATS[d["next_category"]];d["checked"]=stamp
    try:
        batch=parse(fetch(cat),cat,stamp)
        for key,r in batch.items():
            prior=d["rows"].get(key)
            if prior is None or (r["version"],r["updated"])>=(prior["version"],prior["updated"]):d["rows"][key]=r
        d["success"]=stamp;d["status"]="ok";d["next_category"]=(d["next_category"]+1)%len(CATS)
    except Exception:d["status"]="error"
    ordered=sorted(d["rows"].items(),key=lambda x:(x[1]["updated"],x[0]),reverse=True)
    d["dropped"]+=max(0,len(ordered)-MAX);d["rows"]=dict(ordered[:MAX]);validate(d);return d
def publish(out,previous,stamp,refresh):
    d=blank();p=previous/FILE
    if p.exists():
        manifest=json.loads((previous/"data-manifest.json").read_text(encoding="utf-8"))
        if provenance.file_info(p)!=manifest["files"].get(FILE):raise ValueError("External index checksum mismatch")
        d=json.loads(p.read_text(encoding="utf-8"))
    d=advance(d,stamp,refresh)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
