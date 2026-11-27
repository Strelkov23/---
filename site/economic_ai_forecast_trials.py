"""Frozen prospective validation of tournament recommendations.
One experiment per exact series/horizon/method set; first six eligible target
periods are enrolled before their outcome, then evaluated without reselection.
"""
import json
from datetime import datetime
import provenance
import economic_ai_forecast_tournament as tournament
from economic_ai_forecast_memory import finite,period_ok,before
FILE="economic-ai-forecast-trials.json"
TARGETS=6
NOTE="Кандидат фиксируется до новых целевых периодов. Первые шесть зарегистрированных целей не заменяются при пропусках или ошибках. Подтверждение означает меньшую MAE относительно последнего значения на этой выборке, не статистическую значимость и не автоматическую смену прогноза."
def clock(s):
    t=datetime.fromisoformat(s)
    if t.tzinfo is None:raise ValueError("Missing timezone")
    return t
def group(r,methods):
    return (r["code"],r["source"],r["unit"],r["horizon"],tuple(sorted(methods)))
def empty():return dict(schema=1,note=NOTE,built=None,trials=[])
def read(p):return json.loads(p.read_text(encoding="utf-8"))
def result(trial):
    rows=trial["targets"]
    scored=[r for r in rows if r["actual"] is not None]
    if len(scored)<TARGETS:return dict(status="collecting",enrolled=len(rows),scored=len(scored),candidate_mae=None,naive_mae=None)
    candidate=sum(abs(r["candidate"]-r["actual"]) for r in scored)/TARGETS
    naive=sum(abs(r["naive"]-r["actual"]) for r in scored)/TARGETS
    return dict(status="confirmed" if candidate<naive else "not_confirmed",enrolled=len(rows),scored=len(scored),candidate_mae=candidate,naive_mae=naive)
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE:raise ValueError("Invalid trial ledger")
    if len({group(r,r["methods"]) for r in d["trials"]})!=len(d["trials"]):raise ValueError("Duplicate trial")
    for t in d["trials"]:
        started=clock(t["selected"])
        if t["candidate"]=="last" or t["candidate"] not in t["methods"] or "last" not in t["methods"] or t["selection_n"]<tournament.MIN_TARGETS:raise ValueError("Invalid candidate")
        rows=t["targets"]
        if len(rows)>TARGETS or len({r["target"] for r in rows})!=len(rows):raise ValueError("Invalid cohort")
        for r in rows:
            if not period_ok(r["origin"]) or not before(r["issued"],r["target"]) or not before(t["selected"],r["target"]) or clock(r["issued"])<started or not all(finite(r[k]) for k in ("candidate","naive")):raise ValueError("Invalid trial forecast")
            if r["actual"] is None:
                if r["seen"] is not None:raise ValueError("Invalid pending target")
            elif not finite(r["actual"]) or before(r["seen"],r["target"]) or clock(r["seen"])<clock(r["issued"]):raise ValueError("Invalid trial observation")
        if t["result"]!=result(t):raise ValueError("Invalid trial score")
    return True
def advance(d,source,stamp):
    validate(d);tournament.validate(source);now=clock(stamp)
    # First score earlier enrolments; never overwrite a first fact.
    known={tournament.key(r):r for r in source["rows"]}
    ids={group(r,r["methods"]) for r in d["trials"]}
    for s in source["summary"]:
        candidate=s["recommendation"];g=group(s,s["methods"])
        if not candidate or g in ids:continue
        d["trials"].append(dict(code=s["code"],source=s["source"],unit=s["unit"],horizon=s["horizon"],methods=s["methods"],candidate=candidate,selected=stamp,selection_n=s["n"],targets=[],result=result({"targets":[]})))
        ids.add(g)
    for t in d["trials"]:
        for r in t["targets"]:
            k=tuple(t[z] for z in ("code","source","unit","horizon"))+(r["origin"],r["target"])
            observed=known.get(k)
            if not observed:continue
            if observed["issued"]!=r["issued"] or observed["predictions"].get(t["candidate"])!=r["candidate"] or observed["predictions"].get("last")!=r["naive"]:raise ValueError("Frozen forecast changed")
            if r["actual"] is None and observed["actual"] is not None:
                r["actual"]=observed["actual"];r["seen"]=observed["seen"]
        enrolled={r["target"] for r in t["targets"]}
        candidates=sorted(source["rows"],key=lambda r:(clock(r["issued"]),r["target"],r["origin"]))
        for r in candidates:
            if len(t["targets"])>=TARGETS:break
            if group(r,r["predictions"])!=group(t,t["methods"]) or r["target"] in enrolled or not before(t["selected"],r["target"]) or clock(r["issued"])<clock(t["selected"]):continue
            # Enrollment must occur before target begins, even if a run was missed.
            if not before(stamp,r["target"]) or r["actual"] is not None or clock(r["issued"])>now:continue
            t["targets"].append(dict(origin=r["origin"],target=r["target"],issued=r["issued"],candidate=r["predictions"][t["candidate"]],naive=r["predictions"]["last"],actual=None,seen=None))
            enrolled.add(r["target"])
        t["result"]=result(t)
    d["built"]=stamp;validate(d);return d
def publish(out,previous,stamp,refresh):
    d=empty();path=previous/FILE
    if path.exists():
        manifest=read(previous/"data-manifest.json")
        if provenance.file_info(path)!=manifest["files"].get(FILE):raise ValueError("Trial checksum mismatch")
        d=read(path)
    if refresh:d=advance(d,read(out/tournament.FILE),stamp)
    else:d["built"]=stamp
    validate(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
