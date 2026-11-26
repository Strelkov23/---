"""Release contract for IV datasets. Validates integrity, not source truth."""
import hashlib,json,math,re
from pathlib import Path
import independent_trade as trade
import independent_ember as ember

ASSETS=["iv-lab.html","independent-statistics.html","iv-comparison.html","iv-lab-nav.js","iv-scenario-store.js","iv-energy-structure.js","iv-origin.js","iv-ember.js","iv-methods.js","iv-tech.js","iv-trajectory.js","iv-allocation.js","iv-workspaces.js","iv-physical-composite.js","iv-physical.js","iv-comparison.js","iv-evidence.js","iv-policy.js","iv-prices.js","iv-labour.js","iv-trade.js","iv-pulse.js","iv-lab.js"]
DATASETS=["independent-trade.json","independent-ember.json","independent-prices.json","independent-labour.json","independent-physical.json"]
def require(ok,msg):
    if not ok:raise ValueError(msg)
def finite(v):return type(v) in (int,float) and math.isfinite(v)
def sha(v):return isinstance(v,str) and re.fullmatch(r"[0-9a-f]{64}",v) is not None
def period(p):return isinstance(p,str) and re.fullmatch(r"\d{4}-(?:0[1-9]|1[0-2])",p) is not None
def https(s):return isinstance(s,str) and s.startswith("https://")
def unique(rows,key):
    ids=[r[key] for r in rows];require(len(ids)==len(set(ids)),"Duplicate "+key)
def read(p):return json.loads(p.read_text(encoding="utf-8"),parse_constant=lambda x:(_ for _ in ()).throw(ValueError("Nonfinite JSON: "+x)))
def verify_trade(d,old,year):
    require(d["schema"]=="iv-trade-v1" and d["source"]==trade.URL,"Trade schema/source")
    trade.validate(d["rows"])
    require(all(int(r["period"][:4])<=year for r in d["rows"]),"Future trade year")
    require(bool(d["last_success"])==sha(d["source_sha256"]),"Trade provenance")
    require(d["status"] in ("manual_seed","seed_after_error","cached","cached_after_error","downloaded"),"Trade status")
    if d["status"] in ("cached","cached_after_error","downloaded"):require(bool(d["last_success"]),"Missing successful trade fetch")
    if old:
        require({r["period"] for r in old["rows"]}<={r["period"] for r in d["rows"]},"Trade periods removed")
        require(not old.get("last_success") or bool(d["last_success"]),"Trade machine cache lost")
        require(d["revision_count"]>=old.get("revision_count",0),"Trade revision log lost")
    require(type(d["revision_count"]) is int and d["revision_count"]>=len(d["revisions"]),"Trade revision count")
    for r in d["revisions"]:
        require(period(r["period"]) and r["metric"] in ("us_exports","us_imports") and finite(r["before"]) and finite(r["after"]) and r["before"]!=r["after"] and sha(r["new_sha"]) and (r["old_sha"] is None or sha(r["old_sha"])),"Invalid trade revision")
    return len(d["rows"])*2
def verify_ember(d,old,year):
    require(d["schema"]=="iv-ember-v1" and d["source"]==ember.URL and d["unit"]=="TWh","Ember schema/source/unit")
    rows=d["rows"];unique(rows,"year")
    require(bool(rows)==bool(d["success"])==sha(d["sha256"]),"Ember provenance")
    for r in rows:
        require(type(r["year"]) is int and 1992<=r["year"]<year and bool(r["values"]),"Invalid Ember year")
        require(set(r["values"])<=set(ember.SOURCES.values()) and all(finite(v) and v>=0 for v in r["values"].values()),"Invalid Ember value")
    if rows:require(sum("total" in r["values"] for r in rows)>=5,"Ember coverage")
    if old:require(ember.keys(old["rows"])<=ember.keys(rows),"Ember observations removed")
    return len(ember.keys(rows))
def verify_manual(d,kind):
    if kind=="physical":
        require(d["schema"]=="iv-physical-v1","Physical schema");unique(d["companies"],"id");count=0
        for c in d["companies"]:
            require(https(c["source"]),"Missing corporate source")
            unique(c["metrics"],"id");unique(c["rows"],"year")
            for r in c["rows"]:
                require(type(r["year"]) is int,"Invalid corporate year")
                for m in c["metrics"]:
                    v=r.get(m["id"])
                    if v is not None:require(finite(v) and v>=0,"Invalid physical value");count+=1
        return count
    require(d["schema"]=="iv-"+kind+"-v1","Manual schema")
    rows=d["rows"];unique(rows,"period")
    for r in rows:
        require(period(r["period"]),"Invalid manual period")
        if kind=="labour":require(finite(r["value"]) and r["value"]>=0 and https(d["sources"][r["source"]]["url"]),"Invalid labour observation")
        else:
            require(https(r["url"]) and finite(r["level"]) and r["level"]>0 and https(d["official_source"]),"Invalid price observation")
            require(all(len(r["official"][k])==3 and all(finite(v) and v>0 for v in r["official"][k]) for k in ("mom","yoy","ytd")),"Invalid official price index")
    return len(rows)
def check(out,previous,year):
    manifest=read(out/"data-manifest.json")["files"];counts={};warnings=[]
    for name in ASSETS:require((out/name).is_file() and (out/name).stat().st_size>0,"Missing IV asset: "+name)
    for name in DATASETS:
        raw=(out/name).read_bytes();entry=manifest[name]
        require(entry=={"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)},"IV manifest mismatch: "+name)
        d=read(out/name);old=read(previous/name) if (previous/name).is_file() else None
        kind=name.removeprefix("independent-").removesuffix(".json")
        if kind=="trade":
            counts[kind]=verify_trade(d,old,year)
            if not d["last_success"] or d["error"]:warnings.append("Trade: machine refresh not confirmed or latest attempt failed")
        elif kind=="ember":
            counts[kind]=verify_ember(d,old,year)
            if not d["rows"] or d["error"]:warnings.append("Ember: no archived data or latest attempt failed")
        else:
            counts[kind]=verify_manual(d,kind)
            warnings.append(kind+": structural validation only; manual source transcription is not independently certified")
    return {"assets":len(ASSETS),"observations_by_dataset":counts,"warnings":warnings}
if __name__=="__main__":
    import sys
    from datetime import date
    print("IV release contract:",json.dumps(check(Path(sys.argv[1]),Path(sys.argv[2]),date.today().year),ensure_ascii=False))
