"""Bounded, read-only schema probe of three linked NAO project workbooks."""
import io,json,zipfile
from pathlib import Path
from urllib.error import HTTPError
from datetime import datetime,timezone
import source_transport as t
from openpyxl import load_workbook
HOST="adm-nmar.ru"
ROOT="https://"+HOST+"/images/Ekonom/"
FILES={"completed":"Reestr_1_01012025.xlsx","implementation":"Reestr_2_04062025.xlsx","planned":"Reestr_3_01012025.xlsx"}
def inspect(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        entries=z.infolist()
        if len(entries)>2000 or sum(x.file_size for x in entries)>64*1024*1024:raise ValueError("Workbook expansion budget")
    wb=load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    result=[]
    try:
        if not 1<=len(wb.sheetnames)<=20:raise ValueError("Sheet count")
        for sheet in wb:
            if not sheet.max_row or not sheet.max_column or sheet.max_row>50000 or sheet.max_column>200:raise ValueError("Worksheet bounds")
            # Text-only header candidates; do not publish project names or personal contacts.
            # Restrict capture to rows with at least two explicit field labels.
            labels=[]
            import re
            for n,row in enumerate(sheet.iter_rows(min_row=1,max_row=min(sheet.max_row,12),max_col=min(sheet.max_column,80),values_only=True),1):
                fields=[dict(column=i,text=v.strip()[:250]) for i,v in enumerate(row,1) if isinstance(v,str) and len(v)<=250 and re.search(r"наименование|стоимость|объ[её]м инвестиц|рабочих мест|срок|статус|стади|номер|муниципальн|место реализац|отрасл|инвестор",v,re.I)]
                if len(fields)>=2:labels.append(dict(row=n,fields=fields))
            result.append(dict(sheet=sheet.title,rows=sheet.max_row,columns=sheet.max_column,header_candidates=labels))
    finally:wb.close()
    return result
def probe(fetch=t.download):
    rows=[];blocked=False
    for group,name in FILES.items():
        url=ROOT+name;row=dict(group=group,url=url,status="skipped" if blocked else "failed");rows.append(row)
        if blocked:continue
        try:
            payload=fetch(url,hosts=(HOST,),path_check=lambda p:p=="/images/Ekonom/"+name,max_bytes=8*1024*1024,timeout=20)
            row.update(status="inspected",sha256=payload.sha256,sheets=inspect(payload.raw))
        except HTTPError as e:
            row.update(http_status=e.code)
            if e.code in (401,403,429):blocked=True
        except Exception as e:row.update(error=type(e).__name__,detail=str(e)[:200])
    return dict(schema=1,scope="schema_only_not_import",checked=datetime.now(timezone.utc).isoformat(),rows=rows)
if __name__=="__main__":
    d=probe();Path("../nao-project-schema.json").write_text(json.dumps(d,ensure_ascii=False,indent=2))
    print("NAO_PROJECT_SCHEMA",json.dumps(d,ensure_ascii=False),flush=True)
    if any(r["status"]!="inspected" for r in d["rows"]):raise SystemExit("Incomplete workbook inspection")
