"""Retrieve WDI data, retaining every changed observation, including withdrawals."""
import json
import math
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen

SERIES = {
    "NV.AGR.TOTL.ZS":"Сельское, лесное хозяйство и рыболовство",
    "NV.IND.TOTL.ZS":"Промышленность и строительство",
    "NV.IND.MANF.ZS":"Обрабатывающая промышленность",
    "NV.SRV.TOTL.ZS":"Услуги",
}
def api(code):
    return f"https://api.worldbank.org/v2/country/RUS/indicator/{code}?format=json&per_page=200"
def parse_response(payload,code):
    if not isinstance(payload,list) or len(payload)!=2 or not isinstance(payload[0],dict):
        raise ValueError("Некорректный ответ API")
    header,rows=payload
    if not isinstance(rows,list) or not rows or int(header.get("pages",0))!=1 or len(rows)!=int(header.get("total",-1)):
        raise ValueError("Неполный ответ API")
    values={}
    for r in rows:
        if r.get("countryiso3code")!="RUS" or r.get("indicator",{}).get("id")!=code:
            raise ValueError("Неверная страна или код")
        year=str(r["date"])
        if not year.isdigit() or len(year)!=4 or year in values or not 1900<=int(year)<=2100:raise ValueError("Неверный период")
        val=r["value"]
        if val is not None:
            if isinstance(val,bool):raise ValueError("Логическое значение вместо числа")
            val=float(val)
            if not math.isfinite(val):raise ValueError("Нечисловое значение")
        values[year]=val
    return values,header.get("lastupdated","")

def retrieve(code):
    import source_registry,source_pipeline
    from observation_contract import json_load
    url=api(code)
    try:
        values,updated=parse_response(json_load(source_registry.fetch(url).raw),code)
        source_pipeline.record(url,code,"parse",len(values))
        return code,values,None,updated
    except Exception as err:
        source_pipeline.record(url,code,"parse",error=err)
        return code,None,"Ошибка: "+str(err)[:180],""

def refresh(db,stamp):
    from indicators import META
    db.execute("create table if not exists annual_source(code text primary key, checked text, source_updated text)")
    pending=[]
    for code in META:
        last=db.execute("select success from checks where url=?",(api(code),)).fetchone()
        if not last or (last[0] or "")[:10]!=stamp[:10]:pending.append(code)
    with ThreadPoolExecutor(max_workers=4) as pool:
        for code,values,error,updated in pool.map(retrieve,pending):
            url=api(code)
            with db:
                if error:
                    db.execute("insert into checks values(?,?,null,?) on conflict(url) do update set checked=excluded.checked,status=excluded.status",(url,stamp,error))
                    continue
                prior={r[0]:r[1] for r in db.execute("""select year,value from (select year,value,row_number() over(partition by year order by seen desc) rn from annual where code=?) where rn=1""",(code,))}
                # A null explicitly returned by the provider supersedes an earlier value.
                # An omitted year is not assumed withdrawn unless explicitly returned.
                changes=[(code,year,val,stamp) for year,val in values.items() if (year in prior and prior[year]!=val) or (year not in prior and val is not None)]
                db.executemany("insert or ignore into annual values(?,?,?,?)",changes)
                n=sum(v is not None for v in values.values())
                db.execute("insert or replace into checks values(?,?,?,?)",(url,stamp,stamp,f"Получено наблюдений: {n}"))
                db.execute("insert or replace into annual_source values(?,?,?)",(code,stamp,updated))
