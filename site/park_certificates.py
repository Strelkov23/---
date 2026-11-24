"""Independent public AIP certificate listing; date interval is not verification of plant operations."""
import csv,json,re,hashlib
from datetime import date,datetime,timedelta
from urllib.request import Request,urlopen
from collections import Counter
import industrial_parks as p
SOURCE=p.CERTIFICATES
NOTE="Записи из опубликованного списка добровольной сертификации АИП. Наличие документа и его календарный срок не подтверждают отсутствие отзыва, статус в федеральном реестре или текущую работу резидентов."
FIELDS=["number","name","region","start","end","protocol","url","record"]
def without_labels(node):
    if node.has("certification-table__label"):return ""
    return p.clean(" ".join(without_labels(n) if isinstance(n,p.Node) else n for n in node.children))
def parse(raw):
    if not 0<len(raw)<=p.MAX:raise ValueError("Certificate HTML size")
    tree=p.Tree();tree.feed(raw.decode("utf-8-sig"));tree.close()
    rows=[];seen=set()
    for node in tree.root.find("certification-table__row"):
        cells=list(node.find("certification-table__td"))
        if len(cells)!=5:raise ValueError("Expected five certificate fields")
        number,name,region,period,protocol=map(without_labels,cells)
        m=re.fullmatch(r"№\s*(\d+)\s*АИП",number,re.I)
        if not m or not name or not region or not protocol:raise ValueError("Unknown certificate identity")
        number=m[1]
        if number in seen:raise ValueError("Duplicate certificate")
        seen.add(number)
        dates=re.findall(r"\b\d{2}\.\d{2}\.\d{4}\b",period)
        if len(dates)!=2:raise ValueError("Unknown date range: "+period)
        start,end=(datetime.strptime(d,"%d.%m.%Y").date().isoformat() for d in dates)
        if start>end:raise ValueError("Invalid certificate dates")
        links=[n for n in cells[1].children if isinstance(n,p.Node) and n.tag=="a"]
        url=p.safe_link(links[0].attrs.get("href")) if len(links)==1 else None
        rows.append(dict(number=number,name=name,region=region,start=start,end=end,protocol=protocol,url=url,record=len(rows)+1))
    if not 1<=len(rows)<=1000:raise ValueError("Missing certificate list")
    return rows
def empty(stamp):return dict(schema=1,built=stamp,source=SOURCE,note=NOTE,status="not_loaded",checked=None,success=None,sha256=None,rows=[])
def quality(d):
    if d["schema"]!=1 or d["source"]!=SOURCE or d["status"] not in ("ok","cached","unavailable","not_loaded"):raise ValueError("Certificate metadata")
    rows=d["rows"]
    if rows and (not d["success"] or not re.fullmatch("[0-9a-f]{64}",d["sha256"] or "") or d["status"] not in ("ok","cached")):raise ValueError("Certificate provenance")
    if not rows and d["status"] in ("ok","cached"):raise ValueError("Empty certificate list")
    seen=set();today=date.fromisoformat(d["built"][:10]);within=expired=future=0
    for i,r in enumerate(rows,1):
        if set(r)!=set(FIELDS) or r["record"]!=i or not re.fullmatch(r"\d+",r["number"]) or r["number"] in seen or not r["name"] or not r["region"] or not r["protocol"] or (r["url"] is not None and p.safe_link(r["url"])!=r["url"]):raise ValueError("Invalid certificate record")
        seen.add(r["number"]);a,b=date.fromisoformat(r["start"]),date.fromisoformat(r["end"])
        if a>b:raise ValueError("Invalid dates")
        if a<=today<=b:within+=1
        elif b<today:expired+=1
        else:future+=1
    return dict(park_certificate_records=len(rows),park_certificate_in_date_range=within,park_certificate_expired=expired,park_certificate_future=future)
def verify_csv(path,d):
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if reader.fieldnames!=FIELDS:raise ValueError("Certificate CSV schema")
        actual=list(reader)
    expected=[{k:"" if r[k] is None else str(r[k]) for k in FIELDS} for r in d["rows"]]
    if actual!=expected:raise ValueError("Certificate CSV mismatch")
def publish(out,previous,stamp,refresh):
    d=empty(stamp)
    try:
        old=json.loads((previous/"park-certificates.json").read_text(encoding="utf-8"));quality(old);d={**old,"built":stamp}
        if d["rows"]:d["status"]="cached"
    except (OSError,ValueError,KeyError,TypeError):pass
    due=not d["checked"] or date.fromisoformat(stamp[:10])>=date.fromisoformat(d["checked"][:10])+timedelta(days=7 if d["checked"]==d["success"] else 2)
    if refresh and due:
        try:
            with urlopen(Request(SOURCE,headers={"User-Agent":"EconomicMonitor/2.5 (public research catalogue)"}),timeout=25) as f:
                if f.geturl()!=SOURCE:raise ValueError("Unexpected certificate redirect")
                raw=f.read(p.MAX+1)
            rows=parse(raw)
            if d["rows"] and len(rows)<0.5*len(d["rows"]):raise ValueError("Unexpected certificate list coverage decline")
            candidate={**empty(stamp),"rows":rows,"status":"ok","checked":stamp,"success":stamp,"sha256":hashlib.sha256(raw).hexdigest()}
            quality(candidate);d=candidate
        except Exception as e:d.update(status="cached" if d["rows"] else "unavailable",checked=stamp,error=str(e)[:250])
    quality(d)
    (out/"park-certificates.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"park-certificates.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows(d["rows"])
    return d
