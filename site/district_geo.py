"""Separate historical ADM2 reference; no statistical joins to modern municipalities."""
import json,hashlib,math,re
from urllib.request import Request,urlopen

API="https://www.geoboundaries.org/api/current/gbOpen/RUS/ADM2/"
SOURCE="https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/RUS/ADM2/geoBoundaries-RUS-ADM2_simplified.geojson"
IDENT="RUS-ADM2-50074027"
LICENSE="Open Data Commons Open Database License 1.0"
YEAR="2017"
EXPECTED=2328
# Simplified edition has one fewer feature than the full-release metadata.
COUNT=2327
PINNED_SHA256='81dabf7930ff5e306e2423b586bcec14163fbd10481db6e49aab47273953b128'
PINNED_SIZE=26338801
MAX=45_000_000

def validate(raw):
    if not 0<len(raw)<=MAX:raise ValueError("invalid ADM2 size")
    g=json.loads(raw);fs=g.get("features")
    if g.get("type")!="FeatureCollection" or not isinstance(fs,list) or len(fs)!=COUNT:raise ValueError("unexpected ADM2 collection: type="+str(g.get("type"))+"; features="+str(len(fs) if isinstance(fs,list) else None)+"; expected="+str(COUNT))
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

def verify_release(raw):
    if len(raw)!=PINNED_SIZE or hashlib.sha256(raw).hexdigest()!=PINNED_SHA256:raise ValueError('ADM2 file differs from pinned Git LFS release')
    return validate(raw)

def quality(out,data,previous=None):
    if data.get("source")!=SOURCE or data.get("boundary_id")!=IDENT or data.get("year")!=YEAR or data.get("license")!=LICENSE:raise ValueError("invalid ADM2 metadata")
    state=data.get("status")
    if state not in ("ok","cached","not_loaded","unavailable"):raise ValueError("invalid ADM2 status")
    path=out/"district-boundaries.json"
    if state in ("ok","cached"):
        raw=path.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=data.get("sha256") or verify_release(raw)!=data.get("inventory") or data.get("expected_units")!=EXPECTED:raise ValueError("ADM2 integrity mismatch")
        return {"district_reference_units":COUNT},["ADM2: simplified 2017 release contains 2327 of 2328 declared units; not present-day legal boundaries"]
    if path.exists():raise ValueError("unexpected ADM2 geometry")
    if previous and previous.get("status") in ("ok","cached"):raise ValueError("previous ADM2 reference lost")
    return {"district_reference_units":0},["ADM2: historical reference unavailable"]

def publish(out,previous,stamp,refresh):
    path=out/"district-boundaries.json";meta_path=out/"district-meta.json"
    meta=dict(source=SOURCE,documentation=API,boundary_id=IDENT,year=YEAR,license=LICENSE,status="not_loaded",checked=stamp,expected_units=EXPECTED)
    raw=None
    try:
        old=json.loads((previous/meta_path.name).read_text(encoding="utf-8"))
        quality(previous,old)
        if old["status"] in ("ok","cached"):
            raw=(previous/path.name).read_bytes();meta.update(old);meta["status"]="cached"
        elif old["status"]=="unavailable":meta.update(old)
    except (OSError,ValueError,KeyError,TypeError,AttributeError):pass
    if raw is None and refresh and (meta.get("release_pin")!=PINNED_SHA256 or meta["status"]!="unavailable" or str(meta.get("checked",""))[:10]!=stamp[:10]):
        try:
            with urlopen(Request(SOURCE,headers={"User-Agent":"EconomicMonitor/2.5"}),timeout=45) as response:payload=response.read(MAX+1)
            inv=verify_release(payload);raw=payload
            meta.update(status="ok",checked=stamp,downloaded=stamp,sha256=hashlib.sha256(raw).hexdigest(),inventory=inv,expected_units=EXPECTED);meta.pop("error",None)
        except Exception as e:meta.update(status="unavailable",checked=stamp,error=str(e)[:200],release_pin=PINNED_SHA256)
    if raw is not None:path.write_bytes(raw)
    elif path.exists():path.unlink()
    meta_path.write_text(json.dumps(meta,ensure_ascii=False,allow_nan=False),encoding="utf-8")
