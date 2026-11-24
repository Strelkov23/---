"""Cache the unmodified public-domain Natural Earth-derived boundary file.
A map source failure never deletes economic observations or invents geometry.
"""
import json,hashlib,math
from pathlib import Path
from urllib.request import Request,urlopen
SOURCE="https://maps.pispace.eu/data-download/?file=russia-regions.geojson&set=russia"
DOCUMENTATION="https://maps.pispace.eu/data/russia/"
LICENSE="Public domain (Natural Earth; distributed by PiSpace Maps)"
MAX_BYTES=12_000_000

def validate(raw):
    if not 0<len(raw)<=MAX_BYTES:raise ValueError("Некорректный размер файла")
    obj=json.loads(raw)
    features=obj.get("features")
    if obj.get("type")!="FeatureCollection" or not isinstance(features,list) or not 70<=len(features)<=100:
        raise ValueError("Неподходящая коллекция региональных границ")
    codes=set()
    for f in features:
        p=f.get("properties") or {};g=f.get("geometry") or {};code=p.get("iso_3166_2")
        # An unnamed feature is retained but never matched by name. ISO codes remain mandatory for statistical joins.
        if isinstance(code,str) and code.startswith("RU-") and isinstance(p.get("name"),str) and p["name"].strip():codes.add(code)
        if g.get("type") not in ("Polygon","MultiPolygon"):raise ValueError("Неподходящий тип геометрии")
        polygons=[g["coordinates"]] if g["type"]=="Polygon" else g["coordinates"]
        if not polygons:raise ValueError("Пустая геометрия")
        for polygon in polygons:
            if not polygon:raise ValueError("Пустой полигон")
            for ring in polygon:
                if len(ring)<4 or ring[0]!=ring[-1]:raise ValueError("Некорректный контур")
                for pt in ring:
                    if not isinstance(pt,list) or len(pt)<2 or any(type(v) not in (int,float) or not math.isfinite(v) for v in pt[:2]) or not(-180<=pt[0]<=180 and -90<=pt[1]<=90):
                        raise ValueError("Некорректные координаты WGS84")
    if len(codes)<60:raise ValueError("Слишком мало распознанных кодов RU")
    return len(features)

def publish(out,previous,stamp,refresh):
    target=out/"regional-boundaries.geojson"
    meta_path=out/"regional-boundaries.json"
    meta=dict(source=SOURCE,documentation=DOCUMENTATION,license=LICENSE,checked=stamp,status="not_loaded")
    raw=None
    # A validated prior copy remains usable; a failed network refresh does not replace it.
    try:
        old=(previous/target.name).read_bytes()
        n=validate(old)
        old_meta=json.loads((previous/meta_path.name).read_text(encoding="utf-8"))
        if old_meta.get("sha256")==hashlib.sha256(old).hexdigest():
            raw=old;meta.update(old_meta);meta["status"]="cached"
    except (OSError,ValueError,KeyError,TypeError,AttributeError):pass
    if raw is None or (refresh and str(meta.get("downloaded",""))[:7]!=stamp[:7]):
        try:
            with urlopen(Request(SOURCE,headers={"User-Agent":"EconomicsMonitor/2.3","Accept":"application/geo+json,application/json"}),timeout=25) as response:
                payload=response.read(MAX_BYTES+1)
            count=validate(payload)
            raw=payload;meta.update(status="ok",downloaded=stamp,checked=stamp,features=count,sha256=hashlib.sha256(raw).hexdigest())
            meta.pop("error",None)
        except Exception as e:
            meta.update(checked=stamp,error=str(e)[:200],status="cached" if raw else "unavailable")
    if raw is not None:target.write_bytes(raw)
    elif target.exists():target.unlink()
    meta_path.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
