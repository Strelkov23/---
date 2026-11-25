"""Read-only diagnostic of the confirmed 2025 Rosstat cost workbook.
Only sheet names, dimensions, bounded textual headings and period labels;
no numeric economic observations are exported or imported.
"""
import json,argparse,re,io
from pathlib import Path
import xlrd
from rosstat_network_probe import fetch
URL="https://rosstat.gov.ru/storage/mediabank/Zatraty_god_2025.xls"
def inspect(raw):
    if raw[:8]!=bytes.fromhex("d0cf11e0a1b11ae1"):raise ValueError("Not an XLS workbook")
    book=xlrd.open_workbook(file_contents=raw,on_demand=True)
    try:
        if book.nsheets>40:raise ValueError("Too many sheets")
        sheets=[]
        for sheet in book.sheets():
            if sheet.nrows>4000 or sheet.ncols>150:raise ValueError("Unexpected sheet dimensions")
            rows=[]
            for i in range(min(35,sheet.nrows)):
                cells=[]
                for j in range(min(100,sheet.ncols)):
                    cell=sheet.cell(i,j)
                    if cell.ctype==xlrd.XL_CELL_TEXT:
                        v=" ".join(cell.value.split())[:350]
                        if v and (re.search(r"[а-яёa-z]",v,re.I) or re.fullmatch(r"20[0-2]\d",v)):
                            cells.append({"column":j+1,"label":v})
                    elif cell.ctype==xlrd.XL_CELL_NUMBER and i<12 and cell.value.is_integer() and 1995<=cell.value<=2026:
                        cells.append({"column":j+1,"possible_year":int(cell.value)})
                if cells:rows.append({"row":i+1,"cells":cells})
            sheets.append({"name":sheet.name,"rows":sheet.nrows,"columns":sheet.ncols,"headings":rows})
        return sheets
    finally:book.release_resources()
def main():
    ap=argparse.ArgumentParser();ap.add_argument("--output",required=True,type=Path);a=ap.parse_args()
    payload=fetch(URL,"workbook")
    report={"schema":1,"url":URL,"final_url":payload.final_url,"sha256":payload.sha256,"sheets":inspect(payload.raw)}
    a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print("SHEETS",json.dumps([{"name":s["name"],"rows":s["rows"],"columns":s["columns"]} for s in report["sheets"]],ensure_ascii=False))
if __name__=="__main__":main()
