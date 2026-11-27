"""Incremental knowledge inventory, built by the existing scheduled publisher.
No new source claims, private records, model training or independent data writes.
"""
import json
import re
from collections import Counter
from pathlib import Path
from html import escape
from hashlib import sha256
from datetime import datetime
import provenance

FILE = "economic-ai-memory.json"
MAX_HISTORY = 90
STATES = ("ok","cached","partial","overdue","waiting","unavailable","archive")
PRIORITY = {"unavailable":0,"overdue":1,"cached":2,"partial":3,"waiting":4}
NOTE = "Реестр памяти ИИ. Изменение байтов файла не означает новое наблюдение. Новые записи каталога и публикации считаются отдельно. История сохраняется в Git; журнал содержит последние 90 сборок. Не обучение весов нейросети."

def read(folder, name):
    return json.loads((folder/name).read_text(encoding="utf-8"))

def timestamp(value):
    return isinstance(value,str) and datetime.fromisoformat(value).tzinfo is not None

def keys(rows, key):
    if not isinstance(rows,list): raise ValueError("Expected list: "+key)
    values=[r[key] for r in rows]
    if any(not isinstance(v,str) or not v for v in values) or len(values)!=len(set(values)):
        raise ValueError("Invalid or duplicate identifiers: "+key)
    return set(values)

def inventory(folder):
    reg=read(folder,"data-registry.json")["rows"]
    news=read(folder,"archive.json")
    papers=read(folder,"literature.json")["articles"]
    return {"series":keys(reg,"id"),"news":keys(news,"url"),"papers":keys(papers,"doi")}

def delta(old,new):
    return {"added":len(new-old),"missing":len(old-new),"total":len(new)}

def file_index(folder,stamp):
    # The final manifest includes this memory file; exclude it from its own inventory.
    return {k:v for k,v in provenance.create(folder,stamp)["files"].items() if k!=FILE}

def build(out,previous,stamp):
    if not timestamp(stamp):raise ValueError("Build time must have timezone")
    current=inventory(out)
    files=file_index(out,stamp)
    old_manifest=previous/"data-manifest.json"
    baseline=None
    if old_manifest.is_file():
        old=read(previous,"data-manifest.json")
        baseline=old["data_fingerprint"]
        old_files={k:v for k,v in old["files"].items() if k!=FILE}
        # Verify exact bytes for the three source inventories before comparison.
        for name in ("data-registry.json","archive.json","literature.json"):
            if provenance.file_info(previous/name)!=old_files.get(name):
                raise ValueError("Previous inventory checksum mismatch: "+name)
        prior=inventory(previous)
    else:
        old_files={};prior={k:set() for k in current}
    changes={k:delta(prior[k],v) for k,v in current.items()}
    new_files=sorted(files.keys()-old_files.keys())
    missing_files=sorted(old_files.keys()-files.keys())
    changed_files=sorted(k for k in files.keys()&old_files.keys() if files[k]!=old_files[k])
    fresh=read(out,"freshness.json")["rows"]
    keys(fresh,"id")
    states=Counter(r["state"] for r in fresh)
    if set(states)-set(STATES):raise ValueError("Unknown freshness state")
    backlog=[{k:r.get(k) for k in ("id","group","title","state","checked","success","next_check","source","href")} for r in fresh if r["state"] in PRIORITY]
    backlog.sort(key=lambda r:(PRIORITY[r["state"]],str(r["next_check"] or ""),r["id"]))
    rev=read(out,"stat-revisions.json")["builds"]
    batch=rev[0] if rev else {}
    pipeline=read(out,"source-pipeline.json")["events"]
    latest=dict(time=stamp,baseline=baseline,initial=baseline is None,changes=changes,
                new_files=new_files,missing_files=missing_files,changed_files=changed_files,
                observation_changes=batch.get("counts",{}),
                freshness={k:states[k] for k in STATES},
                recent_import_events=len(pipeline),recent_rejected=sum(e["result"]=="rejected" for e in pipeline))
    history=[]
    if (previous/FILE).is_file():
        if not old_manifest.is_file() or provenance.file_info(previous/FILE)!=old["files"].get(FILE):
            raise ValueError("Previous AI memory checksum mismatch")
        saved=read(previous,FILE);validate(saved)
        history=[r for r in saved["history"] if r["time"]!=stamp]
    data=dict(schema=1,built=stamp,note=NOTE,files=files,backlog=backlog,
              latest=latest,history=[latest]+history[:MAX_HISTORY-1])
    validate(data)
    return data

def validate(data):
    if data["schema"]!=1 or data["note"]!=NOTE or not timestamp(data["built"]) or not data["history"] or len(data["history"])>MAX_HISTORY or data["latest"]!=data["history"][0] or data["built"]!=data["latest"]["time"]:
        raise ValueError("Invalid AI memory")
    if len({r["time"] for r in data["history"]})!=len(data["history"]):raise ValueError("Duplicate memory snapshots")
    for item in data["history"]:
        if not timestamp(item["time"]):raise ValueError("Invalid time")
        for d in item["changes"].values():
            if set(d)!={"added","missing","total"} or any(type(v) is not int or v<0 for v in d.values()) or d["added"]>d["total"]:raise ValueError("Invalid memory counts")
        if set(item["freshness"])!=set(STATES) or any(type(v) is not int or v<0 for v in item["freshness"].values()):raise ValueError("Invalid source totals")
        if not 0<=item["recent_rejected"]<=item["recent_import_events"]:raise ValueError("Invalid import totals")
    if FILE in data["files"] or any(not provenance.valid_path(k) or not re.fullmatch(r"[a-f0-9]{64}",v["sha256"]) or type(v["bytes"]) is not int or v["bytes"]<0 for k,v in data["files"].items()):
        raise ValueError("Invalid file inventory")
    keys(data["backlog"],"id")
    if any(r["state"] not in PRIORITY for r in data["backlog"]) or len(data["backlog"])!=sum(data["latest"]["freshness"][k] for k in PRIORITY):
        raise ValueError("Invalid backlog")
    return {"memory_files":len(data["files"]),"memory_snapshots":len(data["history"]),"memory_backlog":len(data["backlog"])}

def publish(out,previous,stamp):
    data=build(out,previous,stamp)
    (out/FILE).write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    return data
