"""Deterministic agent coordinator for every scheduled economic build.
Agents are bounded analytical routines, not autonomous LLM processes.
"""
import json,math
from collections import Counter
from datetime import datetime
from urllib.parse import urlsplit
FILE="economic-ai-agents.json"
NOTE="Автоматический обзор по опубликованным наборам. Агенты — проверяемые программные модули, не фоновые языковые модели. Статус сборки не подтверждает истинность источника."

def read(out,name):
    return json.loads((out/name).read_text(encoding="utf-8"))
def finite(x):return type(x) in (float,int) and math.isfinite(x)
def safe_url(v):
    try:
        p=urlsplit(v)
        return p.scheme in ("https","http") and bool(p.hostname) and p.username is None and p.password is None
    except (ValueError,TypeError):return False
def doc(r,kind):
    title=r.get("title");date=r.get("published")
    url=r.get("url") if kind=="news" else "https://doi.org/"+str(r.get("doi",""))
    if not isinstance(title,str) or not title.strip() or not safe_url(url) or kind=="papers" and not str(r.get("doi","")).startswith("10."):return None
    return dict(title=title[:350],date=str(date or "")[:10],source=str(r.get("source") if kind=="news" else r.get("journal") or "")[:200],url=url,kind=kind)
def latest(rows,kind,old,limit=8):
    key="url" if kind=="news" else "doi"
    result=[]
    for r in sorted(rows,key=lambda x:(str(x.get("published") or ""),str(x.get(key) or "")),reverse=True):
        if r.get(key) in old:continue
        d=doc(r,kind)
        if d:result.append(d)
        if len(result)==limit:break
    return result
def agent(name,state,metrics,links,items=None):
    return dict(id=name,state=state,metrics=metrics,links=links,items=items or [])
def build(out,previous,stamp,refresh):
    if datetime.fromisoformat(stamp).tzinfo is None:raise ValueError("Invalid build time")
    memory=read(out,"economic-ai-memory.json");m=memory["latest"]
    discovery=read(out,"economic-ai-discovery.json");dr=discovery["rows"]
    ready=[r for r in dr.values() if r["values"] and r["status"] in ("ok","error")]
    forecast=read(out,"economic-ai-forecast-memory.json")
    fs=forecast["summary"]
    assessed=[r for r in fs if r["n"]>=10]
    # Diagnostics only: no tuning against the future evaluation set.
    flags=[{"code":r["code"],"horizon":r["horizon"],"n":r["n"],"mae":r["mae"],"naive_mae":r["naive_mae"],"unit":r["unit"],"action":"review_model" if r["mae"]>=r["naive_mae"] else "continue_evaluation"} for r in assessed if finite(r["mae"]) and finite(r["naive_mae"])]
    news=read(out,"archive.json");papers=read(out,"literature.json")["articles"]
    baseline=not m["initial"]
    old_news=set();old_papers=set()
    if baseline:
        old_news={r["url"] for r in read(previous,"archive.json")}
        old_papers={r["doi"] for r in read(previous,"literature.json")["articles"]}
    report_items=latest(news,"news",old_news)+latest(papers,"papers",old_papers)
    groups=Counter(r["group"] for r in read(out,"data-registry.json")["rows"] if r["count"]>0)
    agents=[
      agent("coverage","attention" if memory["backlog"] else "ok",{"series_with_values":sum(groups.values()),"groups":dict(groups),"catalogue_changes":m["changes"]["series"],"observation_changes":m["observation_changes"]},["data-registry.html","stat-revisions.html"]),
      agent("discovery","attention" if discovery["catalog_status"]=="error" else "ok" if ready else "waiting",{"candidates":len(dr),"available":len(ready),"observations":sum(len(r["values"]) for r in ready),"cached_after_error":sum(r["status"]=="error" for r in ready)},["economic-ai-discovery.json"]),
      agent("quality","attention" if memory["backlog"] or m["recent_rejected"] else "ok",{"freshness":m["freshness"],"backlog":len(memory["backlog"]),"recent_rejected":m["recent_rejected"]},["freshness.html","source-pipeline.html"],[{k:r.get(k) for k in ("id","title","state","next_check")} for r in memory["backlog"][:10]]),
      agent("research","ok" if news or papers else "waiting",{"news":m["changes"]["news"],"papers":m["changes"]["papers"],"baseline_available":baseline},["index.html","papers.html"],report_items),
      agent("forecast","attention" if any(r["action"]=="review_model" for r in flags) else "ok" if assessed else "waiting",{"frozen":len(forecast["rows"]),"scored":sum(r["first_actual"] is not None for r in forecast["rows"]),"adequate_sample_groups":len(assessed)},["forecast.html","economic-ai-forecast-memory.json"],flags[:30])]
    search=read(out,"economic-search-audit.json")
    agents.append(agent("search","attention" if any(r["status"] in ("error","blocked") for r in search["sources"]) else "waiting" if any(r["status"]=="waiting" for r in search["sources"]) else "ok",{"counts":search["counts"],"terms":search["terms"],"index_bytes":search["index_bytes"],"baseline_available":search["baseline_available"]},["economic-search.html","economic-search-audit.json"],search["sources"]))
    data=dict(schema=1,built=stamp,mode="scheduled_refresh" if refresh else "offline_build",note=NOTE,agents=agents)
    validate(data)
    return data
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE or d["mode"] not in ("scheduled_refresh","offline_build") or datetime.fromisoformat(d["built"]).tzinfo is None:raise ValueError("Invalid agent report")
    if [r["id"] for r in d["agents"]]!=["coverage","discovery","quality","research","forecast","search"]:raise ValueError("Agent registry")
    for a in d["agents"]:
        if a["state"] not in ("ok","attention","waiting") or not isinstance(a["metrics"],dict) or not isinstance(a["items"],list):raise ValueError("Agent result")
    for d in d["agents"][3]["items"]:
        if not safe_url(d["url"]) or d["kind"] not in ("news","papers"):raise ValueError("Unsafe document")
    return True
def publish(out,previous,stamp,refresh):
    data=build(out,previous,stamp,refresh)
    (out/FILE).write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    return data
