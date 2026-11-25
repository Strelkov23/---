"""Optional prefix-name index derived exclusively from the verified INN index."""
import gzip,hashlib,json,re,shutil,sqlite3,tempfile
from pathlib import Path
import company_index as ci
FILE="company-names.json"
DIR="company-names"
BUCKETS=256
MAX_BYTES=96*1024*1024
MAX_COMBINED_BYTES=224*1024*1024
MAX_BLOCK=8*1024*1024
FORMS={"ооо","пао","ао","зао","оао","нко","фгуп","гуп","муп","ип","llc","jsc"}
def normalize(value):
    # Explicit alphabet keeps Python and browser normalization identical.
    tokens=re.findall(r"[а-яёa-z0-9]+",re.sub(r"[A-ZА-ЯЁ]",lambda m:m[0].lower(),value))
    while len(tokens)>1 and tokens[0] in FORMS:tokens.pop(0)
    return " ".join(tokens)
def bucket(key):
    if len(key)<3:raise ValueError("Короткий префикс")
    h=0
    for c in key[:3]:h=(h*31+ord(c))%BUCKETS
    return h
def filename(i):return f"{DIR}/name-{i:03d}.json.gz"
def empty(reason=None):return dict(schema=1,status="not_deployed",year=None,index_fingerprint=None,count=0,files={},reason=reason)
def quality(d,root=None,index=None):
    if d.get("schema")!=1 or d.get("status") not in ("ready","not_deployed"):raise ValueError("Паспорт имён")
    if d["status"]=="not_deployed":
        if d!=empty(d.get("reason")):raise ValueError("Некорректный пустой индекс имён")
        return {"company_name_records":0,"company_name_bytes":0}
    if type(d["year"]) is not int or not re.fullmatch(r"[a-f0-9]{64}",d["index_fingerprint"] or "") or set(d["files"])!={filename(i) for i in range(BUCKETS)}:raise ValueError("Состав индекса имён")
    if index is not None and (index["status"]!="ready" or d["year"]!=index["year"] or d["index_fingerprint"]!=index["fingerprint"] or not 0<=d["count"]<=2*index["count"]):raise ValueError("Другая редакция ИНН")
    count=size=0
    for name,x in d["files"].items():
        if type(x["count"]) is not int or x["count"]<0 or type(x["bytes"]) is not int or not 1<=x["bytes"]<=MAX_BLOCK or not re.fullmatch(r"[a-f0-9]{64}",x["sha256"]):raise ValueError("Паспорт блока имён")
        count+=x["count"];size+=x["bytes"]
        if root is not None:
            raw=(root/name).read_bytes()
            if len(raw)!=x["bytes"] or hashlib.sha256(raw).hexdigest()!=x["sha256"]:raise ValueError("Контрольная сумма имён "+name)
    if count!=d["count"] or size>MAX_BYTES:raise ValueError("Охват или размер имён")
    if index is not None and size+sum(v["bytes"] for v in index["files"].values())>MAX_COMBINED_BYTES:raise ValueError("Совокупный бюджет поиска")
    return {"company_name_records":count,"company_name_bytes":size}
def create(source,index,out):
    ci.quality(index,source)
    if index["status"]!="ready":raise ValueError("Полный индекс ИНН недоступен")
    (out/DIR).mkdir()
    d=empty();d.update(status="ready",year=index["year"],index_fingerprint=index["fingerprint"])
    with tempfile.TemporaryDirectory() as tmp,sqlite3.connect(Path(tmp)/"names.sqlite") as db:
        db.execute("CREATE TABLE names (bucket INTEGER,key TEXT,inn TEXT,name TEXT,PRIMARY KEY(bucket,key,inn,name)) WITHOUT ROWID")
        for filename_,entry in index["files"].items():
            raw=(source/filename_).read_bytes()
            if hashlib.sha256(raw).hexdigest()!=entry["sha256"]:raise ValueError("Изменился индекс ИНН")
            rows=json.loads(gzip.decompress(raw));batch=[]
            for r in rows:
                for name in set(r[1:3])-{None}:
                    key=normalize(name)
                    if len(key)>=3:batch.append((bucket(key),key,r[0],name))
            db.executemany("INSERT OR IGNORE INTO names VALUES(?,?,?,?)",batch)
        db.commit()
        for i in range(BUCKETS):
            name=filename(i);n=0
            with (out/name).open("wb") as target,gzip.GzipFile(filename="",fileobj=target,mode="wb",mtime=0,compresslevel=9) as z:
                z.write(b"[")
                for inn,label in db.execute("SELECT inn,name FROM names WHERE bucket=? ORDER BY key,inn,name",(i,)):
                    if n:z.write(b",")
                    z.write(ci.encode([inn,label]));n+=1
                z.write(b"]")
            raw=(out/name).read_bytes()
            d["files"][name]=dict(count=n,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest());d["count"]+=n
            size=sum(v["bytes"] for v in d["files"].values())
            if len(raw)>MAX_BLOCK:raise ValueError(f"Блок имён {i}: {len(raw)} байт превышает лимит {MAX_BLOCK}")
            if size>MAX_BYTES:raise ValueError(f"Индекс имён: уже {size} байт при лимите {MAX_BYTES}; блок {i+1}/{BUCKETS}")
    q=quality(d,out,index)
    print("COMPANY_NAMES",json.dumps({**q,"status":d["status"],"reason":d.get("reason"),"max_bytes":MAX_BYTES},ensure_ascii=False),flush=True)
    (out/FILE).write_bytes(ci.encode(d));return d
def publish(out,previous):
    index=json.loads((out/ci.FILE).read_text(encoding="utf-8"))
    shutil.rmtree(out/DIR,ignore_errors=True)
    d=empty("Полный индекс ИНН недоступен")
    if index["status"]=="ready":
        try:
            cached=json.loads((previous/FILE).read_text(encoding="utf-8"))
            if cached["status"]!="ready":raise ValueError("Нет кэша")
            quality(cached,previous,index)
            shutil.copytree(previous/DIR,out/DIR);d=cached
        except (OSError,ValueError,TypeError,KeyError):
            shutil.rmtree(out/DIR,ignore_errors=True)
            try:
                with tempfile.TemporaryDirectory() as tmp:
                    d=create(out,index,Path(tmp));shutil.copytree(Path(tmp)/DIR,out/DIR)
            except Exception as e:
                shutil.rmtree(out/DIR,ignore_errors=True);d=empty(str(e)[:200])
    quality(d,out,index)
    (out/FILE).write_bytes(ci.encode(d));return d
