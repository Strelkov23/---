"""Ember annual electricity pilot. Fail closed on unknown July 2026 schema.
External compilation, not necessarily independent primary Russian observations.
"""
import csv,io,json,math,re
from datetime import datetime,timedelta
from source_transport import download

URL="https://files.ember-energy.org/public-downloads/generation/outputs/release_generation_yearly_global.csv"
DOC="https://ember-energy.org/data/yearly-electricity-data/"
FIELDS={"Area","Year","Electricity source","Generation (TWh)"}
SOURCES={"total generation":"total","coal":"coal","gas":"gas","other fossil":"other_fossil","nuclear":"nuclear","hydro":"hydro","wind":"wind","solar":"solar","bioenergy":"bioenergy","other renewables":"other_renewables"}
def parse(raw,max_year):
    reader=csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    header=reader.fieldnames or []
    if not FIELDS<=set(header) or len(set(header))!=len(header):
        raise ValueError("Unconfirmed CSV headers: "+repr(header)[:900])
    result={}; seen=set()
    for row in reader:
        if row.get("Area") not in ("Russia","Russian Federation"):continue
        if None in row or any(row.get(k) is None for k in FIELDS):raise ValueError("Malformed Russian row")
        for k in ("ISO 3 code","ISO3 code","Country code","ISO code"):
            if k in row and row[k] not in ("RUS","RU"):raise ValueError("Country code mismatch")
        year_raw=row["Year"].strip()
        if not re.fullmatch(r"\d{4}",year_raw):raise ValueError("Not an annual observation")
        y=int(year_raw)
        if y<1992:continue
        if y>max_year:raise ValueError("Future annual observation")
        key=SOURCES.get(row["Electricity source"].strip().lower())
        if key is None:continue
        if (y,key) in seen:raise ValueError("Duplicate annual source")
        seen.add((y,key))
        v=row["Generation (TWh)"].strip()
        if not v:continue
        value=float(v)
        if not math.isfinite(value) or value<0:raise ValueError("Invalid generation")
        result.setdefault(y,{})[key]=value
    rows=[{"year":y,"values":v} for y,v in sorted(result.items())]
    if sum("total" in r["values"] for r in rows)<5:raise ValueError("Insufficient Russian total generation coverage")
    return rows

def keys(rows):return {(r["year"],k) for r in rows for k in r["values"]}

def fetch(year):
    p=download(URL,hosts={"files.ember-energy.org"},max_bytes=80_000_000,timeout=45,path_check=lambda path:path=="/public-downloads/generation/outputs/release_generation_yearly_global.csv")
    return parse(p.raw,year),p.sha256

def publish(db,out,stamp,refresh,loader=fetch):
    db.execute("create table if not exists iv_ember_cache(id integer primary key check(id=1),checked text not null,success text,sha text,payload text,error text)")
    old=db.execute("select checked,success,sha,payload,error from iv_ember_cache where id=1").fetchone()
    due=not old or datetime.fromisoformat(stamp)>=datetime.fromisoformat(old[0])+timedelta(days=1 if old[4] else 14)
    if refresh and due:
        try:
            rows,sha=loader(int(stamp[:4])-1)
            if old and old[3] and keys(json.loads(old[3]))-keys(rows):raise ValueError("Previously published observations removed")
            db.execute("insert or replace into iv_ember_cache values(1,?,?,?,?,null)",(stamp,stamp,sha,json.dumps(rows,allow_nan=False)))
        except Exception as e:
            db.execute("insert into iv_ember_cache values(1,?,null,null,null,?) on conflict(id) do update set checked=excluded.checked,error=excluded.error",(stamp,type(e).__name__+": "+str(e)[:1000]))
    old=db.execute("select checked,success,sha,payload,error from iv_ember_cache where id=1").fetchone()
    data=dict(schema="iv-ember-v1",source=URL,documentation=DOC,license="CC BY 4.0",origin="external_compilation",unit="TWh",rows=json.loads(old[3]) if old and old[3] else [],checked=old[0] if old else None,success=old[1] if old else None,sha256=old[2] if old else None,error=old[4] if old else None)
    (out/"independent-ember.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    return data

if __name__=="__main__":
    from datetime import date
    from pathlib import Path
    import argparse
    ap=argparse.ArgumentParser();ap.add_argument("--snapshot");args=ap.parse_args()
    rows,sha=fetch(date.today().year-1)
    if args.snapshot:Path(args.snapshot).write_text(json.dumps(dict(schema="iv-ember-v1",source=URL,documentation=DOC,license="CC BY 4.0",origin="external_compilation",unit="TWh",rows=rows,sha256=sha),ensure_ascii=False,allow_nan=False),encoding="utf-8")
    print("Ember source accepted:",len(rows),"years;",len(keys(rows)),"observations; SHA256:",sha)
