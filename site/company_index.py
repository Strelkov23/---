"""Compact, independently verifiable exact-INN lookup index for the full FNS releases.
Generation is deliberately separated from GitHub Pages deployment until its size is measured.
"""
import argparse,gzip,hashlib,json,sqlite3,re,shutil
from pathlib import Path
import company_import as ci
BUCKETS=512
FILE="company-index.json"
COLUMNS=["inn","income_name","employment_name","income_cents","expense_cents","workers","income_member","income_doc","employment_member","employment_doc"]
NOTE="Объединение двух полных открытых наборов ФНС по ИНН и году. Не ЕГРЮЛ; регистрация и деятельность не подтверждены. Денежные поля — копейки строкой; null — пропуск."
MAX_BUCKET_BYTES=8*1024*1024
# Conservative project-specific cap, not a GitHub Pages service limit.
MAX_PUBLISH_BYTES=128*1024*1024
def bucket(inn):
    if not ci.inn_valid(inn):raise ValueError("Некорректный ИНН")
    return int(inn)%BUCKETS
def filename(i):return f"company-index/inn-{i:03d}.json.gz"
def empty():return dict(schema=1,status="not_deployed",year=None,note=NOTE,buckets=BUCKETS,columns=COLUMNS,count=0,paired=0,sources=[],files={},members={})
def encode(value):return json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(",",":")).encode("utf-8")
def fingerprint(d):
    payload={k:d[k] for k in ("year","count","paired","sources","files","members","buckets","columns")}
    return hashlib.sha256(encode(payload)).hexdigest()
def create(db,report,out):
    if report["mode"]!="full":raise ValueError("Требуются полные архивы")
    # Validate complete rank report first, then reconcile the database itself.
    ci.quality(dict(schema=1,status="ok",checked="2000-01-01",success="2000-01-01",report=report))
    year=report["year"]
    by={r["kind"]:r for r in report["sources"]}
    stored={r[0]:(r[1],r[2],r[3]) for r in db.execute("SELECT kind,url,sha256,complete FROM releases WHERE year=?",(year,))}
    if stored!={k:(v["source"],v["sha256"],1) for k,v in by.items()}:raise ValueError("База другой редакции")
    members={}
    for k,table in [("income","income"),("employment","employment")]:
        members[k]=[r[0] for r in db.execute(f"SELECT DISTINCT member FROM {table} WHERE year=? ORDER BY member",(year,))]
    mi={k:{name:i for i,name in enumerate(v)} for k,v in members.items()}
    d=empty();d.update(status="ready",year=year,paired=report["paired"],sources=report["sources"],members=members)
    (out/"company-index").mkdir(parents=True,exist_ok=True)
    q="""WITH ids AS (SELECT inn FROM income WHERE year=? UNION SELECT inn FROM employment WHERE year=?)
    SELECT ids.inn,i.name,e.name,i.income_cents,i.expense_cents,e.workers,i.member,i.doc,e.member,e.doc
    FROM ids LEFT JOIN income i ON i.inn=ids.inn AND i.year=?
    LEFT JOIN employment e ON e.inn=ids.inn AND e.year=?
    ORDER BY CAST(ids.inn AS INTEGER)%512,ids.inn"""
    cursor=iter(db.execute(q,(year,year,year,year)));row=next(cursor,None)
    paired=income=employment=0
    for i in range(BUCKETS):
        path=out/filename(i);count=0
        with path.open("wb") as target,gzip.GzipFile(filename="",mode="wb",fileobj=target,compresslevel=6,mtime=0) as z:
            z.write(b"[")
            while row is not None and bucket(row[0])==i:
                values=list(row)
                income+=values[6] is not None;employment+=values[8] is not None;paired+=values[6] is not None and values[8] is not None
                for k in (3,4):
                    if values[k] is not None:values[k]=str(values[k])
                if values[6] is not None:values[6]=mi["income"][values[6]]
                if values[8] is not None:values[8]=mi["employment"][values[8]]
                if count:z.write(b",")
                z.write(encode(values));count+=1;row=next(cursor,None)
            z.write(b"]")
        raw=path.read_bytes()
        if len(raw)>MAX_BUCKET_BYTES:raise ValueError("Слишком крупный блок")
        d["files"][filename(i)]=dict(count=count,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
        d["count"]+=count
    if row is not None or income!=by["income_expense"]["unique"] or employment!=by["employment"]["unique"] or paired!=report["paired"]:raise ValueError("Охват индекса не совпадает с импортом")
    d["fingerprint"]=fingerprint(d)
    quality(d,out,deep=True)
    (out/FILE).write_bytes(encode(d))
    return d
def quality(d,root=None,deep=False):
    if d.get("schema")!=1 or d.get("note")!=NOTE or d.get("buckets")!=BUCKETS or d.get("columns")!=COLUMNS or d.get("status") not in ("ready","not_deployed"):raise ValueError("Паспорт индекса")
    if d["status"]=="not_deployed":
        if d!=empty():raise ValueError("Некорректный пустой индекс")
        return {"company_index_records":0,"company_index_bytes":0}
    if type(d["year"]) is not int or set(d["files"])!={filename(i) for i in range(BUCKETS)} or set(d["members"])!={"income","employment"}:raise ValueError("Состав индекса")
    if any(not isinstance(v,list) or len(v)!=len(set(v)) or any(not isinstance(x,str) or not x for x in v) for v in d["members"].values()):raise ValueError("Справочник XML")
    sources={r["kind"]:r for r in d["sources"]}
    if len(d["sources"])!=2 or set(sources)!=set(ci.SPEC) or any(r["year"]!=d["year"] or not r["complete"] or r["processed_members"]!=r["xml_members"] or not re.fullmatch(r"[a-f0-9]{64}",r["sha256"]) for r in sources.values()):raise ValueError("Неполные источники")
    a,b=sources["income_expense"]["unique"],sources["employment"]["unique"]
    if not 0<=d["paired"]<=min(a,b) or d["count"]!=a+b-d["paired"] or d["fingerprint"]!=fingerprint(d):raise ValueError("Охват или отпечаток")
    total=size=income=employment=paired=0
    for i in range(BUCKETS):
        name=filename(i);e=d["files"][name]
        if type(e["count"]) is not int or e["count"]<0 or type(e["bytes"]) is not int or not 1<=e["bytes"]<=MAX_BUCKET_BYTES or not re.fullmatch(r"[a-f0-9]{64}",e["sha256"]):raise ValueError("Паспорт блока")
        total+=e["count"];size+=e["bytes"]
        if root is not None:
            raw=(root/name).read_bytes()
            if len(raw)!=e["bytes"] or hashlib.sha256(raw).hexdigest()!=e["sha256"]:raise ValueError("Контрольная сумма "+name)
            if deep:
                rows=json.loads(gzip.decompress(raw))
                if len(rows)!=e["count"]:raise ValueError("Число строк "+name)
                prev=""
                for r in rows:
                    if len(r)!=len(COLUMNS) or bucket(r[0])!=i or r[0]<=prev:raise ValueError("Порядок/ИНН "+name)
                    prev=r[0]
                    for namepos,valuepos,docpos,kind in [(1,6,7,"income"),(2,8,9,"employment")]:
                        if r[valuepos] is None:
                            if r[namepos] is not None or r[docpos] is not None:raise ValueError("Неполная ссылка")
                        elif type(r[valuepos]) is not int or not 0<=r[valuepos]<len(d["members"][kind]) or type(r[docpos]) is not int or r[docpos]<1 or not r[namepos]:raise ValueError("Координата документа")
                    if r[6] is None and (r[3] is not None or r[4] is not None) or r[8] is None and r[5] is not None:raise ValueError("Число без источника")
                    for k in (3,4):
                        if r[k] is not None and (not isinstance(r[k],str) or not re.fullmatch(r"-?\d+",r[k])):raise ValueError("Денежная точность")
                    if r[5] is not None and (type(r[5]) is not int or r[5]<0):raise ValueError("Численность")
                    income+=r[6] is not None;employment+=r[8] is not None;paired+=r[6] is not None and r[8] is not None
    if total!=d["count"] or deep and root is not None and (income,employment,paired)!=(a,b,d["paired"]):raise ValueError("Несовпадение покрытия")
    return {"company_index_records":total,"company_index_bytes":size}
def lookup(d,root,inn):
    i=bucket(inn);e=d["files"][filename(i)];raw=(root/filename(i)).read_bytes()
    if hashlib.sha256(raw).hexdigest()!=e["sha256"] or len(raw)!=e["bytes"]:raise ValueError("Контрольная сумма")
    return next((dict(zip(COLUMNS,r)) for r in json.loads(gzip.decompress(raw)) if r[0]==inn),None)
def matches_report(d,report):
    return bool(report and d["status"]=="ready" and d["year"]==report["year"] and d["paired"]==report["paired"] and d["sources"]==report["sources"])
def publishable(d,root,report):
    q=quality(d,root)
    if not matches_report(d,report):raise ValueError("Индекс и рейтинги относятся к разным выпускам")
    if q["company_index_bytes"]+(root/FILE).stat().st_size>MAX_PUBLISH_BYTES:raise ValueError("Индекс превышает бюджет публикации 128 МиБ")
    return q
def restore(previous,report):
    try:
        d=json.loads((previous/FILE).read_text(encoding="utf-8"))
        publishable(d,previous,report)
        return d
    except (OSError,ValueError,TypeError,KeyError,AttributeError):
        return None
def install(out,source,d,report):
    publishable(d,source,report)
    target=out/"company-index"
    if target.exists():shutil.rmtree(target)
    try:
        shutil.copytree(source/"company-index",target)
        quality(d,out)
        (out/FILE).write_bytes(encode(d))
    except Exception:
        shutil.rmtree(target,ignore_errors=True)
        publish(out)
        raise
def publish(out):
    shutil.rmtree(out/"company-index",ignore_errors=True)
    (out/FILE).write_bytes(encode(empty()))
def main():
    p=argparse.ArgumentParser();p.add_argument("--db",type=Path,required=True);p.add_argument("--report",type=Path,required=True);p.add_argument("--output",type=Path,required=True)
    args=p.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    report=json.loads(args.report.read_text(encoding="utf-8"))
    with sqlite3.connect("file:"+str(args.db.resolve())+"?mode=ro",uri=True) as db:
        d=create(db,report,args.output)
        q=quality(d)
        largest=max(x["bytes"] for x in d["files"].values())
        sample=db.execute("SELECT inn FROM income WHERE year=? ORDER BY income_cents DESC LIMIT 1",(d["year"],)).fetchone()
        if sample:assert lookup(d,args.output,sample[0]) is not None
        print("COMPANY_INDEX",json.dumps({**q,"buckets":BUCKETS,"largest_bucket_bytes":largest,"year":d["year"],"paired":d["paired"]},ensure_ascii=False),flush=True)
if __name__=="__main__":main()
