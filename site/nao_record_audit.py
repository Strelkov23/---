"""Check source row identifiers without exposing project descriptions or monetary values."""
import io,json,hashlib,math
from collections import Counter
from pathlib import Path
from openpyxl import load_workbook
import nao_project_schema as base
import nao_column_audit as a
import source_transport as t
def inspect(raw,group):
    if hashlib.sha256(raw).hexdigest()!=a.HASHES[group]:raise ValueError("Edition changed")
    base.inspect(raw)
    wb=load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    try:
        out=[];seen=Counter()
        for pos,r in enumerate(wb["Лист1"].iter_rows(min_row=6,values_only=True),6):
            if all(v is None or isinstance(v,str) and not v.strip() for v in r):continue
            n=r[1]
            if isinstance(n,str) and all(v is None for v in r[2:]):
                out.append(dict(row=pos,kind="section_label"));continue
            if type(n) in (int,float) and math.isfinite(n):
                seen[n]+=1
                out.append(dict(row=pos,kind="numbered",number=n,number_type=type(n).__name__,duplicate=seen[n]>1,first_cell_type=a.cell_type(r[0]),cost_type=a.cell_type(r[8]),period_type=a.cell_type(r[6]),location_type=a.cell_type(r[7]),stage_type=a.cell_type(r[10]) if group=="implementation" else None))
            else:out.append(dict(row=pos,kind="unexpected",number_type=a.cell_type(n),first_cell_type=a.cell_type(r[0])))
        return dict(group=group,rows=out,duplicates=[dict(number=n,count=c) for n,c in seen.items() if c>1],numbered=sum(r["kind"]=="numbered" for r in out))
    finally:wb.close()
def run():
    result=[]
    for group,name in base.FILES.items():
        payload=t.download(base.ROOT+name,hosts=(base.HOST,),path_check=lambda path:path=="/images/Ekonom/"+name,max_bytes=8*1024*1024,timeout=20)
        result.append(inspect(payload.raw,group))
    return dict(schema=1,scope="row_identifiers_not_project_values",groups=result)
if __name__=="__main__":
    d=run();Path("../nao-record-audit.json").write_text(json.dumps(d,ensure_ascii=False),encoding="utf-8")
    for g in d["groups"]:
        print("NAO_RECORD_AUDIT",json.dumps(dict(group=g["group"],numbered=g["numbered"],duplicates=g["duplicates"],anomalies=[r for r in g["rows"] if r["kind"]!="numbered" or r["duplicate"] or r["number_type"]!="int" or r["first_cell_type"]!="blank"]),ensure_ascii=False),flush=True)
