"""Bounded Eurostat mirror trade pilot; closed annual periods, exact dimensions."""
import json,math,re
from datetime import datetime,timedelta
from urllib.parse import urlencode
from source_transport import download
import provenance
FILE="economic-eurostat-trade.json"
PATH="/eurostat/api/dissemination/statistics/1.0/data/ext_lt_maineu"
URL="https://ec.europa.eu"+PATH
SOURCE="https://ec.europa.eu/eurostat/databrowser/view/ext_lt_maineu/default/table?lang=en"
NOTE="Торговля товарами ЕС-27 (состав с 2020 г.) с Россией по данным Eurostat. Экспорт и импорт со стороны ЕС; не услуги и не весь российский оборот. Стоимость в млн евро в текущих ценах, не физический объём. Сохраняются флаги источника."
CODES={"MIO_EXP_VAL":"Экспорт товаров ЕС-27 в Россию","MIO_IMP_VAL":"Импорт товаров ЕС-27 из России","MIO_BAL_VAL":"Сальдо торговли товарами ЕС-27 с Россией"}
FIXED={"freq":"A","sitc06":"TOTAL","partner":"RU","geo":"EU27_2020"}
def clock(s):
    d=datetime.fromisoformat(s)
    if d.tzinfo is None:raise ValueError("Missing timezone")
    return d
def query(code):
    if code not in CODES:raise ValueError("Unknown indicator")
    return URL+"?"+urlencode({"lang":"EN",**FIXED,"indic_et":code})
def request(code):
    return download(query(code),hosts=("ec.europa.eu",),path_check=lambda p:p==PATH,max_bytes=1000000,timeout=25).raw
def categories(d,dim,size):
    raw=d["dimension"][dim]["category"]["index"]
    if isinstance(raw,list):raw={k:i for i,k in enumerate(raw)}
    if not isinstance(raw,dict) or len(raw)!=size or any(type(i) is not int for i in raw.values()) or set(raw.values())!=set(range(size)):raise ValueError("Invalid categories")
    return raw
def parse(raw,code,stamp):
    d=json.loads(raw)
    dims=d["id"];sizes=d["size"]
    expect={**FIXED,"indic_et":code}
    if d.get("class")!="dataset" or d.get("version")!="2.0" or set(dims)!=set(expect)|{"time"} or len(dims)!=len(expect)+1 or len(sizes)!=len(dims):raise ValueError("Unexpected JSON-stat dimensions")
    if any(type(s) is not int or s<1 or s>200 for s in sizes):raise ValueError("Invalid dimension size")
    maps={k:categories(d,k,s) for k,s in zip(dims,sizes)}
    if any(set(maps[k])!={v} for k,v in expect.items()):raise ValueError("Wrong trade population")
    times=maps["time"];n=len(times)
    if any(not re.fullmatch(r"\d{4}",y) or not 1900<=int(y)<=2100 for y in times):raise ValueError("Invalid year")
    def indexed(v):
        if isinstance(v,list):
            if len(v)!=n:raise ValueError("Wrong array length")
            v={str(i):x for i,x in enumerate(v) if x is not None}
        if not isinstance(v,dict) or any(not re.fullmatch(r"0|[1-9]\d*",k) or int(k)>=n for k in v):raise ValueError("Invalid index")
        return v
    values=indexed(d["value"]);flags=indexed(d.get("status",{}))
    rows=[]
    for year,i in sorted(times.items()):
        if int(year)>=clock(stamp).year or str(i) not in values:continue
        v=values[str(i)]
        if v is None:continue
        if type(v) not in (int,float) or not math.isfinite(v) or (code!="MIO_BAL_VAL" and v<0):raise ValueError("Invalid trade value")
        flag=flags.get(str(i),"")
        if not isinstance(flag,str) or len(flag)>40:raise ValueError("Invalid flag")
        rows.append(dict(period=year,value=v,flag=flag))
    if not rows:raise ValueError("No closed-year observations")
    return rows
def blank():
    return dict(schema=1,built=None,note=NOTE,source=SOURCE,unit="млн евро",series={k:dict(title=v,checked=None,success=None,status="waiting",rows=[]) for k,v in CODES.items()})
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE or d["source"]!=SOURCE or d["unit"]!="млн евро" or set(d["series"])!=set(CODES):raise ValueError("Invalid trade archive")
    for code,r in d["series"].items():
        if r["title"]!=CODES[code] or r["status"] not in ("waiting","ok","error") or len(r["rows"])>200:raise ValueError("Invalid series")
        if len({x["period"] for x in r["rows"]})!=len(r["rows"]):raise ValueError("Duplicate year")
        for x in r["rows"]:
            if not re.fullmatch(r"\d{4}",x["period"]) or type(x["value"]) not in (int,float) or not math.isfinite(x["value"]) or (code!="MIO_BAL_VAL" and x["value"]<0) or not isinstance(x["flag"],str):raise ValueError("Invalid observation")
        for k in ("checked","success"):
            if r[k] is not None:clock(r[k])
    return True
def comparison(d):
    """Match closed years only; compare published balance against E-I.
    Different retrieval vintages are possible. Tolerance is screening, not a
    proof of correct rounding or independently confirmed trade.
    """
    series=d["series"]
    ex,im,bal=[{x["period"]:x for x in series[k]["rows"]} for k in CODES]
    rows=[]
    for year in sorted(set(ex)|set(im)|set(bal)):
        e,i,b=ex.get(year),im.get(year),bal.get(year)
        delta=e["value"]-i["value"] if e is not None and i is not None else None
        total=e["value"]+i["value"] if delta is not None else None
        residual=delta-b["value"] if delta is not None and b is not None else None
        status="missing" if residual is None else "within_tolerance" if abs(residual)<=0.2+1e-12 else "review"
        previous=str(int(year)-1)
        prior_e,prior_i=ex.get(previous),im.get(previous)
        prior=prior_e["value"]+prior_i["value"] if prior_e is not None and prior_i is not None else None
        growth=(total/prior-1)*100 if total is not None and prior is not None and prior>0 else None
        rows.append(dict(period=year,export=e["value"] if e else None,imports=i["value"] if i else None,reported_balance=b["value"] if b else None,calculated_balance=delta,turnover=total,turnover_yoy_pct=growth,residual=residual,status=status,flags={k:v["flag"] if v is not None else None for k,v in (("export",e),("imports",i),("balance",b))}))
    return dict(note="Сальдо со стороны ЕС = экспорт минус импорт; оборот = сумма. Годовой темп номинальной стоимости только при наличии предыдущего года и ненулевой базе. Расхождение с опубликованным сальдо более 0,2 млн евро требует проверки; это внутренний контроль Eurostat, не независимое подтверждение. Возможны разные редакции и округление.",tolerance_million_eur=0.2,retrieved={k:r["success"] for k,r in series.items()},source_status={k:r["status"] for k,r in series.items()},counts={k:sum(r["status"]==k for r in rows) for k in ("missing","within_tolerance","review")},rows=rows)
def advance(d,stamp,refresh,fetch=request):
    validate(d);now=clock(stamp);d["built"]=stamp
    if refresh:
        # One request per build, at most weekly per series; failures do not erase data.
        due=[(k,r) for k,r in d["series"].items() if r["checked"] is None or now-clock(r["checked"])>=timedelta(days=7)]
        if due:
            k,r=min(due,key=lambda x:x[1]["checked"] or "")
            r["checked"]=stamp
            try:
                rows=parse(fetch(k),k,stamp)
                r.update(rows=rows,success=stamp,status="ok")
            except Exception:r["status"]="error"
    validate(d);d["comparison"]=comparison(d);return d
def publish(out,previous,stamp,refresh):
    d=blank();p=previous/FILE
    if p.exists():
        manifest=json.loads((previous/"data-manifest.json").read_text(encoding="utf-8"))
        if provenance.file_info(p)!=manifest["files"].get(FILE):raise ValueError("Eurostat archive checksum mismatch")
        d=json.loads(p.read_text(encoding="utf-8"))
        if set(d["series"])=={"MIO_EXP_VAL","MIO_IMP_VAL"}:d["series"]["MIO_BAL_VAL"]=blank()["series"]["MIO_BAL_VAL"]
    d=advance(d,stamp,refresh)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
