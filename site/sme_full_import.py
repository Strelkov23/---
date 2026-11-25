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

def download(url,path,opener=None):
    from stream_archive import download_zip,approved
    if not approved(url) or not re.fullmatch(r"/opendata/7707329152-rsmp/data-\d{8}-structure-\d{8}\.zip",urlsplit(url).path):raise ValueError("URL ZIP")
    return download_zip(url,path,max_bytes=MAX_ARCHIVE,timeout=90,opener=opener)

def setup(db):
    db.executescript("""
    CREATE TABLE org(inn TEXT PRIMARY KEY,ogrn TEXT NOT NULL,region TEXT,declared TEXT,dver TEXT,reported TEXT,rver TEXT,category TEXT,member INTEGER,accepted_ordinal INTEGER) WITHOUT ROWID;
    CREATE TABLE members(id INTEGER PRIMARY KEY,filename TEXT UNIQUE,sha256 TEXT,documents INTEGER);
    """)

def full(db,z,edition):
    from stream_archive import inventory_xml,read_member
    entries,_=inventory_xml(z,max_members=30000,max_member_bytes=s.MAX_XML,max_unpacked=MAX_UNPACKED,strict=True)
    members=sorted(entries,key=lambda m:m.filename)
    totals=Counter();quarantined=[]
    for i,m in enumerate(members,1):
        raw=read_member(z,m,s.MAX_XML);rejected=[];rows,counts=s.parse_member(raw,edition,rejected);totals.update(counts)
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

def select_reference(folder,edition,archived=None):
    """Use a validated same-edition aggregate already captured independently, or fetch it."""
    def validated(path):
        data=json.loads(path.read_text(encoding="utf-8"))
        regional.quality(data)
        if not data["rows"] or data.get("period")!=edition:
            raise ValueError("Нет подтверждённого агрегата ФНС за дату среза "+edition)
        return data
    if archived is not None:
        try:
            result=validated(archived)
            print("SME_REFERENCE_ARCHIVED",edition,result["sha256"],flush=True)
            return result
        except (OSError,ValueError,KeyError,TypeError,AttributeError):
            pass
    regional.publish(folder,folder,edition+"T12:00:00Z",True)
    result=validated(folder/"sme-regions.json")
    print("SME_REFERENCE_FETCHED",edition,result["sha256"],flush=True)
    return result

def reconcile(report,reference):
    regional.quality(reference)
    if not reference["rows"] or reference.get("period")!=report["edition"]:raise ValueError("Нет независимой сверки за ту же дату")
    official={r["code"]:r["legal"] for r in reference["rows"]}
    actual=report["region_counts"]
    rows=[dict(region=k,official=official.get(k),imported=actual.get(k,0),difference=actual.get(k,0)-official[k] if k in official else None) for k in sorted(set(official)|set(actual))]
    return dict(period=reference["period"],source=reference["source"],sha256=reference["sha256"],national_official=reference["national"]["legal"],national_imported=report["unique_legal"],national_difference=report["unique_legal"]-reference["national"]["legal"],rows=rows,exact=report["unique_legal"]==reference["national"]["legal"] and all(r["difference"]==0 for r in rows) and not report["counts"].get("quarantined",0))

def main():
    p=argparse.ArgumentParser();p.add_argument("--output",required=True,type=Path);p.add_argument("--financial-index",type=Path);p.add_argument("--allow-diagnostic",action="store_true");a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=True)
    raw,enc=fetch(s.SOURCE,4_000_000);meta=s.parse(raw,enc);raw,_=fetch(meta["schema"],2_000_000);schema=inspect_schema(raw)
    if not {"ИННЮЛ","ОГРН","КодРегион","КодОКВЭД","ВерсОКВЭД","ДатаСост"}<=set(schema["attributes"]):raise ValueError("Необходимые поля XSD")
    stamp=datetime.now(timezone.utc).isoformat()
    with tempfile.TemporaryDirectory() as folder:
        folder=Path(folder);archive=folder/"sme.zip"
        reference=select_reference(folder,meta["release"],a.financial_index/"sme-regions.json" if a.financial_index else None)
        sha,size=download(meta["archive"],archive)
        with sqlite3.connect(folder/"org.sqlite") as db,zipfile.ZipFile(archive) as z:
            setup(db);result=full(db,z,meta["release"])
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
        reconciliation=result.get("reconciliation")
        if not reconciliation:raise SystemExit("Независимая сверка недоступна")
        if not reconciliation["exact"]:
            print("SME_DIAGNOSTIC_ONLY",flush=True)
            if not a.allow_diagnostic:raise SystemExit("Полный проход сохранён, но независимые итоги не совпали; не публиковать как подтверждённый")
        if a.allow_diagnostic and a.financial_index and not (a.output/"finance-join.json").is_file():raise SystemExit("Не сформировано объединение")
if __name__=="__main__":main()
