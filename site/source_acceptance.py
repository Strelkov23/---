"""One-off, read-only network acceptance of already registered adapters.
No production database, no raw files or financial row data in the report.
Requests follow the existing transport policy; no retries or fallback hosts.
"""
import argparse,json,tempfile
from datetime import datetime,timezone
from pathlib import Path
import series,wdi_metadata,finance_workbooks
import source_registry as registry
import source_transport as transport
import source_journal as journal
import source_pipeline as pipeline

def stamp():return datetime.now(timezone.utc).isoformat(timespec="seconds")

def finance_candidate(snapshot):
    candidates=[r for r in snapshot["years"] if r.get("success") and r.get("rows") and registry.identify(r["url"]).id=="fns_finance"]
    if not candidates:raise ValueError("No accepted workbook to compare")
    return max(candidates,key=lambda r:r["year"])

def finance_validate(prior,raw):
    rows=finance_workbooks.parse(raw,prior["year"],prior["url"])
    if not rows or finance_workbooks.observation_keys(prior["rows"])-finance_workbooks.observation_keys(rows):
        raise ValueError("Accepted workbook positions missing")
    return rows

def probe(archive):
    old=json.loads((archive/"finance-workbooks.json").read_text(encoding="utf-8"))
    catalog=json.loads((archive/"catalog.json").read_text(encoding="utf-8"))
    code="NY.GDP.MKTP.KD.ZG"
    if code not in catalog:raise ValueError("Missing reference indicator")
    prior=finance_candidate(old)
    results=[]
    with tempfile.TemporaryDirectory() as directory:
        db=Path(directory)/"probe.db"
        tb=journal.BufferedJournal(db);pb=pipeline.Buffer(db)
        transport.configure_journal(tb);pipeline.configure(pb)
        try:
            def run(source,action):
                try:
                    count=action()
                    if type(count) is not int or count<=0:raise ValueError("Empty validated response")
                    results.append(dict(source=source,status="accepted",count=count))
                except Exception as error:
                    results.append(dict(source=source,status="failed",reason=type(error).__name__))
            def annual():
                _,values,error,_=series.retrieve(code)
                if error or not values:raise ValueError("Annual adapter rejected response")
                n=sum(v is not None for v in values.values())
                if not n:raise ValueError("No numeric annual observations")
                return n
            def metadata():
                found=pipeline.parsed(wdi_metadata.URL,"acceptance",lambda:wdi_metadata.collect(set(catalog)))
                if code not in found:raise ValueError("Reference metadata missing")
                return len(found)
            def workbook():
                return len(pipeline.parsed(prior["url"],str(prior["year"]),lambda:finance_validate(prior,finance_workbooks.fetch(prior["url"]))))
            run("wdi_series",annual)
            run("wdi_metadata",metadata)
            run("fns_finance",workbook)
        finally:
            transport.configure_journal(None);pipeline.configure(None)
        tb.flush();pb.flush()
        built=stamp()
        tj=journal.collect(db,built);pj=pipeline.collect(db,built)
        journal.quality(tj);pipeline.quality(pj)
    return dict(schema=1,built=built,scope="isolated_network_probe_not_production_import",results=results,transport=tj,processing=pj)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--archive",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    report=probe(args.archive)
    args.output.write_text(json.dumps(report,ensure_ascii=False,allow_nan=False,indent=2),encoding="utf-8")
    for row in report["results"]:print("SOURCE_ACCEPTANCE",json.dumps(row,ensure_ascii=False))
    if any(r["status"]!="accepted" for r in report["results"]):raise SystemExit("Some adapters did not pass live acceptance")
if __name__=="__main__":main()
