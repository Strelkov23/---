"""Diagnostic exact-INN profile shards, separate from financial and EGRUL identity."""
import gzip,hashlib,json,re,shutil
from collections import Counter
from pathlib import Path
from datetime import date
import company_index as ci
from company_import import inn_valid

FILE="sme-profile-index.json"
DIR="sme-profile-index"
BUCKETS=ci.BUCKETS
COLUMNS=["inn","ogrn","region","declared","dver","reported","rver","member","accepted_ordinal"]
MAX_BYTES=96*1024*1024
MAX_BLOCK=4*1024*1024
MAX_RAW=16*1024*1024
BATCH=400
NOTE="Диагностический срез ЮЛ реестра МСП, точное объединение с финансовым индексом по ИНН. ОКВЭД и регион относятся к дате среза МСП, не к финансовому году. Только территории с совпавшим числом ЮЛ. Нет сведений об ИП, адресов или контактов; не ЕГРЮЛ."
def filename(n):return f"{DIR}/inn-{n:03d}.json.gz"
def digest(raw):return hashlib.sha256(raw).hexdigest()
def unpack(raw):
    import io
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as z:body=z.read(MAX_RAW+1)
    if len(body)>MAX_RAW:raise ValueError("Размер распакованного блока")
    return json.loads(body)
def fingerprint(d):
    return digest(ci.encode({k:d[k] for k in ("financial_year","financial_fingerprint","sme_edition","sme_archive_sha256","reference_sha256","columns","buckets","regions","count","members","files")}))
def validate_row(r,members,regions):
    if not isinstance(r,list) or len(r)!=len(COLUMNS) or not isinstance(r[0],str) or not inn_valid(r[0]):raise ValueError("ИНН")
    ogrn=r[1]
    if not isinstance(ogrn,str) or not re.fullmatch(r"\d{13}",ogrn) or int(ogrn[:12])%11%10!=int(ogrn[-1]) or r[2] not in regions:raise ValueError("ОГРН/регион")
    for i,j in ((3,4),(5,6)):
        if (r[i] is None)!=(r[j] is None) or r[i] is not None and (not isinstance(r[i],str) or not re.fullmatch(r"\d{2}(?:\.\d{1,2}){0,2}",r[i]) or r[j] not in ("2001","2014")):raise ValueError("ОКВЭД")
    if type(r[7]) is not int or not 0<=r[7]<len(members) or type(r[8]) is not int or r[8]<1 or r[8]>members[r[7]]["documents"]:raise ValueError("Координата XML")
def quality(d,root,index,linked,deep=False,financial_root=None):
    if d.get("schema")!=1 or d.get("status")!="diagnostic" or d.get("note")!=NOTE or d.get("columns")!=COLUMNS or d.get("buckets")!=BUCKETS:raise ValueError("Паспорт")
    if index.get("status")!="ready" or linked.get("status")!="diagnostic" or (d["financial_year"],d["financial_fingerprint"])!=(index["year"],index["fingerprint"]) or any(d[k]!=linked[k] for k in ("financial_year","financial_fingerprint","sme_edition","sme_archive_sha256","reference_sha256")):raise ValueError("Редакции")
    date.fromisoformat(d["sme_edition"])
    if any(not re.fullmatch(r"[a-f0-9]{64}",d[k]) for k in ("financial_fingerprint","sme_archive_sha256","reference_sha256")):raise ValueError("Хеш")
    expected=Counter()
    for r in linked["declared"]:expected[r["region"]]+=r["matched"]
    if d["regions"]!=dict(sorted(expected.items())) or d["count"]!=linked["counts"]["included"] or sum(expected.values())!=d["count"]:raise ValueError("Покрытие")
    members=d["members"];seen=set()
    if not isinstance(members,list) or not 0<len(members)<=30000:raise ValueError("Справочник XML")
    for m in members:
        if set(m)!={"filename","sha256","documents"} or not isinstance(m["filename"],str) or not m["filename"].lower().endswith(".xml") or m["filename"] in seen or not re.fullmatch(r"[a-f0-9]{64}",m["sha256"]) or type(m["documents"]) is not int or m["documents"]<1:raise ValueError("XML")
        seen.add(m["filename"])
    if set(d["files"])!={filename(i) for i in range(BUCKETS)} or d["fingerprint"]!=fingerprint(d):raise ValueError("Набор блоков")
    count=size=0;regions=Counter()
    for i in range(BUCKETS):
        name=filename(i);e=d["files"][name]
        if type(e["count"]) is not int or e["count"]<0 or type(e["bytes"]) is not int or not 0<e["bytes"]<=MAX_BLOCK or not re.fullmatch(r"[a-f0-9]{64}",e["sha256"]):raise ValueError("Блок")
        raw=(root/name).read_bytes()
        if len(raw)!=e["bytes"] or digest(raw)!=e["sha256"]:raise ValueError("Хеш блока")
        count+=e["count"];size+=e["bytes"]
        if deep:
            rows=unpack(raw)
            if not isinstance(rows,list) or len(rows)!=e["count"]:raise ValueError("Размер блока")
            previous=""
            if financial_root is None:raise ValueError("Нет финансовых блоков для глубокой сверки")
            f=ci.filename(i);fe=index["files"][f];fr=(financial_root/f).read_bytes()
            if len(fr)!=fe["bytes"] or digest(fr)!=fe["sha256"]:raise ValueError("Финансовый блок")
            allowed={r[0] for r in json.loads(gzip.decompress(fr))}
            for r in rows:
                validate_row(r,members,d["regions"])
                if r[0]<=previous or ci.bucket(r[0])!=i or r[0] not in allowed:raise ValueError("Дубль, порядок или отсутствующий ИНН")
                previous=r[0];regions[r[2]]+=1
    if count!=d["count"] or size>MAX_BYTES or deep and any(regions[k]!=n for k,n in expected.items()):raise ValueError("Баланс профилей или бюджет")
    return {"profiles":count,"compressed_bytes":size,"regions":len(expected)}
def create(db,financial_root,report,linked,out):
    index=json.loads((financial_root/ci.FILE).read_text(encoding="utf-8"))
    ci.quality(index,financial_root)
    if report["mode"]!="full" or report["xml_total"]!=report["xml_processed"] or report["edition"]!=linked["sme_edition"] or report["archive_sha256"]!=linked["sme_archive_sha256"] or report["reconciliation"]["sha256"]!=linked["reference_sha256"]:raise ValueError("Неподтверждённые редакции")
    eligible={r["region"] for r in report["reconciliation"]["rows"] if r["difference"]==0 and r["official"] is not None and r["region"]!="00"}
    expected=Counter()
    for r in linked["declared"]:expected[r["region"]]+=r["matched"]
    if set(expected)!=eligible:raise ValueError("Территории")
    member_rows=list(db.execute("SELECT id,filename,sha256,documents FROM members ORDER BY id"))
    members=[dict(filename=f,sha256=h,documents=n) for _,f,h,n in member_rows];member_index={row[0]:i for i,row in enumerate(member_rows)}
    d=dict(schema=1,status="diagnostic",note=NOTE,columns=COLUMNS,buckets=BUCKETS,count=0,regions=dict(sorted(expected.items())),members=members,files={},**{k:linked[k] for k in ("financial_year","financial_fingerprint","sme_edition","sme_archive_sha256","reference_sha256")})
    out.mkdir(parents=True,exist_ok=True);(out/DIR).mkdir()
    try:
        for i in range(BUCKETS):
            f=ci.filename(i);entry=index["files"][f];raw=(financial_root/f).read_bytes()
            if len(raw)!=entry["bytes"] or digest(raw)!=entry["sha256"]:raise ValueError("Изменился финансовый индекс")
            ids=[r[0] for r in json.loads(gzip.decompress(raw))]
            if len(ids)!=entry["count"] or ids!=sorted(set(ids)):raise ValueError("Финансовые ИНН")
            rows=[]
            for pos in range(0,len(ids),BATCH):
                batch=ids[pos:pos+BATCH]
                q="SELECT inn,ogrn,region,declared,dver,reported,rver,member,accepted_ordinal FROM org WHERE inn IN ("+",".join("?" for _ in batch)+") ORDER BY inn"
                for r in db.execute(q,batch):
                    if r[2] not in eligible:continue
                    row=list(r);row[7]=member_index[row[7]];validate_row(row,members,eligible);rows.append(row)
            name=filename(i);body=ci.encode(rows)
            if len(body)>MAX_RAW:raise ValueError("Размер профилей")
            raw=gzip.compress(body,compresslevel=6,mtime=0)
            if len(raw)>MAX_BLOCK:raise ValueError("Размер блока")
            (out/name).write_bytes(raw);d["files"][name]=dict(count=len(rows),bytes=len(raw),sha256=digest(raw));d["count"]+=len(rows)
            if sum(e["bytes"] for e in d["files"].values())>MAX_BYTES:raise ValueError("Бюджет индекса профилей")
        d["fingerprint"]=fingerprint(d)
        q=quality(d,out,index,linked,deep=True,financial_root=financial_root)
        (out/FILE).write_bytes(ci.encode(d));print("SME_PROFILE_INDEX",json.dumps(q,ensure_ascii=False),flush=True)
        return d
    except Exception:
        shutil.rmtree(out/DIR,ignore_errors=True);(out/FILE).unlink(missing_ok=True);raise
