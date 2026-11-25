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
    n=dups=conflicts=0
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
                if db.execute("SELECT 1 FROM conflicts WHERE kind=? AND inn=? AND year=?",(kind,inn,year)).fetchone():continue
                old=db.execute("SELECT * FROM "+table+" WHERE inn=? AND year=?",(inn,year)).fetchone()
                new=(inn,year,name,*vals,m.filename,j)
                if old is not None:
                    if old[:-2]==new[:-2]:dups+=1;continue
                    db.execute("DELETE FROM "+table+" WHERE inn=? AND year=?",(inn,year))
                    db.execute("INSERT INTO conflicts VALUES(?,?,?)",(kind,inn,year));conflicts+=1;continue
                db.execute("INSERT INTO "+table+" VALUES("+",".join("?" for _ in new)+")",new)
            if n and n%10000==0:db.commit()
    db.commit()
    return dict(kind=kind,year=year,xml_members=len(files),processed_members=len(selected),documents=n,exact_duplicates=dups,conflicts=conflicts,unique=db.execute("SELECT count(*) FROM "+table+" WHERE year=?",(year,)).fetchone()[0],complete=complete)
def summary(db,year,limit=100):
    # Do not call this a national ranking if only part of the files were read.
    cols="i.inn,i.name,i.income_cents,i.expense_cents,e.workers,i.member,i.doc,e.member,e.doc"
    sql="SELECT "+cols+" FROM income i LEFT JOIN employment e ON i.inn=e.inn AND i.year=e.year WHERE i.year=? AND i.income_cents IS NOT NULL ORDER BY i.income_cents DESC,i.inn LIMIT ?"
    return [dict(zip(("inn","name","income_cents","expense_cents","workers","income_member","income_doc","employment_member","employment_doc"),r)) for r in db.execute(sql,(year,limit))]
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--sources",required=True,type=Path);parser.add_argument("--output",required=True,type=Path);parser.add_argument("--limit-members",type=int,default=1000)
    args=parser.parse_args()
    if not 1<=args.limit_members<=100000:raise ValueError("Лимит тестовой выборки")
    meta=json.loads(args.sources.read_text());sources.quality(meta)
    args.output.mkdir(parents=True,exist_ok=True)
    results=[]
    with tempfile.TemporaryDirectory() as tmp,sqlite3.connect(args.output/"company-pilot.sqlite") as db:
        setup(db)
        for r in meta["rows"]:
            if not r["schema_verified"] or not set(SPEC[r["kind"]][1])<=set(r["attributes"]):raise ValueError("Нет проверенной схемы")
            file=Path(tmp)/(r["kind"]+".zip")
            sha,size=download(r["archive"],file)
            print("ARCHIVE_DOWNLOADED",r["kind"],size,sha,flush=True)
            result=import_zip(db,file,r["kind"],r["report_year"],args.limit_members)
            result.update(source=r["archive"],sha256=sha,bytes=size,schema_sha256=r["schema_sha256"])
            results.append(result);print("CORPORATE_IMPORT",json.dumps(result,ensure_ascii=False),flush=True)
            db.execute("INSERT INTO releases VALUES(?,?,?,?,?,?,?)",(r["kind"],r["report_year"],r["archive"],sha,int(result["complete"]),result["processed_members"],result["documents"]));db.commit()
            file.unlink()
        years={r["year"] for r in results}
        report=dict(schema=1,mode="pilot",sources=results,top_income_sample=summary(db,next(iter(years))) if len(years)==1 else [],note="Доходы и расходы в копейках; не выручка/чистая прибыль. Выборка первых XML файлов, не общероссийский рейтинг. Пропуски не нули.")
        (args.output/"company-pilot.json").write_text(json.dumps(report,ensure_ascii=False,allow_nan=False),encoding="utf-8")
        print("PILOT_SUMMARY",len(report["top_income_sample"]),flush=True)
if __name__=="__main__":main()
