"""Full offline SME classification, legal entities only; independent of Pages builds."""
import argparse,hashlib,json,re,sqlite3,tempfile,zipfile
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
import sme_classification as s
import sme_regions as regional
from company_sources import fetch,inspect_schema

MAX_ARCHIVE=4*1024**3
MAX_UNPACKED=40*1024**3
NOTE="Полный проход реестра МСП одного среза. Только юридические лица; регион места нахождения, не площадка. ОКВЭД заявительный и отчётный отдельно. Не ЕГРЮЛ и не финансовая статистика."

def download(url,path,opener=urlopen):
    u=urlsplit(url)
    if u.scheme!="https" or u.hostname not in ("file.nalog.ru","data.nalog.ru") or u.query or u.fragment or not re.fullmatch(r"/opendata/7707329152-rsmp/data-\d{8}-structure-\d{8}\.zip",u.path):raise ValueError("URL ZIP")
    sha=hashlib.sha256();size=0
    with opener(Request(url,headers={"User-Agent":"EconomicMonitor/1.0","Accept-Encoding":"identity"}),timeout=90) as r,open(path,"wb") as f:
        target=urlsplit(r.geturl())
        if target.scheme!="https" or target.hostname not in ("file.nalog.ru","data.nalog.ru") or target.path!=u.path or target.query or target.fragment:raise ValueError("Перенаправление ZIP")
        expected=int(r.headers["Content-Length"]) if r.headers.get("Content-Length") else None
        if expected is not None and not 0<expected<=MAX_ARCHIVE:raise ValueError("Размер архива")
        while True:
            raw=r.read(1024*1024)
            if not raw:break
            size+=len(raw)
            if size>MAX_ARCHIVE:raise ValueError("Бюджет ZIP")
            sha.update(raw);f.write(raw)
    if not size or expected is not None and size!=expected:raise ValueError("Неполный ZIP")
    return sha.hexdigest(),size

def setup(db):
    db.executescript("""
    CREATE TABLE org(inn TEXT PRIMARY KEY,ogrn TEXT NOT NULL,region TEXT,declared TEXT,dver TEXT,reported TEXT,rver TEXT,category TEXT,member INTEGER,accepted_ordinal INTEGER) WITHOUT ROWID;
    CREATE TABLE members(id INTEGER PRIMARY KEY,filename TEXT UNIQUE,sha256 TEXT,documents INTEGER);
    """)

def full(db,z,edition):
    members=sorted((m for m in z.infolist() if not m.is_dir()),key=lambda m:m.filename)
    if not members or len(members)>30000 or len({m.filename for m in members})!=len(members) or any(not m.filename.lower().endswith(".xml") or not 0<m.file_size<=s.MAX_XML for m in members) or sum(m.file_size for m in members)>MAX_UNPACKED:raise ValueError("Состав XML")
    totals=Counter();quarantined=[]
    for i,m in enumerate(members,1):
        raw=z.read(m);rejected=[];rows,counts=s.parse_member(raw,edition,rejected);totals.update(counts)
        quarantined.extend(dict(member=m.filename,**r) for r in rejected)
        if len(quarantined)>10000:raise ValueError("Слишком много некорректных идентификаторов")
        db.execute("INSERT INTO members VALUES(?,?,?,?)",(i,m.filename,hashlib.sha256(raw).hexdigest(),counts["documents"]))
        for j,row in enumerate(rows,1):
            old=db.execute("SELECT inn,ogrn,region,declared,dver,reported,rver,category FROM org WHERE inn=?",(row[0],)).fetchone()
            if old is not None:
                if old!=row:raise ValueError("Конфликт ИНН "+row[0])
                totals["exact_duplicates"]+=1;continue
            db.execute("INSERT INTO org VALUES(?,?,?,?,?,?,?,?,?,?)",(*row,i,j))
        if i%250==0:
            db.commit();print("SME_PROGRESS",i,len(members),totals["legal"],flush=True)
    db.commit()
    unique=db.execute("SELECT count(*) FROM org").fetchone()[0]
    if totals["documents"]!=totals["legal"]+totals["individual_excluded"] or unique!=totals["legal"]-totals["exact_duplicates"]-totals["quarantined"] or totals["quarantined"]!=len(quarantined):raise ValueError("Баланс документов")
    def matrix(field,version):
        return [{"region":r,"class":k,"count":n} for r,k,n in db.execute(f"""SELECT coalesce(region,'missing'),CASE WHEN {version}='2014' AND {field} IS NOT NULL THEN substr({field},1,2) ELSE 'missing_or_other_version' END,count(*) FROM org GROUP BY 1,2 ORDER BY 1,2""")]
    regions=dict(db.execute("SELECT coalesce(region,'missing'),count(*) FROM org GROUP BY 1 ORDER BY 1"))
    declared=matrix("declared","dver");reported=matrix("reported","rver")
    if any(sum(r["count"] for r in m)!=unique for m in (declared,reported)) or sum(regions.values())!=unique:raise ValueError("Баланс классификации")
    return dict(mode="full",edition=edition,note=NOTE,xml_total=len(members),xml_processed=len(members),counts=dict(totals),quarantine=quarantined,unique_legal=unique,region_counts=regions,declared_matrix=declared,reported_matrix=reported,members=[dict(id=i,member=f,sha256=h,documents=n) for i,f,h,n in db.execute("SELECT * FROM members ORDER BY id")])

def reconcile(report,reference):
    regional.quality(reference)
    if reference["period"]!=report["edition"]:raise ValueError("Разные даты срезов")
    official={r["code"]:r["legal"] for r in reference["rows"]}
    actual=report["region_counts"]
    rows=[dict(region=k,official=official.get(k),imported=actual.get(k,0),difference=actual.get(k,0)-official[k] if k in official else None) for k in sorted(set(official)|set(actual))]
    return dict(period=reference["period"],source=reference["source"],sha256=reference["sha256"],national_official=reference["national"]["legal"],national_imported=report["unique_legal"],national_difference=report["unique_legal"]-reference["national"]["legal"],rows=rows,exact=report["unique_legal"]==reference["national"]["legal"] and all(r["difference"]==0 for r in rows) and not report["counts"].get("quarantined",0))

def main():
    p=argparse.ArgumentParser();p.add_argument("--output",required=True,type=Path);p.add_argument("--financial-index",type=Path);a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=True)
    raw,enc=fetch(s.SOURCE,4_000_000);meta=s.parse(raw,enc);raw,_=fetch(meta["schema"],2_000_000);schema=inspect_schema(raw)
    if not {"ИННЮЛ","ОГРН","КодРегион","КодОКВЭД","ВерсОКВЭД","ДатаСост"}<=set(schema["attributes"]):raise ValueError("Необходимые поля XSD")
    stamp=datetime.now(timezone.utc).isoformat()
    with tempfile.TemporaryDirectory() as folder:
        folder=Path(folder);archive=folder/"sme.zip"
        sha,size=download(meta["archive"],archive)
        with sqlite3.connect(folder/"org.sqlite") as db,zipfile.ZipFile(archive) as z:
            setup(db);result=full(db,z,meta["release"])
        # Fetch the official independent aggregate for the same edition, not today's date.
        regional.publish(folder,folder,meta["release"]+"T12:00:00Z",True)
        reference=json.loads((folder/"sme-regions.json").read_text())
        result.update(meta,**schema,archive_sha256=sha,archive_bytes=size,checked=stamp)
        try:result["reconciliation"]=reconcile(result,reference)
        except (ValueError,KeyError,TypeError) as e:result["reconciliation_error"]=str(e)
        (a.output/"classification.json").write_text(json.dumps(result,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
        if a.financial_index and result.get("reconciliation"):
            import sme_finance_join
            with sqlite3.connect("file:"+str((folder/"org.sqlite").resolve())+"?mode=ro",uri=True) as db:
                linked=sme_finance_join.join(db,a.financial_index,result)
            (a.output/"finance-join.json").write_text(json.dumps(linked,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
            print("SME_FINANCE_JOIN",json.dumps({k:linked[k] for k in ("financial_year","sme_edition","eligible_regions","counts")},ensure_ascii=False),flush=True)
        print("SME_FULL",json.dumps({k:result[k] for k in ("edition","xml_total","xml_processed","counts","unique_legal","archive_bytes","archive_sha256")},ensure_ascii=False),flush=True)
        print("SME_QUARANTINE",json.dumps({"count":len(result["quarantine"]),"reasons":dict(Counter(r["reason"] for r in result["quarantine"]))},ensure_ascii=False),flush=True)
        print("SME_RECONCILIATION",json.dumps(result.get("reconciliation",result.get("reconciliation_error")),ensure_ascii=False),flush=True)
        if not result.get("reconciliation",{}).get("exact"):raise SystemExit("Полный проход сохранён, но независимые итоги не совпали или недоступны; не публиковать как подтверждённый")
if __name__=="__main__":main()
