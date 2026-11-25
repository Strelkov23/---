"""Validate and expose only aggregate cross-date SME/finance diagnostics."""
import json,os,re
from collections import Counter
from pathlib import Path
from sme_finance_join import NOTE
FILE="sme-finance.json"
def empty():return dict(schema=1,status="not_loaded",note=NOTE)
def quality(d,index=None,matrix=None):
    if d.get("schema")!=1 or d.get("note")!=NOTE:raise ValueError("Паспорт")
    if d.get("status")=="not_loaded":
        if d!=empty():raise ValueError("Пустой паспорт")
        return {"sme_finance_matched":0,"sme_finance_cells":0}
    if d.get("status")!="diagnostic" or index is None or matrix is None or index.get("status")!="ready" or matrix.get("status")!="diagnostic":raise ValueError("Нет связанных источников")
    if (d["financial_year"],d["financial_fingerprint"],d["financial_sources"])!=(index["year"],index["fingerprint"],index["sources"]):raise ValueError("Другая финансовая редакция")
    if (d["sme_edition"],d["sme_archive_sha256"],d["reference_sha256"],d["national_difference"],d["quarantined"])!=(matrix["edition"],matrix["archive_sha256"],matrix["reference_sha256"],matrix["national_difference"],matrix["quarantined"]):raise ValueError("Другая редакция МСП")
    c=d["counts"];keys=("financial_index","matched_sme","not_in_sme","included","excluded_region")
    if set(c)-set(keys) or any(type(v) is not int or v<0 for v in c.values()):raise ValueError("Счётчики")
    a,b,n,i,e=(c.get(k,0) for k in keys)
    if a!=index["count"] or a!=b+n or b!=i+e:raise ValueError("Баланс охвата")
    total=0
    for kind in ("declared","reported"):
        expected={(x["region"],x["class"]):x["count"] for x in matrix[kind]}
        seen=set();matched=0
        if len({r for r,k in expected})!=d["eligible_regions"]:raise ValueError("Регионы")
        for x in d[kind]:
            key=(x["region"],x["class"])
            if key in seen or key not in expected or x["sme_total"]!=expected[key]:raise ValueError("Ячейка")
            seen.add(key)
            v=x["matched"]
            if type(v) is not int or not 0<=v<=expected[key]:raise ValueError("Охват")
            matched+=v
            for metric in ("income","expense","workers"):
                k=x[metric+"_observations"];s=x[metric+"_sum"]
                if type(k) is not int or not 0<=k<=v or (s is None)!=(k==0) or s is not None and (not isinstance(s,str) or not re.fullmatch(r"-?\d+",s) or metric=="workers" and int(s)<0):raise ValueError("Число/пропуск")
            for p,l,r in (("paired_money","income","expense"),("income_workers_pair","income","workers")):
                z=x[p];l=x[l+"_observations"];r=x[r+"_observations"]
                if type(z) is not int or not max(0,l+r-v)<=z<=min(l,r):raise ValueError("Пересечение")
        if seen!=set(expected) or matched!=i:raise ValueError("Баланс ячеек")
        total+=len(seen)
    return {"sme_finance_matched":i,"sme_finance_cells":total}
def publish(out,previous):
    index=json.loads((out/"company-index.json").read_text());matrix=json.loads((out/"sme-matrix.json").read_text());d=empty()
    for path in [previous/FILE,Path(os.environ["SME_FINANCE_REPORT"]) if os.environ.get("SME_FINANCE_REPORT") else None]:
        if path is None:continue
        try:
            if path.stat().st_size>16*1024*1024:raise ValueError("Размер отчёта")
            candidate=json.loads(path.read_text());quality(candidate,index,matrix)
            if candidate["status"]=="diagnostic":d=candidate
        except (OSError,ValueError,KeyError,TypeError,AttributeError) as e:print("SME_FINANCE_NOT_IMPORTED",str(e)[:180],flush=True)
    quality(d,index,matrix);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
