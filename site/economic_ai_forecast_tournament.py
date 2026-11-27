"""Prospective paired forecast tournament; no tuning on retrospective holdout.
Freeze all candidates before target starts. Compare first facts only.
"""
import json,math
from collections import defaultdict
from datetime import datetime
import forecast,provenance
from economic_ai_forecast_memory import finite,period_ok,before
FILE="economic-ai-forecast-tournament.json"
LIMIT=6000
MIN_TARGETS=12
NOTE="Перспективное сравнение заранее зафиксированных методов на одинаковых целях. Рекомендация метода не меняет опубликованный прогноз. Оценка по первой фактической редакции в архиве сайта; не реконструкция исторических винтажей."
def key(r):return tuple(r[k] for k in ("code","source","unit","horizon","origin","target"))
def empty():return dict(schema=1,note=NOTE,built=None,rows=[],dropped=0,summary=[])
def read(p):return json.loads(p.read_text(encoding="utf-8"))
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE or len(d["rows"])>LIMIT or len({key(r) for r in d["rows"]})!=len(d["rows"]):raise ValueError("Invalid tournament")
    for r in d["rows"]:
        if not period_ok(r["origin"]) or not before(r["issued"],r["target"]) or len(r["origin"])!=len(r["target"]) or r["origin"]>=r["target"]:raise ValueError("Invalid period")
        if datetime.fromisoformat(r["issued"]).tzinfo is None or not isinstance(r["horizon"],int) or r["horizon"]<1:raise ValueError("Invalid issuance")
        methods=r["predictions"]
        if "last" not in methods or len(methods)<2 or not set(methods)<=set(forecast.LABELS) or not all(finite(v) for v in methods.values()):raise ValueError("Invalid predictions")
        if r["actual"] is not None and (not finite(r["actual"]) or not r["seen"] or before(r["seen"],r["target"]) or r["seen"]<r["issued"]):raise ValueError("Invalid fact")
        if r["actual"] is None and r["seen"] is not None:raise ValueError("Invalid empty fact")
    return True
def summarize(rows):
    groups=defaultdict(list)
    for r in rows:
        if r["actual"] is not None:groups[(r["code"],r["source"],r["unit"],r["horizon"],tuple(sorted(r["predictions"])))].append(r)
    result=[]
    for (code,source,unit,h,methods),xs in sorted(groups.items()):
        # One observation per target, even when issuance origins overlap.
        unique={}
        for r in sorted(xs,key=lambda r:(r["issued"],r["origin"])):unique.setdefault(r["target"],r)
        pairs=sorted(unique.values(),key=lambda r:r["target"])
        n=len(pairs)
        split=max(1,int(n*2/3))
        train=pairs[:split];test=pairs[split:]
        def scores(sample):
            return {m:sum(abs(r["predictions"][m]-r["actual"]) for r in sample)/len(sample) for m in methods} if sample else {}
        dev=scores(train);hold=scores(test)
        candidate=min(methods,key=lambda m:(dev[m],m!="last",m))
        recommendation=None
        if n>=MIN_TARGETS and len(test)>=4 and candidate!="last" and dev[candidate]<dev["last"] and hold[candidate]<hold["last"]:recommendation=candidate
        result.append(dict(code=code,source=source,unit=unit,horizon=h,methods=list(methods),n=n,development_n=len(train),holdout_n=len(test),development=dev,holdout=hold,candidate=candidate,recommendation=recommendation,status="insufficient" if n<MIN_TARGETS else "candidate" if recommendation else "no_improvement"))
    return result
def advance(d,current,stamp):
    validate(d)
    if datetime.fromisoformat(stamp).tzinfo is None:raise ValueError("Invalid clock")
    known={};new=[]
    for s in current["series"]:
        ident=(s["code"],s["source"],s["unit"])
        hist={v["period"]:v["value"] for v in s["history"] if period_ok(v["period"]) and finite(v["value"])}
        if ident in known:raise ValueError("Duplicate series")
        known[ident]=hist
        bounds=forecast.MONTHLY.get(s["code"]) if s["monthly"] else forecast.ANNUAL.get(s["code"])
        if s["code"]=="INDUSTRY_YOY":bounds=(0,None)
        for f in s["results"]:
            if not before(stamp,f["target"]) or f["target"] in hist or f["origin"] not in hist:continue
            convert=forecast.month_index if s["monthly"] else int
            train=[v for _,v in forecast.tail({convert(k):v for k,v in hist.items() if k<=f["origin"]})]
            methods=sorted(f["development"])
            if len(train)<forecast.MIN_TRAIN or "last" not in methods:continue
            predictions={m:forecast.predict(train,f["horizon"],m,bounds) for m in methods}
            new.append(dict(code=s["code"],source=s["source"],unit=s["unit"],horizon=f["horizon"],origin=f["origin"],target=f["target"],issued=stamp,predictions=predictions,actual=None,seen=None))
    for r in d["rows"]:
        fact=known.get((r["code"],r["source"],r["unit"]),{}).get(r["target"])
        if r["actual"] is None and fact is not None and not before(stamp,r["target"]):r["actual"]=fact;r["seen"]=stamp
    ids={key(r) for r in d["rows"]}
    for r in new:
        if key(r) not in ids:d["rows"].append(r);ids.add(key(r))
    d["rows"].sort(key=lambda r:(r["actual"] is None,r["issued"],key(r)),reverse=True)
    d["dropped"]+=max(0,len(d["rows"])-LIMIT);d["rows"]=d["rows"][:LIMIT]
    d["summary"]=summarize(d["rows"]);d["built"]=stamp;validate(d);return d
def publish(out,previous,stamp,refresh):
    d=empty();path=previous/FILE
    if path.exists():
        manifest=read(previous/"data-manifest.json")
        if provenance.file_info(path)!=manifest["files"].get(FILE):raise ValueError("Tournament checksum mismatch")
        d=read(path)
    if refresh:d=advance(d,read(out/"forecast.json"),stamp)
    else:d["built"]=stamp
    validate(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
