"""Small isolated network acceptance; no production writes or article downloads."""
import argparse,json,tempfile
from datetime import datetime,timezone
from pathlib import Path
import openalex_access as oa
import source_transport,source_journal,source_pipeline

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--catalog",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    lit=json.loads(args.catalog.read_text(encoding="utf-8"))
    by={}
    # Prefer previously available, recent DOI records in different journals.
    for p in sorted(lit["articles"],key=lambda x:x.get("published",""),reverse=True):
        if oa.normalize(p["doi"])==p["doi"] and p["doi"] and p["journal"] not in by:
            by[p["journal"]]=p
    results=[]
    with tempfile.TemporaryDirectory() as tmp:
        path=Path(tmp)/"acceptance.db"
        tj=source_journal.BufferedJournal(path);pj=source_pipeline.Buffer(path)
        source_transport.configure_journal(tj);source_pipeline.configure(pj)
        try:
            for p in list(by.values())[:3]:
                result,e=oa.retrieve(p["doi"])
                row=dict(doi=p["doi"],journal=p["journal"],result=result,reported_status=e["oa_status"] if e else None,copy_link=bool(e and (e["pdf"] or e["landing"])))
                results.append(row);print("OPENALEX_ACCEPTANCE",json.dumps(row,ensure_ascii=False))
                if result=="deferred":break
        finally:
            source_transport.configure_journal(None);source_pipeline.configure(None)
        tj.flush();pj.flush()
        stamp=datetime.now(timezone.utc).isoformat(timespec="seconds")
        j=source_journal.collect(path,stamp);s=source_pipeline.collect(path,stamp)
        report=dict(schema=1,built=stamp,scope="isolated_metadata_only",results=results,transport=source_journal.quality(j),processing=source_pipeline.quality(s))
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    if not any(r["result"]=="accepted" for r in results) or any(r["result"] in ("deferred","error") for r in results):raise SystemExit("OpenAlex network acceptance incomplete")
if __name__=="__main__":main()
