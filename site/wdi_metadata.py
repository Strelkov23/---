"""Cache provider metadata independently of observations. No AI translation."""
from datetime import datetime,timedelta,timezone
from urllib.parse import urlencode
from urllib.request import Request,urlopen
import json
URL="https://api.worldbank.org/v2/indicator"
DOC="https://datahelpdesk.worldbank.org/knowledgebase/articles/898599-indicator-api-queries"
def date(s):
    t=datetime.fromisoformat(s)
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)
def fetch(page):
    url=URL+"?"+urlencode(dict(source=2,format="json",per_page=500,page=page))
    with urlopen(Request(url,headers={"User-Agent":"EconomicsMonitor/2.0"}),timeout=20) as f:
        raw=f.read(8000001)
    if len(raw)>8000000:raise ValueError("Metadata response too large")
    return json.loads(raw)
def collect(codes,request=None):
    if request is None:request=fetch
    found={};total_pages=None
    for page in range(1,11):
        raw=request(page)
        if not isinstance(raw,list) or len(raw)!=2 or not isinstance(raw[0],dict) or not isinstance(raw[1],list):raise ValueError("Unexpected WDI metadata response")
        header,items=raw
        pages=int(header["pages"])
        if int(header["page"])!=page or not 1<=pages<=10 or (total_pages is not None and pages!=total_pages):raise ValueError("Invalid WDI metadata pagination")
        total_pages=pages
        for r in items:
            code=r.get("id")
            if code not in codes or str(r.get("source",{}).get("id"))!="2":continue
            if code in found:raise ValueError("Duplicate WDI metadata "+code)
            vals={k:r.get(k) or "" for k in ("name","unit","sourceNote","sourceOrganization")}
            if any(not isinstance(v,str) for v in vals.values()):raise ValueError("Invalid WDI metadata fields")
            found[code]=vals
        if page==pages:break
    if not found:raise ValueError("No matching WDI indicator metadata")
    return found
def sync(db,codes,stamp,refresh,out):
    db.execute("create table if not exists wdi_metadata(code text primary key,payload text,seen text)")
    db.execute("create table if not exists wdi_metadata_check(id integer primary key check(id=1),checked text,success text,status text)")
    prev=db.execute("select checked,success,status from wdi_metadata_check where id=1").fetchone()
    if refresh and (not prev or date(stamp)-date(prev[0])>=timedelta(days=7)):
        try:
            found=collect(set(codes))
            with db:
                for c,v in found.items():db.execute("insert or replace into wdi_metadata values(?,?,?)",(c,json.dumps(v,ensure_ascii=False),stamp))
                db.execute("insert or replace into wdi_metadata_check values(1,?,?,?)",(stamp,stamp,"Получено паспортов: "+str(len(found))+" из "+str(len(codes))+"; отсутствующие не удаляются"))
        except Exception as e:
            with db:db.execute("insert into wdi_metadata_check values(1,?,null,?) on conflict(id) do update set checked=excluded.checked,status=excluded.status",(stamp,"Ошибка: "+str(e)[:160]))
    check=db.execute("select checked,success,status from wdi_metadata_check where id=1").fetchone()
    result={c:dict(json.loads(v),seen=seen) for c,v,seen in db.execute("select code,payload,seen from wdi_metadata") if c in codes}
    data=dict(rows=result,checked=check[0] if check else None,success=check[1] if check else None,status=check[2] if check else "Ожидается первая автоматическая загрузка",documentation=DOC)
    (out/"wdi-metadata.json").write_text(json.dumps(data,ensure_ascii=False),encoding="utf-8")
    return data
