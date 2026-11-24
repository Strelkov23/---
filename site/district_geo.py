"""Separate historical ADM2 reference; no statistical joins to modern municipalities."""
import json,hashlib,math,re
from urllib.request import Request,urlopen

API="https://www.geoboundaries.org/api/current/gbOpen/RUS/ADM2/"
SOURCE="https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/RUS/ADM2/geoBoundaries-RUS-ADM2_simplified.geojson"
IDENT="RUS-ADM2-50074027"
LICENSE="Open Data Commons Open Database License 1.0"
YEAR="2017"
COUNT=2328
MAX=45_000_000

def validate(raw):
    if not 0<len(raw)<=MAX:raise ValueError("invalid ADM2 size")
    g=json.loads(raw);fs=g.get("features")
    if g.get("type")!="FeatureCollection" or not isinstance(fs,list) or len(fs)!=COUNT:raise ValueError("unexpected ADM2 collection")
    ids=set();vertices=0
    for f in fs:
        p=f.get("properties") or {};ident=p.get("shapeID");name=p.get("shapeName")
        if not isinstance(ident,str) or not ident or ident in ids or not isinstance(name,str) or not name.strip():raise ValueError("invalid ADM2 identity")
        ids.add(ident);g=f.get("geometry") or {}
        if g.get("type") not in ("Polygon","MultiPolygon"):raise ValueError("invalid ADM2 geometry")
        polys=[g["coordinates"]] if g["type"]=="Polygon" else g["coordinates"]
        if not polys:raise ValueError("empty ADM2 geometry")
        for polygon in polys:
            if not polygon:raise ValueError("empty ADM2 polygon")
            for ring in polygon:
                if len(ring)<4 or ring[0]!=ring[-1]:raise ValueError("invalid ADM2 ring")
                for pt in ring:
                    if not isinstance(pt,list) or len(pt)<2 or any(type(x) not in (int,float) or not math.isfinite(x) for x in pt[:2]) or abs(pt[0])>180 or abs(pt[1])>90:raise ValueError("invalid ADM2 coordinates")
                vertices+=len(ring)
    return {"features":len(fs),"vertices":vertices}

def quality(out,data,previous=None):
    if data.get("source")!=SOURCE or data.get("boundary_id")!=IDENT or data.get("year")!=YEAR or data.get("license")!=LICENSE:raise ValueError("invalid ADM2 metadata")
    state=data.get("status")
    if state not in ("ok","cached","not_loaded","unavailable"):raise ValueError("invalid ADM2 status")
    path=out/"district-boundaries.json"
    if state in ("ok","cached"):
        raw=path.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=data.get("sha256") or validate(raw)!=data.get("inventory"):raise ValueError("ADM2 integrity mismatch")
        return {"district_reference_units":COUNT},["ADM2: historical 2017 reference, not present-day legal boundaries"]
    if path.exists():raise ValueError("unexpected ADM2 geometry")
    if previous and previous.get("status") in ("ok","cached"):raise ValueError("previous ADM2 reference lost")
    return {"district_reference_units":0},["ADM2: historical reference unavailable"]

def publish(out,previous,stamp,refresh):
    path=out/"district-boundaries.json";meta_path=out/"district-meta.json"
    meta=dict(source=SOURCE,documentation=API,boundary_id=IDENT,year=YEAR,license=LICENSE,status="not_loaded",checked=stamp)
    raw=None
    try:
        old=json.loads((previous/meta_path.name).read_text(encoding="utf-8"))
        quality(previous,old)
        if old["status"] in ("ok","cached"):
            raw=(previous/path.name).read_bytes();meta.update(old);meta["status"]="cached"
    except (OSError,ValueError,KeyError,TypeError,AttributeError):pass
    if raw is None and refresh:
        try:
            with urlopen(Request(SOURCE,headers={"User-Agent":"EconomicMonitor/2.5"}),timeout=45) as response:payload=response.read(MAX+1)
            inv=validate(payload);raw=payload
            meta.update(status="ok",downloaded=stamp,sha256=hashlib.sha256(raw).hexdigest(),inventory=inv)
        except Exception as e:meta.update(status="unavailable",error=str(e)[:200])
    if raw is not None:path.write_bytes(raw)
    elif path.exists():path.unlink()
    meta_path.write_text(json.dumps(meta,ensure_ascii=False,allow_nan=False),encoding="utf-8")
