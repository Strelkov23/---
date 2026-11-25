"""Bounded offline import of public FNS corporate XML archives into SQLite.
Not a complete EGRUL register; does not collect people, contacts or addresses.
"""
import argparse,hashlib,io,json,re,sqlite3,tempfile,zipfile,xml.etree.ElementTree as ET
from decimal import Decimal,InvalidOperation
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
import company_sources as sources

MAX_ARCHIVE=768*1024*1024
MAX_XML=32*1024*1024
MAX_UNPACKED=8*1024*1024*1024
SPEC={"income_expense":("СведДохРасх",("СумДоход","СумРасход")),"employment":("СведССЧР",("КолРаб",))}
def inn_valid(s):
    if not re.fullmatch(r"\d{10}",s or ""):return False
    return sum(int(a)*b for a,b in zip(s[:9],(2,4,10,3,5,9,4,6,8)))%11%10==int(s[-1])
def amount(v):
    if v is None or v=="":return None
    if not re.fullmatch(r"-?\d+(?:\.\d{1,2})?",v):raise ValueError("Неподдерживаемая сумма")
    n=int(Decimal(v)*100)
    if not -(2**63)<n<2**63:raise ValueError("Сумма вне SQLite INTEGER")
    return n
def workers(v):
    if v is None or v=="":return None
    if not re.fullmatch(r"\d{1,10}",v):raise ValueError("Неподдерживаемая численность")
    return int(v)
def parse_xml(raw,kind):
    if len(raw)>MAX_XML or re.search(br"<!\s*(?:DOCTYPE|ENTITY)",raw,re.I) or b"\x00" in raw[:100]:raise ValueError("Неподдерживаемый XML")
    root=ET.fromstring(raw)
    if root.tag!="Файл":raise ValueError("Не файл ФНС")
    field,attrs=SPEC[kind];docs=root.findall("Документ")
    if not docs:raise ValueError("Нет документов")
    for doc in docs:
        org=doc.findall("СведНП");item=doc.findall(field)
        if len(org)!=1 or len(item)!=1:raise ValueError("Неоднозначная структура документа")
        inn=org[0].get("ИННЮЛ");name=org[0].get("НаимОрг")
        if not inn_valid(inn) or not name or len(name)>1000:raise ValueError("Некорректный ИНН/наименование")
        vals=tuple((amount if kind=="income_expense" else workers)(item[0].get(a)) for a in attrs)
        if all(v is None for v in vals):raise ValueError("Нет числовых полей документа")
        yield inn,name,*vals
def download(url,path):
    u=urlsplit(url)
    if u.scheme!="https" or u.hostname not in ("file.nalog.ru","data.nalog.ru") or not re.fullmatch(r"/opendata/7707329152-(?:revexp|sshr2019)/data-\d{8}-structure-\d{8}\.zip",u.path):raise ValueError("URL архива")
    sha=hashlib.sha256();size=0
    with urlopen(Request(url,headers={"User-Agent":"Mozilla/5.0"}),timeout=60) as r,open(path,"wb") as f:
        if urlsplit(r.geturl()).hostname not in ("file.nalog.ru","data.nalog.ru"):raise ValueError("Перенаправление архива")
        while True:
            b=r.read(1024*1024)
            if not b:break
            size+=len(b)
            if size>MAX_ARCHIVE:raise ValueError("Превышен лимит ZIP")
            sha.update(b);f.write(b)
    return sha.hexdigest(),size
def setup(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS income(inn TEXT,year INTEGER,name TEXT,income_cents INTEGER,expense_cents INTEGER,member TEXT,doc INTEGER,PRIMARY KEY(inn,year));
    CREATE TABLE IF NOT EXISTS employment(inn TEXT,year INTEGER,name TEXT,workers INTEGER,member TEXT,doc INTEGER,PRIMARY KEY(inn,year));
    CREATE TABLE IF NOT EXISTS conflicts(kind TEXT,inn TEXT,year INTEGER,PRIMARY KEY(kind,inn,year));
    CREATE TABLE IF NOT EXISTS releases(kind TEXT,year INTEGER,url TEXT,sha256 TEXT,complete INTEGER,members INTEGER,documents INTEGER,PRIMARY KEY(kind,year));
    """)
def import_zip(db,path,kind,year,limit=None):
    table="income" if kind=="income_expense" else "employment"
    n=dups=conflicts=excluded_conflicts=0
    with zipfile.ZipFile(path) as z:
        members=z.infolist()
        files=[m for m in members if not m.is_dir() and m.filename.lower().endswith(".xml")]
        if not files or len(files)>3_000_000 or len({m.filename for m in files})!=len(files):raise ValueError("Состав XML архива")
        if any(m.file_size>MAX_XML for m in files) or sum(m.file_size for m in files)>MAX_UNPACKED:raise ValueError("Превышен лимит XML")
        selected=files if limit is None else files[:limit]
        # Any non-XML payload makes completeness unknown.
        complete=len(selected)==len(files) and all(m.is_dir() or m.filename.lower().endswith(".xml") for m in members)
        for m in selected:
            for j,row in enumerate(parse_xml(z.read(m),kind),1):
                inn,name,*vals=row;n+=1
                if db.execute("SELECT 1 FROM conflicts WHERE kind=? AND inn=? AND year=?",(kind,inn,year)).fetchone():
                    excluded_conflicts+=1;continue
                old=db.execute("SELECT * FROM "+table+" WHERE inn=? AND year=?",(inn,year)).fetchone()
                new=(inn,year,name,*vals,m.filename,j)
                if old is not None:
                    if old[:-2]==new[:-2]:dups+=1;continue
                    db.execute("DELETE FROM "+table+" WHERE inn=? AND year=?",(inn,year))
                    db.execute("INSERT INTO conflicts VALUES(?,?,?)",(kind,inn,year));conflicts+=1;continue
                db.execute("INSERT INTO "+table+" VALUES("+",".join("?" for _ in new)+")",new)
            if n and n%10000==0:db.commit()
    db.commit()
    return dict(kind=kind,year=year,xml_members=len(files),processed_members=len(selected),documents=n,exact_duplicates=dups,conflicts=conflicts,additional_conflict_documents=excluded_conflicts,unique=db.execute("SELECT count(*) FROM "+table+" WHERE year=?",(year,)).fetchone()[0],complete=complete)
def summary(db,year,limit=100):
    # Do not call this a national ranking if only part of the files were read.
    cols="i.inn,i.name,i.income_cents,i.expense_cents,e.workers,i.member,i.doc,e.member,e.doc"
    sql="SELECT "+cols+" FROM income i LEFT JOIN employment e ON i.inn=e.inn AND i.year=e.year WHERE i.year=? AND i.income_cents IS NOT NULL ORDER BY i.income_cents DESC,i.inn LIMIT ?"
    return [dict(zip(("inn","name","income_cents","expense_cents","workers","income_member","income_doc","employment_member","employment_doc"),r)) for r in db.execute(sql,(year,limit))]

RANKS={"income":"Доходы","expense":"Расходы","employment":"Среднесписочная численность"}
RANK_LIMIT=500
FILE="company-rankings.json"
NOTE="Рейтинги юридических лиц в пределах открытых наборов ФНС, не консолидированных групп и не всех действующих предприятий. Доходы не выручка, расходы не себестоимость. Денежные поля — точные целые копейки строкой. Пропуск не ноль."
def rankings(db,year,limit=RANK_LIMIT):
    result={}
    for kind,table,column in (("income","income","income_cents"),("expense","income","expense_cents"),("employment","employment","workers")):
        # Start from the selected source: employment-only organizations must not disappear.
        first="employment e LEFT JOIN income i ON i.inn=e.inn AND i.year=e.year" if table=="employment" else "income i LEFT JOIN employment e ON e.inn=i.inn AND e.year=i.year"
        alias="e" if table=="employment" else "i"
        sql=f"SELECT {alias}.inn,i.name,e.name,i.income_cents,i.expense_cents,e.workers,i.member,i.doc,e.member,e.doc FROM {first} WHERE {alias}.year=? AND {alias}.{column} IS NOT NULL ORDER BY {alias}.{column} DESC,{alias}.inn LIMIT ?"
        keys=("inn","income_name","employment_name","income_cents","expense_cents","workers","income_member","income_doc","employment_member","employment_doc")
        rows=[]
        for rank,row in enumerate(db.execute(sql,(year,limit)),1):
            r=dict(zip(keys,row));r["rank"]=rank;r["name"]=r["employment_name"] if kind=="employment" else r["income_name"]
            for k in ("income_cents","expense_cents"):
                if r[k] is not None:r[k]=str(r[k])
            rows.append(r)
        count=db.execute(f"SELECT count(*) FROM {table} WHERE year=? AND {column} IS NOT NULL",(year,)).fetchone()[0]
        result[kind]=dict(eligible=count,rows=rows)
    paired=db.execute("SELECT count(*) FROM income i JOIN employment e ON i.inn=e.inn AND i.year=e.year WHERE i.year=?",(year,)).fetchone()[0]
    differing=db.execute("SELECT count(*) FROM income i JOIN employment e ON i.inn=e.inn AND i.year=e.year WHERE i.year=? AND i.name<>e.name",(year,)).fetchone()[0]
    return result,paired,differing
def run_import(meta,folder,limit=None):
    sources.quality(meta)
    years={r["report_year"] for r in meta["rows"]}
    if len(years)!=1 or None in years:raise ValueError("Разные отчётные годы")
    year=next(iter(years));folder.mkdir(parents=True,exist_ok=True)
    # Always create a fresh database; never merge two editions in-place.
    dbpath=folder/"company-pilot.sqlite"
    if dbpath.exists():raise ValueError("База назначения уже существует")
    results=[]
    with tempfile.TemporaryDirectory() as tmp,sqlite3.connect(dbpath) as db:
        setup(db)
        for r in meta["rows"]:
            if not r["schema_verified"] or not set(SPEC[r["kind"]][1])<=set(r["attributes"]):raise ValueError("Нет проверенной схемы")
            file=Path(tmp)/(r["kind"]+".zip")
            sha,size=download(r["archive"],file)
            print("ARCHIVE_DOWNLOADED",r["kind"],size,sha,flush=True)
            result=import_zip(db,file,r["kind"],year,limit)
            result.update(source=r["archive"],sha256=sha,bytes=size,schema_sha256=r["schema_sha256"],release=r["release"])
            results.append(result);print("CORPORATE_IMPORT",json.dumps(result,ensure_ascii=False),flush=True)
            db.execute("INSERT INTO releases VALUES(?,?,?,?,?,?,?)",(r["kind"],year,r["archive"],sha,int(result["complete"]),result["processed_members"],result["documents"]));db.commit()
            file.unlink()
        ranking,paired,differing=rankings(db,year)
        report=dict(schema=1,mode="full" if all(r["complete"] for r in results) else "pilot",year=year,sources=results,rankings=ranking,paired=paired,name_mismatches=differing,note=NOTE)
        (folder/"company-pilot.json").write_text(json.dumps(report,ensure_ascii=False,allow_nan=False),encoding="utf-8")
        print("CORPORATE_COVERAGE",json.dumps({"year":year,"mode":report["mode"],"paired":paired,"name_mismatches":differing,"ranked":{k:v["eligible"] for k,v in ranking.items()}},ensure_ascii=False),flush=True)
        return report
def empty():
    return dict(schema=1,status="not_loaded",checked=None,success=None,report=None)
def quality(d):
    if d.get("schema")!=1 or d.get("status") not in ("not_loaded","unavailable","cached","ok"):raise ValueError("Паспорт рейтингов")
    r=d["report"]
    if r is None:
        if d["status"] in ("cached","ok") or d["success"]:raise ValueError("Пустой успех")
        return {"corporate_income_records":0,"corporate_employment_records":0,"corporate_paired_records":0}
    if d["status"] not in ("cached","ok") or not d["success"] or not d["checked"] or r["mode"]!="full" or r["note"]!=NOTE or type(r["year"]) is not int:raise ValueError("Неполная выборка не публикуется")
    by={x["kind"]:x for x in r["sources"]}
    if set(by)!=set(SPEC) or len(r["sources"])!=2:raise ValueError("Состав наборов")
    for x in by.values():
        if not x["complete"] or x["year"]!=r["year"] or x["xml_members"]!=x["processed_members"] or not re.fullmatch(r"[a-f0-9]{64}",x["sha256"]) or not re.fullmatch(r"[a-f0-9]{64}",x["schema_sha256"]):raise ValueError("Неполный выпуск")
        if x["unique"]+x["exact_duplicates"]+2*x["conflicts"]+x["additional_conflict_documents"]!=x["documents"]:raise ValueError("Баланс документов")
    a,b=by["income_expense"]["unique"],by["employment"]["unique"]
    if not 0<=r["name_mismatches"]<=r["paired"]<=min(a,b) or set(r["rankings"])!=set(RANKS):raise ValueError("Охват объединения")
    for kind,key,maximum in (("income","income_cents",a),("expense","expense_cents",a),("employment","workers",b)):
        x=r["rankings"][kind];rows=x["rows"]
        if not 0<=x["eligible"]<=maximum or len(rows)!=min(x["eligible"],RANK_LIMIT):raise ValueError("Охват рейтинга")
        ids=set();previous=None
        for i,v in enumerate(rows,1):
            if not inn_valid(v["inn"]) or v["inn"] in ids or v["rank"]!=i or not v["name"]:raise ValueError("Строка рейтинга")
            ids.add(v["inn"])
            for k in ("income_cents","expense_cents"):
                if v[k] is not None and (not isinstance(v[k],str) or not re.fullmatch(r"-?\d+",v[k])):raise ValueError("Денежная строка")
            if v["workers"] is not None and (type(v["workers"]) is not int or v["workers"]<0):raise ValueError("Численность")
            order=(-int(v[key]),v["inn"])
            if previous is not None and previous>order:raise ValueError("Порядок рейтинга")
            previous=order
    return {"corporate_income_records":a,"corporate_employment_records":b,"corporate_paired_records":r["paired"]}
INDEX_RETRY_REVISION=1
def refresh_due(d,stamp,release,old_release,cached):
    """Financial publication and index repair use independent cooldowns."""
    from datetime import date,timedelta
    today=date.fromisoformat(stamp[:10])
    if release!=old_release:
        attempted=d.get("import_attempt_release")==release
        last=d.get("import_attempt") if attempted else None
        return not last or today>=date.fromisoformat(last[:10])+timedelta(days=1)
    if cached:return False
    last=d.get("index_attempt") if d.get("index_retry_revision")==INDEX_RETRY_REVISION else None
    return not last or today>=date.fromisoformat(last[:10])+timedelta(days=2)

def publish(out,previous,stamp,refresh):
    from datetime import date,timedelta
    import company_index as index
    index.publish(out)
    d=empty()
    try:
        old=json.loads((previous/FILE).read_text(encoding="utf-8"));quality(old);d=old
        if d["report"]:d["status"]="cached"
    except (OSError,ValueError,KeyError,TypeError):pass
    meta=json.loads((out/sources.FILE).read_text(encoding="utf-8"))
    release={r["kind"]:r["archive"] for r in meta["rows"]}
    ready=all(r["schema_verified"] and r["archive"] for r in meta["rows"])
    old_release={r["kind"]:r["source"] for r in d["report"]["sources"]} if d["report"] else {}
    cached=index.restore(previous,d["report"])
    if cached:
        try:index.install(out,previous,cached,d["report"])
        except (OSError,ValueError,TypeError,KeyError) as e:
            cached=None;d["index_error"]=str(e)[:220]
    due=refresh_due(d,stamp,release,old_release,cached)
    if refresh and ready and due:
        d.update(import_attempt=stamp,import_attempt_release=release,index_attempt=stamp,index_retry_revision=INDEX_RETRY_REVISION)
        print("COMPANY_INDEX_REPAIR_ATTEMPT",json.dumps({"release_changed":release!=old_release,"cached_index":bool(cached),"stamp":stamp}),flush=True)
        try:
            with tempfile.TemporaryDirectory() as folder:
                folder=Path(folder)
                report=run_import(meta,folder)
                candidate=dict(schema=1,status="ok",checked=stamp,success=stamp,report=report,import_attempt=stamp,import_attempt_release=release,index_attempt=stamp,index_retry_revision=INDEX_RETRY_REVISION)
                counts=quality(candidate)
                if d["report"] and report["year"]==d["report"]["year"]:
                    old=quality(d)
                    if any(counts[k]<old[k]*.9 for k in ("corporate_income_records","corporate_employment_records")):raise ValueError("Существенная потеря охвата")
                if d["report"] and report["year"]<d["report"]["year"]:raise ValueError("Старая редакция")
                try:
                    if not index.matches_report(cached or index.empty(),report):
                        stage=folder/"index";stage.mkdir()
                        with sqlite3.connect(folder/"company-pilot.sqlite") as db:
                            built=index.create(db,report,stage)
                        index.install(out,stage,built,report)
                    print("COMPANY_INDEX_PUBLISHED",json.dumps(index.quality(json.loads((out/index.FILE).read_text()),out)),flush=True)
                except Exception as e:
                    index.publish(out)
                    candidate["index_error"]=str(e)[:220]
                    print("COMPANY_INDEX_NOT_PUBLISHED",candidate["index_error"],flush=True)
                d=candidate
        except Exception as e:
            d.update(status="cached" if d["report"] else "unavailable",checked=stamp,error=str(e)[:220])
            if not cached:d["index_error"]="Не удалось восстановить индекс: "+str(e)[:180]
            print("COMPANY_INDEX_REPAIR_FAILED",str(e)[:220],flush=True)
    elif not cached:
        print("COMPANY_INDEX_REPAIR_DEFERRED",json.dumps({"refresh":refresh,"sources_ready":ready,"due":due,"last_attempt":d.get("index_attempt")}),flush=True)
    quality(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8");return d
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--sources",required=True,type=Path);parser.add_argument("--output",required=True,type=Path)
    mode=parser.add_mutually_exclusive_group();mode.add_argument("--limit-members",type=int,default=1000);mode.add_argument("--full",action="store_true")
    args=parser.parse_args()
    if not 1<=args.limit_members<=100000:raise ValueError("Лимит тестовой выборки")
    report=run_import(json.loads(args.sources.read_text()),args.output,None if args.full else args.limit_members)
    if args.full:
        from datetime import datetime,timezone
        stamp=datetime.now(timezone.utc).isoformat()
        d=dict(schema=1,status="ok",checked=stamp,success=stamp,report=report)
        print("FULL_IMPORT_COUNTS",quality(d),flush=True)
        (args.output/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
if __name__=="__main__":main()
