"""FNS aggregate SME register statistics. No individual business records."""
import json,hashlib,re
from datetime import date
from urllib.request import Request,urlopen
from urllib.parse import urlencode
SOURCE="https://rmsp.nalog.ru/statistics-proc.json"
DOCUMENTATION="https://rmsp.nalog.ru/statistics.html"
MAX=5_000_000
FIELDS={"total":"cnt_total","legal":"cnt_ul_total","individual":"cnt_ip_total","workers":"cnt_worker_total"}

def period(value):
    s=str(value or "").strip()
    for pattern,order in ((r"^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])",(1,2,3)),(r"^(\d{2})\.(\d{2})\.(\d{4})(?:$| )",(3,2,1))):
        m=re.match(pattern,s)
        if m:return date(*(int(m.group(i)) for i in order)).isoformat()
    raise ValueError("unknown stat_date format")

def target(stamp):
    d=date.fromisoformat(stamp[:10])
    if d.day<10:d=date(d.year-1,12,10) if d.month==1 else date(d.year,d.month-1,10)
    else:d=d.replace(day=10)
    return d.isoformat()

def count(v):
    if type(v) is int and v>=0:return v
    if isinstance(v,str) and re.fullmatch(r"\d+",v.strip()):return int(v)
    raise ValueError("invalid nonnegative integer")

def measures(r):
    vals={k:count(r[v]) for k,v in FIELDS.items()}
    if vals["legal"]+vals["individual"]!=vals["total"]:raise ValueError("legal + individual != total")
    return vals

def parse(raw,expected):
    if not 0<len(raw)<=MAX:raise ValueError("invalid size")
    data=json.loads(raw)
    if not isinstance(data,list):raise ValueError("unexpected JSON schema")
    rows=[];seen=set();national=[]
    for r in data:
        if not isinstance(r,dict):raise ValueError("unexpected row")
        if r.get("cnt_name")=="Российская Федерация":
            if period(r.get("stat_date"))!=expected:raise ValueError("national period mismatch")
            national.append(measures(r));continue
        code=r.get("ssrf")
        if code is None or str(code).strip() in ("","0","00"):continue
        code=str(code).strip().zfill(2)
        if not re.fullmatch(r"\d{2}",code) or code=="00" or code in seen:raise ValueError("invalid or duplicate region")
        if period(r.get("stat_date"))!=expected:raise ValueError("regional period mismatch")
        name=str(r.get("name") or "").strip()
        if not name:raise ValueError("region name missing")
        seen.add(code);rows.append(dict(code=code,name=name,**measures(r)))
    if len(national)!=1 or not 80<=len(rows)<=100:raise ValueError("incomplete regional coverage")
    # National figures may include entries not assigned to regional totals; never invent a balancing row.
    sums={k:sum(r[k] for r in rows) for k in FIELDS}
    if any(sums[k]>national[0][k] for k in FIELDS):raise ValueError("regional sum exceeds national total")
    return dict(period=expected,rows=sorted(rows,key=lambda r:r["code"]),national=national[0],regional_sum=sums)

def quality(data,previous=None):
    if data.get("schema")!=1 or data.get("source")!=SOURCE or data.get("status") not in ("ok","cached","unavailable","not_loaded"):
        raise ValueError("invalid SME metadata")
    rows=data.get("rows")
    if not isinstance(rows,list):raise ValueError("invalid rows")
    if rows:
        if data["status"] not in ("ok","cached") or not 80<=len(rows)<=100 or not re.fullmatch(r"[a-f0-9]{64}",data.get("sha256","")):raise ValueError("invalid archive")
        if period(data.get("period"))!=data["period"]:raise ValueError("invalid period")
        codes=set()
        for r in rows:
            if not re.fullmatch(r"\d{2}",r.get("code","")) or r["code"] in codes or not r.get("name"):raise ValueError("duplicate or missing regional code")
            codes.add(r["code"])
            if any(type(r.get(k)) is not int or r[k]<0 for k in FIELDS) or r["total"]!=r["legal"]+r["individual"]:raise ValueError("invalid counts")
        if any(type(data["national"].get(k)) is not int or data["national"][k]<0 for k in FIELDS):raise ValueError("invalid national")
        if data["national"]["total"]!=data["national"]["legal"]+data["national"]["individual"]:raise ValueError("invalid national total")
        if any(data["regional_sum"].get(k)!=sum(r[k] for r in rows) or data["regional_sum"][k]>data["national"][k] for k in FIELDS):raise ValueError("invalid regional sum")
    elif data["status"] in ("ok","cached"):raise ValueError("empty confirmed data")
    if previous and previous.get("rows"):
        if not rows or data["period"]<previous["period"]:raise ValueError("SME snapshot disappeared or regressed")
        if data["period"]==previous["period"] and {r["code"] for r in previous["rows"]}-{r["code"] for r in rows}:raise ValueError("SME region lost")
    warnings=[]
    if not rows:warnings.append("ФНС МСП: агрегированные данные пока недоступны")
    elif data.get("error"):warnings.append("ФНС МСП: сохранён прежний срез; "+str(data["error"]))
    if rows and data["national"]["total"]!=data["regional_sum"]["total"]:warnings.append("ФНС МСП: сумма регионов отличается от итога РФ; остаток не распределяется")
    return {"sme_regions":len(rows),"sme_period":data.get("period")},warnings

def publish(out,previous,stamp,refresh):
    path=out/"sme-regions.json";base=dict(schema=1,source=SOURCE,documentation=DOCUMENTATION,status="not_loaded",checked=stamp,rows=[],note="Агрегаты реестра МСП, не выпуск и не число физических площадок. Работники — показатель реестра, не текущая занятость.")
    try:
        old=json.loads((previous/path.name).read_text(encoding="utf-8"));quality(old)
        base.update(old)
        if old.get("rows"):base["status"]="cached"
    except (OSError,ValueError,TypeError,KeyError,AttributeError):pass
    expected=target(stamp)
    # Once per calendar day until the monthly snapshot becomes available.
    if refresh and base.get("period")!=expected and (base["status"]=="not_loaded" or str(base.get("checked",""))[:10]!=stamp[:10]):
        try:
            req=Request(SOURCE,data=urlencode({"statDate":date.fromisoformat(expected).strftime("%d.%m.%Y")}).encode(),headers={"User-Agent":"EconomicMonitor/2.5","Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"})
            with urlopen(req,timeout=25) as response:raw=response.read(MAX+1)
            result=parse(raw,expected)
            candidate=dict(base,**result,status="ok",checked=stamp,downloaded=stamp,sha256=hashlib.sha256(raw).hexdigest());candidate.pop("error",None)
            quality(candidate,base);base=candidate
        except Exception as e:base.update(status="cached" if base["rows"] else "unavailable",checked=stamp,error=str(e)[:200])
    path.write_text(json.dumps(base,ensure_ascii=False,allow_nan=False),encoding="utf-8")
