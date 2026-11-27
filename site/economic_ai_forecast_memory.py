"""Prospective forecast scorecard. Freeze the first forecast before target period.
Compare only identical series/source/unit; never tune models using this ledger.
"""
import json,math,re
from datetime import datetime
from collections import defaultdict
import provenance
FILE="economic-ai-forecast-memory.json"
LIMIT=4000
NOTE="Журнал прогнозов, зафиксированных до начала целевого периода. Оценка по первой доступной редакции в архиве сайта; последующие пересмотры показаны отдельно. Не ретроспективный backtest и не автоматическое дообучение нейросети."

def finite(x):return type(x) in (float,int) and math.isfinite(x)
def read(p):return json.loads(p.read_text(encoding="utf-8"))
def period_ok(p):return isinstance(p,str) and bool(re.fullmatch(r"\d{4}(?:-(?:0[1-9]|1[0-2]))?",p))
def time_ok(s):return isinstance(s,str) and datetime.fromisoformat(s).tzinfo is not None
def before(stamp,p):
    return period_ok(p) and stamp[:len(p)]<p
def identity(r):return (r["code"],r["source"],r["unit"],r["origin"],r["target"],r["horizon"])
def empty():return {"schema":1,"note":NOTE,"built":None,"rows":[],"dropped":0,"summary":[]}
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE or len(d["rows"])>LIMIT or type(d["dropped"]) is not int or d["dropped"]<0:raise ValueError("Invalid forecast ledger")
    if len({identity(r) for r in d["rows"]})!=len(d["rows"]):raise ValueError("Duplicate forecast")
    for r in d["rows"]:
        if not time_ok(r["issued"]) or not before(r["issued"],r["target"]) or not period_ok(r["origin"]) or len(r["origin"])!=len(r["target"]) or r["origin"]>=r["target"] or not all(finite(r[k]) for k in ("point","low","high","naive")) or not r["low"]<=r["point"]<=r["high"] or type(r["horizon"]) is not int or r["horizon"]<1:raise ValueError("Invalid frozen forecast")
        if r["first_actual"] is None:
            if r["first_seen"] is not None:raise ValueError("Missing first fact")
        elif not finite(r["first_actual"]) or not time_ok(r["first_seen"]) or r["first_seen"]<r["issued"] or before(r["first_seen"],r["target"]):raise ValueError("Invalid first fact")
        if r["latest_actual"] is not None and not finite(r["latest_actual"]):raise ValueError("Invalid revised fact")
    return len(d["rows"])
def summarize(rows):
    groups=defaultdict(list)
    for r in rows:
        if r["first_actual"] is not None:groups[(r["code"],r["source"],r["unit"],r["horizon"])].append(r)
    result=[]
    for (code,source,unit,h),xs in sorted(groups.items()):
        n=len(xs);errors=[abs(r["point"]-r["first_actual"]) for r in xs];baseline=[abs(r["naive"]-r["first_actual"]) for r in xs]
        mae=sum(errors)/n;naive=sum(baseline)/n
        result.append(dict(code=code,source=source,unit=unit,horizon=h,n=n,mae=mae,naive_mae=naive,better_than_naive=mae<naive,range_hits=sum(r["low"]<=r["first_actual"]<=r["high"] for r in xs),status="small_sample" if n<10 else "diagnostic"))
    return result
def advance(d,current,stamp,record_new=True):
    validate(d)
    if not time_ok(stamp):raise ValueError("Invalid build time")
    known={};new=[]
    for s in current["series"]:
        key=(s["code"],s["source"],s["unit"])
        if key in known:raise ValueError("Duplicate series")
        hist={v["period"]:v["value"] for v in s["history"] if period_ok(v["period"]) and finite(v["value"])}
        if len(hist)!=sum(period_ok(v["period"]) and finite(v["value"]) for v in s["history"]):raise ValueError("Duplicate observation")
        known[key]=hist
        if not record_new:continue
        for f in s["results"]:
            if not before(stamp,f["target"]) or f["origin"] not in hist or f["target"] in hist or not all(finite(f[k]) for k in ("point","low","high")):continue
            new.append(dict(code=s["code"],title=s["title"],source=s["source"],unit=s["unit"],origin=f["origin"],target=f["target"],horizon=f["horizon"],method=f["selected"],point=f["point"],low=f["low"],high=f["high"],naive=hist[f["origin"]],issued=stamp,first_actual=None,first_seen=None,latest_actual=None))
    rows=d["rows"];ident={identity(r) for r in rows}
    for r in rows:
        actual=known.get((r["code"],r["source"],r["unit"]),{}).get(r["target"])
        r["latest_actual"]=actual
        if r["first_actual"] is None and actual is not None and not before(stamp,r["target"]):
            r["first_actual"]=actual;r["first_seen"]=stamp
    for r in new:
        if identity(r) not in ident:rows.append(r);ident.add(identity(r))
    # Preserve pending predictions first; old evaluated rows remain in Git.
    rows.sort(key=lambda r:(r["first_actual"] is None,r["issued"],identity(r)),reverse=True)
    d["dropped"]+=max(0,len(rows)-LIMIT);d["rows"]=rows[:LIMIT];d["summary"]=summarize(d["rows"]);d["built"]=stamp
    validate(d);return d
def publish(out,previous,stamp,refresh):
    d=empty()
    path=previous/FILE
    if path.exists():
        manifest=read(previous/"data-manifest.json")
        if provenance.file_info(path)!=manifest["files"].get(FILE):raise ValueError("Forecast memory checksum mismatch")
        d=read(path)
    # Offline builds do not create or score historical forecasts as if published.
    if refresh:d=advance(d,read(out/"forecast.json"),stamp)
    else:d["built"]=stamp
    validate(d)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    return d
