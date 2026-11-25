"""Bounded, anonymous OpenAlex metadata lookup. Never fetch the article itself.
A provider's reported free copy is not our verification of current access.
See https://help.openalex.org/data/works/open-access/ and
https://help.openalex.org/api/get-single-entities/.
"""
import json,re,time
from datetime import datetime,timedelta
from urllib.parse import quote,unquote
from urllib.error import HTTPError
import source_registry,source_pipeline
from observation_contract import json_load
from literature import public_link

DOC="https://help.openalex.org/data/works/open-access/"
LIMIT=10
STATUSES={"diamond","gold","green","hybrid","bronze","closed"}
VERSIONS={"publishedVersion","acceptedVersion","submittedVersion"}
def normalize(value):
    if not isinstance(value,str):return ""
    v=re.sub(r"^https?://(?:dx\.)?doi\.org/","",value.strip(),flags=re.I)
    try:v=unquote(v,errors="strict").lower()
    except UnicodeError:return ""
    if len(v)>400 or not re.fullmatch(r"10\.\d{4,9}/[^\s\x00-\x1f\x7f\\]+",v) or any(x in (".","..","") for x in v.split("/")):return ""
    return v

def url(doi):
    if not normalize(doi) or normalize(doi)!=doi:raise ValueError("DOI не нормализован")
    return "https://api.openalex.org/works/doi:"+quote(doi,safe="/")+"?select=id,doi,open_access,best_oa_location"

def parse(raw,doi):
    if not isinstance(raw,dict) or normalize(raw.get("doi"))!=doi:raise ValueError("OpenAlex: несовпадение DOI")
    work=raw.get("id","")
    if not isinstance(work,str) or not re.fullmatch(r"https://openalex\.org/W[0-9]+",work):raise ValueError("OpenAlex: идентификатор работы")
    oa=raw.get("open_access")
    if not isinstance(oa,dict) or type(oa.get("is_oa")) is not bool or oa.get("oa_status") not in STATUSES or oa["is_oa"]!=(oa["oa_status"]!="closed"):raise ValueError("OpenAlex: статус доступа")
    loc=raw.get("best_oa_location")
    pdf=landing=license=version=host_type=""
    if oa["is_oa"] and isinstance(loc,dict) and loc.get("is_oa") is True:
        pdf=public_link(loc.get("pdf_url"));landing=public_link(loc.get("landing_page_url"))
        val=loc.get("license")
        license=val if isinstance(val,str) and re.fullmatch(r"[a-zA-Z0-9_.-]{1,80}",val) else ""
        version=loc.get("version") if loc.get("version") in VERSIONS else ""
        source=loc.get("source")
        if isinstance(source,dict) and source.get("type") in ("journal","repository"):host_type=source["type"]
    return dict(work=work,is_oa=oa["is_oa"],oa_status=oa["oa_status"],pdf=pdf,landing=landing,license=license,version=version,host_type=host_type)

def setup(db):
    db.execute("""create table if not exists openalex_access(
      doi text primary key,checked text not null,result text not null,success text,payload text)""")
    db.execute("create table if not exists openalex_run(day text primary key)")
    db.commit()

def retrieve(doi):
    request=url(doi)
    try:
        payload=source_registry.fetch(request)
        result=parse(json_load(payload.raw),doi)
    except HTTPError as e:
        if e.code==404:return "not_found",None
        if e.code in (401,403,429):return "deferred",None
        return "error",None
    except Exception as error:
        source_pipeline.record(request,"OpenAlex DOI","parse",error=error)
        return "error",None
    source_pipeline.record(request,"OpenAlex DOI","parse",1)
    return "accepted",result

def sync(db,papers,stamp,refresh,request=None):
    setup(db)
    if request is None:request=retrieve
    day=stamp[:10]
    old={r[0]:(r[1],r[2],r[3],r[4]) for r in db.execute("select doi,checked,result,success,payload from openalex_access")}
    if refresh and not db.execute("select 1 from openalex_run where day=?",(day,)).fetchone():
        # Record once per UTC day; no repeat after a rate/access denial.
        with db:
            db.execute("insert into openalex_run values(?)",(day,))
            db.execute("delete from openalex_run where day<?",((datetime.fromisoformat(stamp)-timedelta(days=90)).date().isoformat(),))
        cutoff=(datetime.fromisoformat(stamp)-timedelta(days=90)).date().isoformat()
        pending=sorted({p["doi"] for p in papers if normalize(p["doi"])==p["doi"] and (p["doi"] not in old or old[p["doi"]][0][:10]<=cutoff)},key=lambda doi:(old.get(doi,("",))[0],doi))
        began=time.monotonic();errors=0
        for doi in pending[:LIMIT]:
            if time.monotonic()-began>=55:break
            state,data=request(doi)
            if state=="accepted":
                success=stamp;payload=json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(",",":"));errors=0
            else:
                success,payload=old.get(doi,(None,None,None,None))[2:]
                errors+=state=="error"
            with db:
                db.execute("insert or replace into openalex_access values(?,?,?,?,?)",(doi,stamp,state,success,payload))
            if state=="deferred" or errors>=2:break
    rows={r[0]:dict(checked=r[1],result=r[2],success=r[3],evidence=json.loads(r[4]) if r[4] else None) for r in db.execute("select doi,checked,result,success,payload from openalex_access")}
    for p in papers:
        if p["doi"] in rows:p["openalex_access"]=rows[p["doi"]]
    return papers

def quality(paper):
    x=paper.get("openalex_access")
    if x is None:return "unchecked"
    if set(x)!={"checked","result","success","evidence"} or x["result"] not in ("accepted","not_found","error","deferred"):raise ValueError("OpenAlex: результат")
    checked=datetime.fromisoformat(x["checked"])
    if checked.tzinfo is None:raise ValueError("OpenAlex: дата проверки")
    e=x["evidence"]
    if (e is None)!=(x["success"] is None):raise ValueError("OpenAlex: дата сведений")
    if e is not None:
        success=datetime.fromisoformat(x["success"])
        if success.tzinfo is None or success>checked:raise ValueError("OpenAlex: дата сведений")
        if set(e)!={"work","is_oa","oa_status","pdf","landing","license","version","host_type"} or not isinstance(e["work"],str) or not re.fullmatch(r"https://openalex\.org/W[0-9]+",e["work"]) or type(e["is_oa"]) is not bool or e["oa_status"] not in STATUSES or e["is_oa"]!=(e["oa_status"]!="closed"):raise ValueError("OpenAlex: сведения")
        if any(e[k] and public_link(e[k])!=e[k] for k in ("pdf","landing")) or e["version"] not in VERSIONS|{""} or e["host_type"] not in ("","journal","repository") or not isinstance(e["license"],str) or e["license"] and not re.fullmatch(r"[a-zA-Z0-9_.-]{1,80}",e["license"]):raise ValueError("OpenAlex: место доступа")
        if not e["is_oa"] and any(e[k] for k in ("pdf","landing","license","version","host_type")):raise ValueError("OpenAlex: противоречие доступа")
    if x["result"]=="accepted":
        if e is None or x["success"]!=x["checked"]:raise ValueError("OpenAlex: принят без сведений")
        return "reported_open" if e["is_oa"] else "reported_closed"
    return x["result"]
