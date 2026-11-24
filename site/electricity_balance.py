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
LIMIT=30_000_000

def parse(raw,max_year):
    reader=csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    required={"iso_code","year",*METRICS}
    if not required<=set(reader.fieldnames or []) or len(set(reader.fieldnames))!=len(reader.fieldnames):
        raise ValueError("OWID schema changed")
    rows=[];seen=set()
    for r in reader:
        if r["iso_code"]!="RUS":continue
        y=int(r["year"])
        if not 1992<=y<=max_year:continue
        if y in seen:raise ValueError("Duplicate Russian year")
        seen.add(y);values={}
        for k in METRICS:
            raw_value=r[k]
            if raw_value is None:raise ValueError("Truncated CSV row")
            if not raw_value.strip():continue
            v=float(raw_value)
            if not math.isfinite(v) or (k!=N and v<0):raise ValueError("Invalid electricity quantity")
            values[k]=v
        if values:rows.append({"year":y,"values":values})
    if sum(all(k in r["values"] for k in METRICS) for r in rows)<5:
        raise ValueError("Insufficient common-year coverage")
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
    due=not old or datetime.fromisoformat(stamp)>=datetime.fromisoformat(old[0])+timedelta(days=14 if old[0]==old[1] else 1)
    if refresh and due:
        try:
            rows,sha=fetch(int(stamp[:4]))
            if old and old[3] and keys(json.loads(old[3]))-keys(rows):
                raise ValueError("Published observations removed; review required")
            with db:db.execute("insert or replace into electricity_snapshot values(1,?,?,?,?,?)",(stamp,stamp,"Получен CSV OWID",json.dumps(rows),sha))
        except Exception as e:
            with db:db.execute("insert into electricity_snapshot values(1,?,null,?,null,null) on conflict(id) do update set checked=excluded.checked,status=excluded.status",(stamp,"Ошибка: "+str(e)[:180]))
    old=db.execute("select checked,success,status,payload,sha from electricity_snapshot where id=1").fetchone()
    return dict(rows=json.loads(old[3]) if old and old[3] else [],checked=old[0] if old else None,success=old[1] if old else None,status=old[2] if old else "Ожидается первая загрузка",source_sha256=old[4] if old else None,source=SOURCE,metadata=CATALOG,metrics=METRICS,unit="TWh")

def publish(out,data):
    (out/"electricity-balance.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"electricity-balance.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f);w.writerow(["year","indicator","value","unit","source","source_sha256"])
        for r in data["rows"]:
            for k,v in r["values"].items():w.writerow([r["year"],k,v,data["unit"],data["source"],data["source_sha256"]])
