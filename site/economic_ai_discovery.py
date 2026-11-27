"""Bounded discovery of previously unregistered Russian WDI time series.
Uses the existing approved transport and parser; no arbitrary crawling.
"""
import json,re,math
from datetime import datetime,timedelta
from pathlib import Path
import provenance,series,wdi_metadata

FILE="economic-ai-discovery.json"
MAX_SERIES=150
BATCH=4
PREFIXES=("NV.","NY.","NE.","BX.","BM.","BN.","FS.","FM.","FP.","SL.","SP.","EG.","AG.","GB.","IT.","IS.","IC.","GC.","DT.","TX.","TM.")
NOTE="Пилот расширения WDI: оригинальные названия и единицы поставщика; при пустой единице см. название и методику. Годовые наблюдения России, не независимая оценка всей экономики. Не заменяет основной каталог."
def dt(s):return datetime.fromisoformat(s)
def due(last,stamp,days):return not last or dt(stamp)-dt(last)>=timedelta(days=days)
def code_ok(code):return isinstance(code,str) and bool(re.fullmatch(r"[A-Z0-9][A-Z0-9_.-]{1,79}",code)) and code.startswith(PREFIXES)
def discover(excluded,request=None):
    if request is None:request=wdi_metadata.fetch
    found={};expected=None;total=None;received=0;seen=set()
    for page in range(1,11):
        raw=request(page)
        if not isinstance(raw,list) or len(raw)!=2 or not isinstance(raw[0],dict) or not isinstance(raw[1],list):raise ValueError("Invalid metadata response")
        h,rows=raw;pages=int(h["pages"]);size=int(h["total"])
        if int(h["page"])!=page or not 1<=pages<=10 or (expected is not None and (expected!=pages or total!=size)):raise ValueError("Invalid pagination")
        expected,total=pages,size;received+=len(rows)
        for r in rows:
            code=r.get("id")
            if not isinstance(code,str) or not code or code in seen:raise ValueError("Duplicate or invalid metadata code")
            seen.add(code)
            if code in excluded or not code_ok(code) or str(r.get("source",{}).get("id"))!="2":continue
            fields={k:r.get(k) or "" for k in ("name","unit","sourceNote","sourceOrganization")}
            if any(not isinstance(v,str) for v in fields.values()) or not fields["name"].strip() or not fields["sourceNote"].strip():continue
            found[code]={"title":fields["name"][:500],"unit":fields["unit"][:100],"definition":fields["sourceNote"][:3000],"organization":fields["sourceOrganization"][:500]}
        if page==pages:break
    if received!=total or not found:raise ValueError("Incomplete or empty discovery catalogue")
    return found
def values_from_payload(raw,code,stamp):
    values,updated=series.parse_response(raw,code)
    clean={y:v for y,v in values.items() if 1991<=int(y)<=int(stamp[:4]) and v is not None}
    return clean,str(updated or "")
def blank():
    return {"schema":1,"note":NOTE,"built":None,"catalog_checked":None,"catalog_success":None,"catalog_status":"waiting","rows":{}}
def validate(data):
    if data["schema"]!=1 or data["note"]!=NOTE or not isinstance(data["rows"],dict) or len(data["rows"])>MAX_SERIES:raise ValueError("Invalid discovery ledger")
    if data["catalog_status"] not in ("waiting","ok","error"):raise ValueError("Invalid catalogue state")
    for code,r in data["rows"].items():
        if not code_ok(code) or r["url"]!=series.api(code) or r["status"] not in ("waiting","ok","empty","error","metadata_missing"):raise ValueError("Invalid series identity")
        if not r["title"] or not r["definition"] or not isinstance(r["values"],dict):raise ValueError("Incomplete metadata")
        if any(not re.fullmatch(r"\d{4}",y) or not 1991<=int(y)<=2100 or type(v) not in (int,float) or not math.isfinite(v) for y,v in r["values"].items()):raise ValueError("Invalid observation")
        if r["values"] and not r["success"]:raise ValueError("Unverified cache")
        if r["status"]=="ok" and not r["values"]:raise ValueError("Empty successful row")
        for field in ("checked","success"):
            if r[field] and dt(r[field]).tzinfo is None:raise ValueError("Timezone missing")
    return {"discovery_candidates":len(data["rows"]),"discovery_populated":sum(bool(r["values"]) for r in data["rows"].values()),"discovery_observations":sum(len(r["values"]) for r in data["rows"].values())}
def get_series(code):
    from source_registry import fetch
    from observation_contract import json_load
    return json_load(fetch(series.api(code)).raw)
def advance(data,excluded,stamp,refresh,metadata_request=None,series_request=None):
    validate(data)
    if dt(stamp).tzinfo is None:raise ValueError("Build time must have timezone")
    data["built"]=stamp
    data["rows"]={k:v for k,v in data["rows"].items() if k not in excluded}
    if not refresh:return data
    rows=data["rows"]
    if due(data["catalog_checked"],stamp,7 if data["catalog_status"]=="ok" else 1):
        data["catalog_checked"]=stamp
        try:
            candidates=discover(excluded,metadata_request)
            for code,r in rows.items():
                if code not in candidates:r["status"]="metadata_missing";continue
                meta=candidates[code]
                if any(r[k]!=meta[k] for k in ("title","unit","definition","organization")):
                    # Do not silently attach an old numerical series to a changed definition.
                    r.update(meta,values={},checked=None,success=None,status="waiting",source_updated=None)
                elif r["status"]=="metadata_missing":r["status"]="waiting"
            # Limit grows to a bounded pilot. Round-robin prefixes to avoid a single domain.
            buckets={p:[] for p in PREFIXES}
            for code in sorted(candidates.keys()-rows.keys()):
                buckets[next(p for p in PREFIXES if code.startswith(p))].append(code)
            while len(rows)<MAX_SERIES and any(buckets.values()):
                for p in PREFIXES:
                    if buckets[p] and len(rows)<MAX_SERIES:
                        code=buckets[p].pop(0);rows[code]=dict(candidates[code],url=series.api(code),values={},checked=None,success=None,status="waiting",source_updated=None)
            data["catalog_success"]=stamp;data["catalog_status"]="ok"
        except Exception:
            data["catalog_status"]="error"
    queue=[(code,r) for code,r in rows.items() if r["status"]!="metadata_missing" and due(r["checked"],stamp,30 if r["status"] in ("ok","empty") else 2)]
    queue.sort(key=lambda t:(t[1]["checked"] is not None,t[1]["checked"] or "",t[0]))
    request=series_request or get_series
    for code,r in queue[:BATCH]:
        r["checked"]=stamp
        try:
            vals,updated=values_from_payload(request(code),code,stamp)
            r.update(values=vals,success=stamp,source_updated=updated,status="ok" if vals else "empty")
        except Exception:r["status"]="error"
    validate(data)
    return data
def publish(out,previous,excluded,stamp,refresh):
    data=blank()
    path=previous/FILE
    if path.exists():
        manifest=json.loads((previous/"data-manifest.json").read_text(encoding="utf-8"))
        if provenance.file_info(path)!=manifest["files"].get(FILE):raise ValueError("Discovery archive checksum mismatch")
        data=json.loads(path.read_text(encoding="utf-8"))
    data=advance(data,excluded,stamp,refresh)
    (out/FILE).write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    return data
