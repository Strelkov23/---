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
        require(d["schema"]=="iv-physical-v1","Physical schema");require(d.get("status") in ("manual_verification_pending","mixed_document_recheck"),"Physical verification status");unique(d["companies"],"id");count=0
        for c in d["companies"]:
            require(https(c["source"]),"Missing corporate source")
            require(c.get("verification") in ("pending","source_rechecked","partial"),"Corporate verification status not supported")
            if c["verification"] in ("source_rechecked","partial"):require(bool(c.get("verification_date")) and bool(c.get("verification_method")),"Missing document recheck metadata")
            unique(c["metrics"],"id");unique(c["rows"],"year")
            for r in c["rows"]:
                require(type(r["year"]) is int,"Invalid corporate year")
                if c["verification"]=="partial":require(r.get("verification") in ("source_rechecked","secondary_rechecked","pending"),"Invalid row verification")
                else:require("verification" not in r,"Unexpected row verification")
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
def verify_recheck(physical,trade_data,evidence):
    """Verify numeric correspondence to the dated transcription ledger, not source truth."""
    require(evidence.get("schema")=="iv-source-recheck-v1","Invalid recheck ledger schema")
    checked=evidence.get("checked")
    require(isinstance(checked,str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}",checked),"Invalid recheck date")
    corporate=evidence["corporate"]
    verified={c["id"]:c for c in physical["companies"] if c.get("verification") in ("source_rechecked","partial")}
    require(set(verified)==set(corporate),"Corporate status and recheck ledger disagree")
    corporate_count=0
    for cid,c in verified.items():
        record=corporate[cid]
        keys=record.get("keys",["nuclear_generation"] if cid=="rosenergoatom" else [])
        require(keys and len(keys)==len(set(keys)) and set(keys)=={m["id"] for m in c["metrics"]},"Corporate recheck metric mismatch: "+cid)
        require(c.get("verification_date")==checked,"Corporate recheck date mismatch: "+cid)
        require(bool(record.get("method")) and bool(record.get("reference")),"Missing corporate recheck reference: "+cid)
        sources=record.get("sources",[record.get("source")])
        require(bool(sources) and all(https(s) for s in sources) and c["source"] in sources,"Corporate recheck source mismatch: "+cid)
        rows=record["rows"]
        require(all(len(r)==len(keys)+1 and type(r[0]) is int and all(finite(v) and v>=0 for v in r[1:]) for r in rows),"Invalid corporate recheck row: "+cid)
        expected={r[0]:tuple(r[1:]) for r in rows}
        require(len(expected)==len(rows),"Duplicate corporate recheck year: "+cid)
        selected=[r for r in c["rows"] if c["verification"]=="source_rechecked" or r.get("verification")=="source_rechecked"]
        actual={r["year"]:tuple(r.get(k) for k in keys) for r in selected}
        require(len(actual)==len(selected) and actual==expected,"Corporate recheck numbers differ: "+cid)
        corporate_count+=len(rows)*len(keys)
    secondary=evidence.get("secondary_corporate",{})
    secondary_companies={c["id"]:c for c in physical["companies"] if any(r.get("verification")=="secondary_rechecked" for r in c["rows"])}
    require(set(secondary)==set(secondary_companies),"Secondary corporate ledger mismatch")
    secondary_count=0
    for cid,c in secondary_companies.items():
        record=secondary[cid]; keys=record["keys"]; rows=record["rows"]
        require(c["verification"]=="partial" and len(keys)==len(set(keys)) and set(keys)=={m["id"] for m in c["metrics"]},"Secondary metric/status mismatch")
        require(len(set(record["sources"]))>=2 and all(https(s) for s in record["sources"]) and https(record["original_unavailable"]) and bool(record["reference"]),"Secondary source metadata")
        require(all(len(r)==len(keys)+1 and type(r[0]) is int and all(finite(v) and v>=0 for v in r[1:]) for r in rows),"Invalid secondary row")
        selected=[r for r in c["rows"] if r.get("verification")=="secondary_rechecked"]
        expected={r[0]:tuple(r[1:]) for r in rows}
        actual={r["year"]:tuple(r.get(k) for k in keys) for r in selected}
        require(len(expected)==len(rows) and len(actual)==len(selected) and actual==expected and all(r.get("source") in record["sources"] for r in selected),"Secondary ledger numbers/source differ")
        secondary_count+=len(rows)*len(keys)
    t=evidence["trade"]
    require(t["source"]==trade.URL and bool(t.get("reference")) and bool(t.get("method")),"Trade recheck source mismatch")
    expected=[]
    for yr,values in sorted(t["rows"].items()):
        require(re.fullmatch(r"\d{4}",yr) and 1<=len(values)<=12,"Invalid recheck trade year")
        for i,pair in enumerate(values,1):
            require(len(pair)==2 and all(finite(v) and v>=0 for v in pair),"Invalid trade recheck value")
            expected.append({"period":f"{yr}-{i:02}","us_exports":pair[0],"us_imports":pair[1]})
    require(bool(expected) and trade.seed()==expected,"Trade seed differs from dated recheck ledger")
    require(trade_data.get("seed_verification")=="documented_manual" and trade_data.get("seed_recheck_date")==checked and trade_data.get("seed_recheck_count")==len(expected)*2,"Trade recheck metadata mismatch")
    if not trade_data["last_success"]:
        require(trade_data["rows"]==expected,"Published manual trade rows differ from recheck ledger")
    # Machine-loaded observations may legitimately revise the seed.
    return {"corporate_values":corporate_count,"secondary_corporate_values":secondary_count,"trade_seed_values":len(expected)*2}

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
    ledger=read(Path(__file__).resolve().parent.parent/"IV_SOURCE_RECHECK.json")
    recheck=verify_recheck(read(out/"independent-physical.json"),read(out/"independent-trade.json"),ledger)
    return {"assets":len(ASSETS),"observations_by_dataset":counts,"document_recheck":recheck,"warnings":warnings}
if __name__=="__main__":
    import sys
    from datetime import date
    print("IV release contract:",json.dumps(check(Path(sys.argv[1]),Path(sys.argv[2]),date.today().year),ensure_ascii=False))
