"""Review register for extracted corporate numeric evidence.
Identity includes the document hash and numeric claim. Never changes source data.
"""
import json,hashlib,math,re
from datetime import datetime
import provenance
import economic_corporate_pdf as pdf
FILE="economic-corporate-review.json"
NOTE="Кандидаты из автоматического извлечения. Совпадение с ручным архивом подтверждает только согласованность переноса; не является независимым аудитом. Ни одна запись не изменяет опубликованную статистику. Старые версии сохраняются до лимита."
LIMIT=1000
def read(p):return json.loads(p.read_text(encoding="utf-8"))
def identifier(r):
    parts=[r[k] for k in ("company","metric","year","unit","url","page","sha256","value")]
    return hashlib.sha256(json.dumps(parts,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode()).hexdigest()
def empty():return dict(schema=1,built=None,note=NOTE,rows={},counts={})
def clock(s):
    t=datetime.fromisoformat(s)
    if t.tzinfo is None:raise ValueError("Missing timezone")
    return t
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE or len(d["rows"])>LIMIT:raise ValueError("Invalid review register")
    for k,r in d["rows"].items():
        if k!=identifier(r) or not re.fullmatch(r"[a-f0-9]{64}",r["sha256"]) or r["url"]!=pdf.URL or r["company"]!="rosenergoatom" or r["metric"]!="nuclear_generation" or r["unit"]!="млрд кВт·ч" or r["page"]!=pdf.PAGE or r["year"] not in pdf.YEARS:raise ValueError("Invalid claim")
        if type(r["value"]) not in (int,float) or not math.isfinite(r["value"]) or not 0<=r["value"]<=1000:raise ValueError("Invalid value")
        if r["state"] not in ("matched_archive","review_difference","missing_archive","cached","superseded") or type(r["active"]) is not bool or r["active"]!=(r["state"]!="superseded"):raise ValueError("Invalid review status")
        if not clock(r["first_seen"])<=clock(r["last_seen"]):raise ValueError("Invalid dates")
        v=r["archived"]
        if v is not None and (type(v) not in (float,int) or not math.isfinite(v)):raise ValueError("Invalid archived value")
    return True
def advance(d,source,stamp):
    validate(d);pdf.validate(source);clock(stamp)
    # Derive comparisons from the verified extraction, not arbitrary supplied claims.
    compared={r["year"]:r for r in source["comparison"]}
    if len(compared)!=len(source["comparison"]) or set(compared)!={r["year"] for r in source["rows"]}:raise ValueError("Incomplete comparison")
    staged={}
    for v in source["rows"]:
        c=compared[v["year"]]
        if c["value"]!=v["value"]:raise ValueError("Comparison mismatch")
        old=c["archived"];residual=v["value"]-old if old is not None else None
        status="missing" if residual is None else "match" if abs(residual)<0.0005 else "review"
        if c["status"]!=status or c["residual"]!=residual:raise ValueError("Comparison inconsistent")
        r=dict(company="rosenergoatom",metric="nuclear_generation",year=v["year"],unit=source["unit"],url=source["url"],page=source["pdf_page"],sha256=source["sha256"],value=v["value"])
        k=identifier(r);prior=d["rows"].get(k)
        state="cached" if source["status"]!="extracted" else {"match":"matched_archive","review":"review_difference","missing":"missing_archive"}[status]
        staged[k]=dict(r,archived=old,residual=residual,state=state,active=True,first_seen=prior["first_seen"] if prior else stamp,last_seen=stamp,source_checked=source["checked"],source_success=source["success"])
    if len(set(d["rows"])|set(staged))>LIMIT:raise ValueError("Review register capacity exceeded")
    # Supersede only on a successful new extraction; errors keep the cached claims.
    if source["status"]=="extracted":
        for k,r in d["rows"].items():
            if k not in staged:r.update(active=False,state="superseded")
    d["rows"].update(staged);d["built"]=stamp
    d["counts"]={k:sum(r["state"]==k for r in d["rows"].values()) for k in ("matched_archive","review_difference","missing_archive","cached","superseded")}
    validate(d);return d
def publish(out,previous,stamp):
    d=empty();p=previous/FILE
    if p.exists():
        manifest=read(previous/"data-manifest.json")
        if provenance.file_info(p)!=manifest["files"].get(FILE):raise ValueError("Review register checksum mismatch")
        d=read(p)
    d=advance(d,read(out/pdf.FILE),stamp)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
