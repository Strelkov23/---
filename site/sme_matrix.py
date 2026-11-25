"""Public diagnostic aggregate, not an official or fully reconciled register."""
import json,re,hashlib,os
from collections import Counter
from pathlib import Path
from datetime import date
FILE="sme-matrix.json"
NOTE="Расчёт из полного XML-архива ФНС. Совпадение регионального числа ЮЛ не подтверждает точность отдельных классов. Только территории с совпавшим итогом; не общероссийская оценка."
def empty():return dict(schema=1,status="not_loaded",note=NOTE)
def quality(d):
    if d.get("schema")!=1 or d.get("note")!=NOTE:raise ValueError("Паспорт матрицы")
    if d.get("status")=="not_loaded":
        if d!=empty():raise ValueError("Пустой паспорт")
        return {"sme_matrix_regions":0,"sme_matrix_cells":0}
    if d.get("status")!="diagnostic":raise ValueError("Статус матрицы")
    date.fromisoformat(d["edition"])
    for k in ("archive_sha256","report_sha256","reference_sha256"):
        if not re.fullmatch(r"[0-9a-f]{64}",d[k]):raise ValueError("Хеш")
    if d["xml_total"]!=d["xml_processed"] or not 0<d["xml_total"]<=30000:raise ValueError("Неполный архив")
    if d["national_imported"]-d["national_official"]!=d["national_difference"]:raise ValueError("Расхождение РФ")
    rows=d["regions"];codes=set();matched={}
    for r in rows:
        k=r["region"];a=r["official"];b=r["imported"]
        if k in codes or not re.fullmatch(r"\d{2}|missing",k) or type(b) is not int or b<0 or a is not None and (type(a) is not int or a<0):raise ValueError("Регион")
        codes.add(k)
        if r["difference"]!=(None if a is None else b-a):raise ValueError("Разность")
        if a is not None and r["difference"]==0:matched[k]=b
    if not 80<=len(matched)<=100 or sum(r["imported"] for r in rows)!=d["national_imported"]:raise ValueError("Охват")
    cells=0
    for key in ("declared","reported"):
        seen=set();totals=Counter()
        for r in d[key]:
            k,c,n=r["region"],r["class"],r["count"]
            if k not in matched or (k,c) in seen or not re.fullmatch(r"\d{2}|missing_or_other_version",c) or type(n) is not int or n<=0:raise ValueError("Ячейка")
            seen.add((k,c));totals[k]+=n;cells+=1
        if any(totals[k]!=v for k,v in matched.items()):raise ValueError("Баланс матрицы")
    return {"sme_matrix_regions":len(matched),"sme_matrix_cells":cells}
def compact(raw,ref):
    if len(raw)>32*1024*1024:raise ValueError("Размер отчёта")
    import sme_regions
    sme_regions.quality(ref)
    r=json.loads(raw);rec=r["reconciliation"];counts=r["counts"]
    if r["mode"]!="full" or r["edition"]!=ref["period"] or rec["sha256"]!=ref["sha256"] or rec["national_official"]!=ref["national"]["legal"] or rec["national_imported"]!=r["unique_legal"]:raise ValueError("Редакция")
    if counts["documents"]!=counts["legal"]+counts["individual_excluded"] or counts["legal"]-counts.get("exact_duplicates",0)-counts.get("quarantined",0)!=r["unique_legal"]:raise ValueError("Баланс документов")
    official={x["code"]:x["legal"] for x in ref["rows"]};actual=r["region_counts"]
    regions=[dict(region=k,official=official.get(k),imported=actual.get(k,0),difference=actual.get(k,0)-official[k] if k in official else None) for k in sorted(set(official)|set(actual))]
    if regions!=rec["rows"]:raise ValueError("Сверка региона")
    matched={x["region"] for x in regions if x["difference"]==0}
    d=dict(schema=1,status="diagnostic",note=NOTE,edition=r["edition"],archive_sha256=r["archive_sha256"],report_sha256=hashlib.sha256(raw).hexdigest(),reference_sha256=ref["sha256"],xml_total=r["xml_total"],xml_processed=r["xml_processed"],national_imported=r["unique_legal"],national_official=ref["national"]["legal"],national_difference=rec["national_difference"],quarantined=counts.get("quarantined",0),regions=regions)
    for key in ("declared","reported"):
        totals=Counter();seen=set()
        for x in r[key+"_matrix"]:
            pair=(x["region"],x["class"])
            if pair in seen or type(x["count"]) is not int or x["count"]<=0:raise ValueError("Дубликат или число")
            seen.add(pair);totals[x["region"]]+=x["count"]
        if dict(totals)!=actual:raise ValueError("Баланс исходной матрицы")
        d[key]=[x for x in r[key+"_matrix"] if x["region"] in matched]
    quality(d);return d
def publish(out,previous):
    d=empty()
    try:
        old=json.loads((previous/FILE).read_text());quality(old);d=old
    except (OSError,ValueError,KeyError,TypeError):pass
    source=os.environ.get("SME_MATRIX_REPORT")
    if source:
        try:
            raw=Path(source).read_bytes();ref=json.loads((out/"sme-regions.json").read_text());candidate=compact(raw,ref)
            if d.get("edition","")<=candidate["edition"]:d=candidate
        except (OSError,ValueError,KeyError,TypeError) as e:print("SME_MATRIX_NOT_IMPORTED",str(e)[:180],flush=True)
    quality(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,separators=(",",":")),encoding="utf-8")

def render_reconciliation(d):
    """Use the actual published edition, not a fixed count from an earlier run."""
    import html
    quality(d)
    if d["status"]=="not_loaded":return "Диагностический срез пока не опубликован."
    def fmt(n):return format(n,",").replace(",", " ")
    def diff(n):return ("+" if n>0 else "")+fmt(n)
    matched=[r for r in d["regions"] if r["official"] is not None and r["difference"]==0]
    excluded=[r for r in d["regions"] if r["official"] is None or r["difference"]!=0]
    details=[]
    for r in excluded:
        label="код "+html.escape(r["region"])
        if r["official"] is None:label+=": нет отдельного официального итога; импортировано "+fmt(r["imported"])
        else:label+=": расхождение "+diff(r["difference"])
        details.append(label)
    return ("Срез "+d["edition"]+": "+fmt(d["xml_processed"])+" из "+fmt(d["xml_total"])+" XML; "+fmt(d["national_imported"])+" уникальных ЮЛ; официальный итог "+fmt(d["national_official"])+"; расхождение "+diff(d["national_difference"])+". Совпали итоги "+str(len(matched))+" территорий; карантин "+fmt(d["quarantined"])+". "+("Исключены: "+"; ".join(details)+". " if details else "")+"Только диагностическая классификация.")
