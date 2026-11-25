"""Audit exact previously downloaded NAO workbook editions; no project values exported."""
import io,json,math,hashlib,re
from collections import Counter
from pathlib import Path
from datetime import datetime,date
from urllib.error import HTTPError
from openpyxl import load_workbook
import source_transport as transport
import nao_project_schema as base
HASHES={"completed":"e6856d5e9ae7547bbf42809b5c905a4b7e11b06d68468e00b53befb933415e5e","implementation":"246ecf57aa8346b8c1a30a30fda967e494104ccad3b0737d6cb03172715b8cd4","planned":"74b43c0d75f9f0e1b1a3a5b17e74d811e6f9b3db7cbb0f783f1a2a756263fa9f"}
def cell_type(v):
    if v is None or isinstance(v,str) and not v.strip():return "blank"
    if type(v) is bool:return "boolean"
    if isinstance(v,(datetime,date)):return "date"
    if type(v) in (float,int):return "number" if math.isfinite(v) else "nonfinite"
    if isinstance(v,str):
        s=v.strip()
        if s in ("-","—","–","н/д"):return "missing_marker"
        if re.fullmatch(r"\d+(?:[.,]\d+)?",s):return "numeric_text"
        return "text"
    return "other"
def inspect(raw):
    base.inspect(raw) # enforce archive and sheet bounds before detailed inspection
    wb=load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    result=[]
    try:
        for sheet in wb:
            rows=list(sheet.iter_rows(min_row=5,max_row=min(sheet.max_row,6),values_only=True))
            if not rows:raise ValueError("Missing header")
            # Row 5 independently confirmed. Row 6 may be a subheader or a data row;
            # expose only types for row 6, not its text.
            headers=[dict(column=i,header=str(v).strip()[:500] if v is not None else None) for i,v in enumerate(rows[0],1)]
            stats=[Counter() for _ in headers];row_shapes=Counter();numbered=Counter();trailing=0
            for n,row in enumerate(sheet.iter_rows(min_row=6,values_only=True),6):
                kinds=[cell_type(v) for v in row]
                for counter,kind in zip(stats,kinds):counter[kind]+=1
                shape="".join("0" if k=="blank" else "1" for k in kinds)
                row_shapes[shape]+=1
                # Only report shapes and counts, not names, contact information or amounts.
                number=row[0]
                if type(number) is int and number>0 or isinstance(number,str) and re.fullmatch(r"\d+",number.strip()):
                    numbered["numeric_first_cell"]+=1
                if all(k=="blank" for k in kinds):trailing+=1
                else:trailing=0
            result.append(dict(sheet=sheet.title,rows=sheet.max_row,columns=sheet.max_column,headers=headers,row6_types=[cell_type(v) for v in rows[1]] if len(rows)>1 else [],column_types=[dict(column=i,types=dict(sorted(c.items()))) for i,c in enumerate(stats,1)],row_shapes=dict(sorted(row_shapes.items())),numeric_first_cell=numbered["numeric_first_cell"],trailing_empty_rows=trailing))
    finally:wb.close()
    return result
def probe(fetch=transport.download):
    out=[];blocked=False
    for group,filename in base.FILES.items():
        url=base.ROOT+filename;row=dict(group=group,url=url,status="skipped" if blocked else "failed");out.append(row)
        if blocked:continue
        try:
            p=fetch(url,hosts=(base.HOST,),path_check=lambda path:path=="/images/Ekonom/"+filename,max_bytes=8*1024*1024,timeout=20)
            if p.sha256!=HASHES[group] or hashlib.sha256(p.raw).hexdigest()!=HASHES[group]:raise ValueError("Workbook edition changed; require new schema review")
            row.update(status="inspected",sha256=p.sha256,sheets=inspect(p.raw))
        except HTTPError as e:
            row.update(http_status=e.code)
            if e.code in (401,403,429):blocked=True
        except Exception as e:row.update(error=type(e).__name__,detail=str(e)[:200])
    return dict(schema=1,scope="header_and_cell_types_not_import",rows=out)
if __name__=="__main__":
    d=probe();Path("../nao-column-audit.json").write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding="utf-8")
    print("NAO_COLUMN_AUDIT",json.dumps(d,ensure_ascii=False),flush=True)
    if any(r["status"]!="inspected" for r in d["rows"]):raise SystemExit("Incomplete exact-edition inspection")
