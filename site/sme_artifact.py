"""Preflight of an SME workflow artifact before full validation during publication."""
import argparse,json,re,sys
from pathlib import Path
from datetime import date

def read(path,limit):
    if not path.is_file() or not 0<path.stat().st_size<=limit:raise ValueError("Missing or oversized artifact file")
    return json.loads(path.read_text(encoding="utf-8"))

def inspect(folder,financial_index=None):
    a=read(folder/"classification.json",32*1024*1024)
    b=read(folder/"finance-join.json",16*1024*1024)
    r=a["reconciliation"]
    if a["mode"]!="full" or type(a["xml_total"]) is not int or not 0<a["xml_total"]==a["xml_processed"]<=30000:raise ValueError("Incomplete XML pass")
    if b["schema"]!=1 or b["status"]!="diagnostic":raise ValueError("Unexpected finance schema")
    edition=a["edition"];date.fromisoformat(edition)
    if edition!=r["period"] or edition!=b["sme_edition"] or a["archive_sha256"]!=b["sme_archive_sha256"] or r["sha256"]!=b["reference_sha256"]:raise ValueError("Incompatible SME revisions")
    if any(not re.fullmatch(r"[a-f0-9]{64}",x) for x in (a["archive_sha256"],r["sha256"],b["financial_fingerprint"])):raise ValueError("Invalid fingerprints")
    if r["national_difference"]!=b["national_difference"] or a["counts"].get("quarantined",0)!=b["quarantined"]:raise ValueError("Different reconciliation")
    if not isinstance(b["declared"],list) or not isinstance(b["reported"],list) or not b["declared"] or not b["reported"]:raise ValueError("Missing finance matrix")
    if financial_index is not None:
        index=read(financial_index,8*1024*1024)
        if index.get("status")!="ready":raise ValueError("Financial index is not ready")
        if b["financial_fingerprint"]!=index.get("fingerprint") or b.get("financial_year")!=index.get("year"):raise ValueError("Artifact belongs to another financial index")
    features=int(b.get("paired_sums_version")==1)+int(isinstance(b.get("profiles",{}).get("rows"),list))
    return (edition,features)

if __name__=="__main__":
    try:
        parser=argparse.ArgumentParser()
        parser.add_argument("folder",type=Path)
        parser.add_argument("--financial-index",type=Path)
        args=parser.parse_args()
        edition,features=inspect(args.folder,args.financial_index)
        print(edition,features)
    except (OSError,ValueError,KeyError,TypeError,AttributeError) as e:
        print("SME artifact rejected:",str(e)[:180],file=sys.stderr)
        raise SystemExit(1)
