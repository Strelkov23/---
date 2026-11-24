"""WRI Global Power Plant Database 1.3.0 (2021), archival reference only."""
import csv, hashlib, io, json, math, zipfile, re
from datetime import datetime
from urllib.request import urlopen, Request

SOURCE="https://wri-dataportal-prod.s3.amazonaws.com/manual/global_power_plant_database_v_1_3.zip"
DOC="https://datasets.wri.org/datasets/global-power-plant-database"
LICENSE="CC BY 4.0"
RELEASE="1.3.0 (2021)"
MAX=20_000_000

def numeric(s,positive=False):
    if s is None or not str(s).strip():return None
    v=float(s)
    if not math.isfinite(v) or v<0 or positive and v==0:raise ValueError("invalid number")
    return v

def parse(raw):
    if not 0<len(raw)<=MAX:raise ValueError("archive size")
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        files=[x for x in z.infolist() if x.filename.split("/")[-1]=="global_power_plant_database.csv"]
        if len(files)!=1 or files[0].file_size>80_000_000:raise ValueError("CSV not unique or oversized")
        with z.open(files[0]) as f:
            reader=csv.DictReader(io.TextIOWrapper(f,encoding="utf-8-sig",newline=""))
            need={"country","name","gppd_idnr","capacity_mw","latitude","longitude","primary_fuel","source","url"}
            if not need<=set(reader.fieldnames or []):raise ValueError("unexpected schema")
            rows=[];seen=set()
            for r in reader:
                if r["country"]!="RUS":continue
                ident=r["gppd_idnr"].strip();name=r["name"].strip()
                if not ident or not name or ident in seen:raise ValueError("invalid or duplicate ID")
                seen.add(ident)
                # Display approximate location (one decimal degree), not a surveyed facility boundary.
                lat=float(r["latitude"]);lon=float(r["longitude"])
                if not (math.isfinite(lat) and math.isfinite(lon) and -90<=lat<=90 and -180<=lon<=180):raise ValueError("invalid coordinates")
                generation={str(y):numeric(r.get("generation_gwh_"+str(y))) for y in range(2013,2020)}
                rows.append(dict(id=ident,name=name,latitude=round(lat,1),longitude=round(lon,1),fuel=r["primary_fuel"].strip() or "Unknown",capacity_mw=numeric(r["capacity_mw"],True),capacity_year=r.get("year_of_capacity_data",""),commissioned=r.get("commissioning_year",""),source=r["source"],source_url=r["url"],generation={k:v for k,v in generation.items() if v is not None},generation_source=r.get("generation_data_source","")))
    return sorted(rows,key=lambda r:r["id"])

def quality(data,previous=None):
    if data.get("schema")!=1 or data.get("release")!=RELEASE or data.get("source")!=SOURCE or data.get("license")!=LICENSE:
        raise ValueError("Некорректный паспорт архива площадок")
    rows=data.get("rows")
    if not isinstance(rows,list):raise ValueError("Некорректный список площадок")
    if data.get("status") not in ("ok","cached","unavailable","not_loaded"):raise ValueError("Некорректный статус")
    if rows:
        if data["status"] not in ("ok","cached") or len(rows)<100 or not re.fullmatch(r"[a-f0-9]{64}",data.get("sha256") or ""):
            raise ValueError("Некорректный подтверждённый архив площадок")
    elif data["status"] in ("ok","cached"):raise ValueError("Пустой подтверждённый архив")
    ids=set();capacity=reported=0
    for r in rows:
        ident=r.get("id")
        if not isinstance(ident,str) or not ident.strip() or ident in ids or not isinstance(r.get("name"),str) or not r["name"].strip():raise ValueError("Некорректный ID/название площадки")
        ids.add(ident)
        for k,bound in (("latitude",90),("longitude",180)):
            v=r.get(k)
            if type(v) not in (int,float) or not math.isfinite(v) or abs(v)>bound or abs(v-round(v,1))>1e-9:raise ValueError("Некорректная координата")
        v=r.get("capacity_mw")
        if v is not None:
            if type(v) not in (int,float) or not math.isfinite(v) or v<=0:raise ValueError("Некорректная мощность")
            capacity+=1
        generation=r.get("generation")
        if not isinstance(generation,dict) or any(k not in {str(y) for y in range(2013,2020)} or type(v) not in (int,float) or not math.isfinite(v) or v<0 for k,v in generation.items()):raise ValueError("Некорректная выработка")
        reported+=bool(generation)
    if previous and previous.get("release")==RELEASE:
        old={r["id"] for r in previous.get("rows",[])}
        if old-ids:raise ValueError("Исчезли ранее опубликованные площадки")
    counts=dict(facility_records=len(rows),facility_capacity_records=capacity,facility_reported_generation_records=reported)
    warnings=["Площадки WRI: архив 2021 года, текущий статус работы не подтверждён"] if rows else ["Площадки WRI: архив недоступен"]
    if rows and not reported:warnings.append("Площадки WRI: нет наблюдаемой годовой выработки в импортированных полях")
    return counts,warnings

def publish(out,previous,stamp,refresh):
    path=out/"facility-energy.json";base=dict(schema=1,release=RELEASE,source=SOURCE,documentation=DOC,license=LICENSE,checked=stamp,status="not_loaded",rows=[],note="Архив WRI, не реестр действующих объектов. Координаты округлены до 0,1 градуса. Мощность не выработка. Пропуск не ноль.")
    try:
        old=json.loads((previous/path.name).read_text(encoding="utf-8"))
        if old.get("release")==RELEASE and old.get("source")==SOURCE and old.get("sha256") and len(old.get("rows",[]))>=100:
            quality(old)
            base.update(old);base["status"]="cached"
    except (OSError,ValueError,TypeError,AttributeError):pass
    if not base["rows"] and refresh:
        try:
            with urlopen(Request(SOURCE,headers={"User-Agent":"EconomicsMonitor/2.4"}),timeout=30) as response:raw=response.read(MAX+1)
            rows=parse(raw)
            if len(rows)<100:raise ValueError("too few Russian records")
            base.update(rows=rows,status="ok",checked=stamp,downloaded=stamp,sha256=hashlib.sha256(raw).hexdigest())
        except Exception as e:base.update(status="unavailable",checked=stamp,error=str(e)[:180])
    path.write_text(json.dumps(base,ensure_ascii=False,allow_nan=False),encoding="utf-8")
