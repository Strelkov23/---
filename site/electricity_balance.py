"""Annual electricity resource identity from the current OWID energy catalogue.
No seed, no imputation; an unavailable source must remain explicitly unavailable.
"""
import csv,io,json,math,hashlib
from datetime import datetime,timedelta
from urllib.request import Request,urlopen
from urllib.parse import urlsplit

CATALOG="https://catalog.ourworldindata.org/energy/owid_energy/"
SOURCE=CATALOG+"owid_energy.csv"
METRICS={"electricity_generation_twh":"Выработка электроэнергии",
         "electricity_net_imports_twh":"Чистый импорт (импорт минус экспорт)",
         "electricity_demand_twh":"Спрос на электроэнергию"}
G,N,D=METRICS
FUELS={"coal_production_twh":"Добыча угля (энергосодержание)","oil_production_twh":"Добыча нефти и жидких топлив (энергосодержание)","gas_production_twh":"Добыча природного газа (энергосодержание)"}
ALL_METRICS={**METRICS,**FUELS}
LIMIT=30_000_000

def parse(raw,max_year):
    reader=csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    required={"iso_code","year",*ALL_METRICS}
    if not required<=set(reader.fieldnames or []) or len(set(reader.fieldnames))!=len(reader.fieldnames):
        raise ValueError("OWID schema changed")
    rows=[];seen=set()
    for r in reader:
        if r["iso_code"]!="RUS":continue
        y=int(r["year"])
        if not 1992<=y<=max_year:continue
        if y in seen:raise ValueError("Duplicate Russian year")
        seen.add(y);values={}
        for k in ALL_METRICS:
            raw_value=r[k]
            if raw_value is None:raise ValueError("Truncated CSV row")
            if not raw_value.strip():continue
            v=float(raw_value)
            if not math.isfinite(v) or (k!=N and v<0):raise ValueError("Invalid electricity quantity")
            values[k]=v
        if values:rows.append({"year":y,"values":values})
    if sum(all(k in r["values"] for k in METRICS) for r in rows)<5:
        raise ValueError("Insufficient common-year coverage")
    if any(sum(k in r["values"] for r in rows)<5 for k in FUELS):raise ValueError("Insufficient fuel production coverage")
    return sorted(rows,key=lambda r:r["year"])

def keys(rows):
    return {(r["year"],k) for r in rows for k in r["values"]}

def fetch(max_year):
    with urlopen(Request(SOURCE,headers={"User-Agent":"EconomicsMonitor/2.0"}),timeout=45) as f:
        if urlsplit(f.geturl()).hostname!="catalog.ourworldindata.org":raise ValueError("Unexpected host")
        raw=f.read(LIMIT+1)
    if len(raw)>LIMIT:raise ValueError("CSV too large")
    return parse(raw,max_year),hashlib.sha256(raw).hexdigest()

def sync(db,stamp,refresh):
    db.execute("create table if not exists electricity_snapshot(id integer primary key check(id=1),checked text,success text,status text,payload text,sha text)")
    old=db.execute("select checked,success,status,payload,sha from electricity_snapshot where id=1").fetchone()
    expand=bool(old and old[3] and not set(FUELS)<={k for r in json.loads(old[3]) for k in r["values"]})
    due=not old or (expand and old[0]==old[1]) or datetime.fromisoformat(stamp)>=datetime.fromisoformat(old[0])+timedelta(days=14 if old[0]==old[1] else 1)
    if refresh and due:
        try:
            rows,sha=fetch(int(stamp[:4]))
            if old and old[3] and keys(json.loads(old[3]))-keys(rows):
                raise ValueError("Published observations removed; review required")
            with db:db.execute("insert or replace into electricity_snapshot values(1,?,?,?,?,?)",(stamp,stamp,"Получен CSV OWID",json.dumps(rows),sha))
        except Exception as e:
            with db:db.execute("insert into electricity_snapshot values(1,?,null,?,null,null) on conflict(id) do update set checked=excluded.checked,status=excluded.status",(stamp,"Ошибка: "+str(e)[:180]))
    old=db.execute("select checked,success,status,payload,sha from electricity_snapshot where id=1").fetchone()
    return dict(rows=json.loads(old[3]) if old and old[3] else [],checked=old[0] if old else None,success=old[1] if old else None,status=old[2] if old else "Ожидается первая загрузка",source_sha256=old[4] if old else None,source=SOURCE,metadata=CATALOG,metrics=METRICS,fuels=FUELS,unit="TWh")

def publish(out,data):
    (out/"electricity-balance.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"electricity-balance.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f);w.writerow(["year","indicator","value","unit","source","source_sha256"])
        for r in data["rows"]:
            for k,v in r["values"].items():w.writerow([r["year"],k,v,data["unit"],data["source"],data["source_sha256"]])

def quality(data,path,max_year,previous=None):
    """Published dataset integrity; unavailable coverage is a warning, not a fabricated fact."""
    if data["source"]!=SOURCE or data["unit"]!="TWh" or data["metrics"]!=METRICS or data["fuels"]!=FUELS:
        raise ValueError("Energy metadata mismatch")
    rows=data["rows"];sha=data["source_sha256"];success=data["success"]
    if rows and (not success or not isinstance(sha,str) or len(sha)!=64 or any(c not in "0123456789abcdef" for c in sha)):
        raise ValueError("Missing energy source provenance")
    if not rows and (success or sha):raise ValueError("Empty successful snapshot")
    expected={};years=set();complete=0;fuel_complete=0;discrepancies=0
    for r in rows:
        y=r["year"];v=r["values"]
        if type(y) is not int or not 1992<=y<=max_year or y in years or not v:
            raise ValueError("Invalid or duplicate energy year")
        years.add(y)
        for k,x in v.items():
            if k not in ALL_METRICS or type(x) not in (int,float) or not math.isfinite(x) or (k!=N and x<0):
                raise ValueError("Invalid energy observation")
            expected[(str(y),k)]=(str(x),"TWh",SOURCE,sha)
        if all(k in v for k in METRICS):
            complete+=1
            discrepancies+=abs(v[G]+v[N]-v[D])>max(0.1,0.001*v[D])
        fuel_complete+=all(k in v for k in FUELS)
    if previous and keys(previous["rows"])-keys(rows):
        raise ValueError("Previously published energy observations disappeared")
    actual={}
    with path.open(encoding="utf-8-sig",newline="") as fh:
        reader=csv.DictReader(fh)
        if reader.fieldnames!=["year","indicator","value","unit","source","source_sha256"]:raise ValueError("Energy CSV header mismatch")
        for r in reader:
            key=(r["year"],r["indicator"])
            if key in actual:raise ValueError("Duplicate energy CSV observation")
            actual[key]=tuple(r[k] for k in ("value","unit","source","source_sha256"))
    if actual!=expected:raise ValueError("Energy JSON/CSV mismatch")
    counts=dict(energy_years=len(years),energy_observations=len(expected),electricity_complete_years=complete,electricity_discrepancies=discrepancies,fuel_complete_years=fuel_complete)
    warnings=[]
    if not rows:warnings.append("OWID: нет загруженных энергетических наблюдений")
    elif complete<5:warnings.append("OWID: недостаточное покрытие баланса электроэнергии")
    if fuel_complete<5:warnings.append("OWID: недостаточное совместное покрытие добычи трёх топлив")
    if discrepancies:warnings.append("OWID: превышен экран расхождения электрического баланса: "+str(discrepancies))
    if data["checked"]!=success:warnings.append("OWID: последняя попытка загрузки неуспешна")
    return counts,warnings
