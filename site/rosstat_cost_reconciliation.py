"""Read-only monetary reconciliation; never publishes observations."""
import argparse,collections,json
from pathlib import Path
import xlrd
import rosstat_workbooks as w
from rosstat_network_probe import fetch
from rosstat_cost_schema import URL
def main():
    ap=argparse.ArgumentParser();ap.add_argument("--output",type=Path,required=True);args=ap.parse_args()
    payload=fetch(URL,"workbook")
    book=xlrd.open_workbook(file_contents=payload.raw,on_demand=True)
    summary=[];diagnostics=[]
    try:
        for s in book.sheets():
            if s.nrows>4000 or s.ncols>150:raise ValueError("Unexpected size")
            prior=len(diagnostics)
            rows=w.cost_amount_sheet([s.row_values(i) for i in range(s.nrows)],s.name,URL,2026,diagnostics)
            summary.append(dict(sheet=s.name,accepted_observations=len(rows),years=sorted(set(r["year"] for r in rows)),excluded_rows=len(diagnostics)-prior))
            if rows:w.quality(dict(schema=1,files=[dict(url=URL,group="cost",success="2026-11-25",sha256=payload.sha256,rows=rows)]))
    finally:book.release_resources()
    report=dict(schema=1,scope="diagnostic_only",sha256=payload.sha256,sheets=summary,excluded=diagnostics)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False),encoding="utf-8")
    print("RECONCILIATION_SUMMARY",json.dumps(summary,ensure_ascii=False))
    print("RECONCILIATION_EXCLUSIONS",json.dumps(diagnostics,ensure_ascii=False))
if __name__=="__main__":main()
