"""Exact-edition diagnostic import of NAO investment register records."""
import io,json,hashlib,re
from decimal import Decimal
from pathlib import Path
from urllib.error import HTTPError
from openpyxl import load_workbook
import nao_column_audit as audit
import nao_project_schema as base
import source_transport as transport
REGION="Ненецкий автономный округ"
GROUPS={
 "completed":("Реализованные","2025-01-01",70,66,"Общий объем финансирования, (тыс. рублей)"),
 "implementation":("Реализуемые","2025-06-04",72,64,"Общий объем финансирования, (тыс. рублей)"),
 "planned":("Планируемые","2025-01-01",25,22,"Предполагаемый объем финансирования, (тыс. рублей)"),
}
NOTE="Три отдельные редакции реестров НАО; даты по именам файлов. Общий/предполагаемый объем финансирования не означает фактические вложения. Суммы в тыс. руб. из числовых ячеек, в млн руб. точным делением на 1000. Текстовые суммы и рабочие места не интерпретируются. Номера внутри секций могут повторяться между секциями; идентификатор записи — группа и строка листа. Инициаторы, описания и контакты не публикуются."
COMMON=["№ п/п","Инициатор","Отрасль реализации проекта","Наименование проекта","Краткое описание проекта","Период реализации проекта","Место реализации проекта"]
def amount(v):
    if type(v) not in (int,float):return None
    n=Decimal(str(v))
    if not n.is_finite() or n<0:raise ValueError("Неотрицательное конечное финансирование")
    return format(n/Decimal(1000),"f")
def label(v,required=False):
    if v is None and not required:return None
    if not isinstance(v,str) or not v.strip() or len(v)>1000:raise ValueError("Текстовое поле")
    return " ".join(v.split())
def parse(raw,group):
    if hashlib.sha256(raw).hexdigest()!=audit.HASHES[group]:raise ValueError("Изменилась редакция")
    base.inspect(raw)
    status,edition,expected,expected_numeric,heading=GROUPS[group]
    wb=load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    try:
        if wb.sheetnames!=["Лист1"]:raise ValueError("Листы")
        s=wb["Лист1"];header=next(s.iter_rows(min_row=5,max_row=5,values_only=True))
        if list(header[1:8])!=COMMON or header[8]!=heading:raise ValueError("Заголовки")
        if group=="implementation" and header[10]!="Стадия реализации проекта":raise ValueError("Стадия")
        rows=[];seen=set();section=0;section_rows=[]
        for pos,r in enumerate(s.iter_rows(min_row=6,values_only=True),6):
            if all(v is None or isinstance(v,str) and not v.strip() for v in r):continue
            if group=="implementation" and isinstance(r[1],str) and all(v is None for v in r[2:]):
                section=pos;section_rows.append(pos);continue
            if type(r[1]) is not int or r[1]<1 or (section,r[1]) in seen or r[0] is not None or group=="implementation" and not section:raise ValueError("Номер/структура строки "+str(pos))
            seen.add((section,r[1]));cost=amount(r[8])
            period=str(r[6]) if type(r[6]) is int else label(r[6],True)
            rows.append(dict(group=group,region=REGION,status=status,edition=edition,record=f"{group}:{pos}",source_number=r[1],section_row=section,name=label(r[4],True),sector=label(r[3],True),location=label(r[7]),period=period,stage=label(r[10]) if group=="implementation" else None,cost_mln_rub=cost,cost_status="numeric" if cost is not None else "text_not_parsed",jobs=None,source=base.ROOT+base.FILES[group],sha256=audit.HASHES[group],sheet=s.title,row=pos))
        if section_rows!=([6,16] if group=="implementation" else []):raise ValueError("Структура секций")
        if len(rows)!=expected or sum(r["cost_mln_rub"] is not None for r in rows)!=expected_numeric:raise ValueError("Охват "+group)
        return rows
    finally:wb.close()
def quality(d):
    if d.get("schema")!=1 or d.get("note")!=NOTE or set(d["groups"])!=set(GROUPS):raise ValueError("Паспорт")
    count=numeric=0
    for group,(status,edition,expected,expected_numeric,_) in GROUPS.items():
        rows=d["groups"][group]
        if len(rows)!=expected or len({r["record"] for r in rows})!=expected or len({r["row"] for r in rows})!=expected or len({(r["section_row"],r["source_number"]) for r in rows})!=expected:raise ValueError("Охват")
        for r in rows:
            if (r["group"],r["region"],r["status"],r["edition"],r["source"],r["sha256"],r["sheet"])!=(group,REGION,status,edition,base.ROOT+base.FILES[group],audit.HASHES[group],"Лист1") or r["jobs"] is not None or type(r["row"]) is not int or r["row"]<6 or r["record"]!=f'{group}:{r["row"]}' or type(r["source_number"]) is not int or r["source_number"]<1:raise ValueError("Происхождение")
            expected_section=(6 if 6<r["row"]<16 else 16 if r["row"]>16 else -1) if group=="implementation" else 0
            if r["section_row"]!=expected_section or expected_section<0:raise ValueError("Секция")
            for field in ("name","sector"):label(r[field],True)
            v=r["cost_mln_rub"]
            if v is not None and (not isinstance(v,str) or not re.fullmatch(r"\d+(?:\.\d+)?",v) or Decimal(v)<0) or r["cost_status"]!=("numeric" if v is not None else "text_not_parsed"):raise ValueError("Финансирование")
        n=sum(r["cost_mln_rub"] is not None for r in rows)
        if n!=expected_numeric:raise ValueError("Числовой охват")
        count+=len(rows);numeric+=n
    return dict(records=count,cost_numeric=numeric,jobs_numeric=0)
def fetch_all(fetch=transport.download):
    groups={}
    for group,name in base.FILES.items():
        p=fetch(base.ROOT+name,hosts=(base.HOST,),path_check=lambda path:path=="/images/Ekonom/"+name,max_bytes=8*1024*1024,timeout=20)
        groups[group]=parse(p.raw,group)
    d=dict(schema=1,note=NOTE,groups=groups);quality(d);return d
if __name__=="__main__":
    d=fetch_all();q=quality(d)
    Path("../nao-projects-diagnostic.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    print("NAO_PROJECT_IMPORT",json.dumps(q,ensure_ascii=False),flush=True)
