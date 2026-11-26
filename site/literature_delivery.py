"""Lossless row-shape encoding of the public bibliography."""
import json

FIELDS={"journal","topics","published","metadata_checked","seen","issn"}
def compact(data):
    shapes=[]; shape_ids={}; strings=[]; string_ids={}
    for row in data["articles"]:
        for k,v in row.items():
            if k in FIELDS and isinstance(v,str) and v not in string_ids:
                string_ids[v]=len(strings);strings.append(v)
    rows=[]
    for row in data["articles"]:
        keys=tuple(sorted(row))
        if keys not in shape_ids:
            shape_ids[keys]=len(shapes);shapes.append(list(keys))
        rows.append([shape_ids[keys],*[string_ids[row[k]] if k in FIELDS and isinstance(row[k],str) else row[k] for k in keys]])
    if any(k in FIELDS and v is not None and not isinstance(v,str) for row in data['articles'] for k,v in row.items()):
        return {"schema":"literature-delivery-v1","encoding":"plain","data":data}
    return {"schema":"literature-delivery-v1","encoding":"rows","meta":{k:v for k,v in data.items() if k!="articles"},"shapes":shapes,"strings":strings,"dictionary_fields":sorted(FIELDS),"rows":rows}

def unpack(p):
    if p["encoding"]=="plain":return p["data"]
    fields=set(p["dictionary_fields"])
    return {**p["meta"],"articles":[{k:p["strings"][v] if k in fields and v is not None else v for k,v in zip(p["shapes"][r[0]],r[1:])} for r in p["rows"]]}

def encode(data):
    packed=compact(data)
    if unpack(packed)!=data:raise ValueError("Literature roundtrip mismatch")
    plain={"schema":"literature-delivery-v1","encoding":"plain","data":data}
    size=lambda obj:len(json.dumps(obj,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode("utf-8"))
    return packed if size(packed)<size(plain) else plain
