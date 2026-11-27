"""Search coverage audit, using archive identities rather than file changes."""
import json
from datetime import datetime
import provenance
import economic_abstracts
FILE="economic-search-audit.json"
KINDS=("tool","series","news","paper","discovered","external","web")
NOTE="Контроль охвата собственного поисковика. Новые записи индекса не равны новым публикациям или статистическим наблюдениям. Хеш подтверждает совпадение файлов, а не истинность сведений."
def read(path):return json.loads(path.read_text(encoding="utf-8"))
def identities(index):
    rows={k:set() for k in KINDS}
    for r in index["docs"]:
        if r["kind"] not in rows or not isinstance(r["href"],str) or not r["href"] or r["href"] in rows[r["kind"]]:raise ValueError("Invalid search identity")
        rows[r["kind"]].add(r["href"])
    return rows
def diff(current,previous):
    return {k:dict(total=len(current[k]),added=len(current[k]-previous[k]),removed=len(previous[k]-current[k])) for k in KINDS}
def abstract_coverage(index,papers,previous,stamp):
    indexed={r["code"] for r in index["docs"] if r["kind"]=="paper" and r.get("abstract_license")==economic_abstracts.LICENSE}
    eligible={r["doi"] for r in papers if economic_abstracts.eligible(r,stamp)}
    if not indexed<=eligible:raise ValueError("Abstract index includes unqualified material")
    prior={r["code"] for r in previous["docs"] if r["kind"]=="paper" and r.get("abstract_license")==economic_abstracts.LICENSE} if previous is not None else set()
    return dict(catalogue=len(papers),eligible=len(eligible),indexed=len(indexed),added=len(indexed-prior),removed=len(prior-indexed),baseline_available=previous is not None)
def validate(data):
    if data["schema"]!=1 or data["note"]!=NOTE or datetime.fromisoformat(data["built"]).tzinfo is None or type(data["baseline_available"]) is not bool:raise ValueError("Invalid search audit")
    if set(data["counts"])!=set(KINDS):raise ValueError("Missing category")
    for v in data["counts"].values():
        if set(v)!={"total","added","removed"} or any(type(x) is not int or x<0 for x in v.values()) or v["added"]>v["total"]:raise ValueError("Invalid counts")
    if type(data["terms"]) is not int or data["terms"]<0 or type(data["index_bytes"]) is not int or data["index_bytes"]<0:raise ValueError("Invalid index metrics")
    if [r["id"] for r in data["sources"]]!=["wdi","arxiv","feds"]:raise ValueError("Unknown source")
    for r in data["sources"]:
        if r["status"] not in ("waiting","ok","error","blocked") or type(r["records"]) is not int or r["records"]<0:raise ValueError("Invalid source status")
        for k in ("checked","success"):
            if r[k] is not None and datetime.fromisoformat(r[k]).tzinfo is None:raise ValueError("Invalid source date")
    v=data["abstracts"]
    if type(v["baseline_available"]) is not bool or any(type(v[k]) is not int or v[k]<0 for k in ("catalogue","eligible","indexed","added","removed")) or not v["added"]<=v["indexed"]<=v["eligible"]<=v["catalogue"]:raise ValueError("Invalid abstract coverage")
    return True
def build(out,previous,stamp):
    index=read(out/"economic-search-index.json");current=identities(index)
    old=previous/"economic-search-index.json";baseline=old.exists()
    prior={k:set() for k in KINDS};old_index=None
    if baseline:
        manifest=read(previous/"data-manifest.json")
        if provenance.file_info(old)!=manifest["files"].get(old.name):raise ValueError("Search baseline integrity failure")
        old_index=read(old);prior=identities(old_index)
    wdi=read(out/"economic-ai-discovery.json");arxiv=read(out/"economic-external-research.json");feds=read(out/"economic-web-crawl.json")
    sources=[
        dict(id="wdi",title="World Bank WDI",status=wdi["catalog_status"],checked=wdi["catalog_checked"],success=wdi["catalog_success"],records=len(current["discovered"])),
        *[dict(id=k,title=title,status=d["status"],checked=d["checked"],success=d["success"],records=len(current[kind])) for k,title,d,kind in (("arxiv","arXiv",arxiv,"external"),("feds","Federal Reserve FEDS",feds,"web"))]
    ]
    data=dict(schema=1,note=NOTE,built=stamp,baseline_available=baseline,counts=diff(current,prior),terms=len(index["postings"]),index_bytes=(out/"economic-search-index.json").stat().st_size,sources=sources,abstracts=abstract_coverage(index,read(out/"literature.json")["articles"],old_index,stamp))
    validate(data);return data
def publish(out,previous,stamp):
    d=build(out,previous,stamp)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    return d
