"""Diagnostic exact-INN join of two dated public FNS datasets.
Keep only aggregate output; do not impute missing monetary or employment data.
"""
import gzip,json,hashlib
from collections import Counter,defaultdict
from pathlib import Path
import company_index as idx
NOTE="Связь по ИНН: финансовый отчётный год и дата реестра МСП различаются. ОКВЭД и регион относятся к срезу МСП, не обязательно к финансовому году. Только регионы с совпавшими итогами. Не оборот отраслей и не все предприятия."
def join(db,root,report):
    index=json.loads((root/idx.FILE).read_text(encoding="utf-8"))
    idx.quality(index,root,deep=True)
    if index["status"]!="ready":raise ValueError("Нет полного финансового индекса")
    rec=report["reconciliation"]
    if report["mode"]!="full" or report["xml_total"]!=report["xml_processed"] or rec["period"]!=report["edition"]:raise ValueError("Неполный срез")
    eligible={r["region"]:r["imported"] for r in rec["rows"] if r["difference"]==0 and r["official"] is not None and r["region"]!="00"}
    if not eligible:raise ValueError("Нет сверенных территорий")
    counts=Counter();cells=defaultdict(Counter)
    def code(v,version):return v[:2] if v and version=="2014" else "missing_or_other_version"
    for name,entry in index["files"].items():
        raw=(root/name).read_bytes()
        if len(raw)!=entry["bytes"] or hashlib.sha256(raw).hexdigest()!=entry["sha256"]:raise ValueError("Изменился индекс")
        rows=json.loads(gzip.decompress(raw))
        for r in rows:
            counts["financial_index"]+=1
            found=db.execute("SELECT region,declared,dver,reported,rver FROM org WHERE inn=?",(r[0],)).fetchone()
            if found is None:counts["not_in_sme"]+=1;continue
            counts["matched_sme"]+=1
            region,d,dv,p,pv=found
            if region not in eligible:counts["excluded_region"]+=1;continue
            counts["included"]+=1
            for kind,cls in (("declared",code(d,dv)),("reported",code(p,pv))):
                c=cells[(kind,region,cls)];c["matched"]+=1
                for key,value in (("income",r[3]),("expense",r[4]),("workers",r[5])):
                    if value is not None:c[key+"_observations"]+=1;c[key+"_sum"]+=int(value)
                if r[3] is not None and r[4] is not None:c["paired_money"]+=1
                if r[3] is not None and r[5] is not None:c["income_workers_pair"]+=1
    if counts["financial_index"]!=index["count"] or counts["matched_sme"]+counts["not_in_sme"]!=index["count"] or counts["included"]+counts["excluded_region"]!=counts["matched_sme"]:raise ValueError("Баланс объединения")
    # Denominators from the full SME matrix; preserve cells with zero overlap.
    result={}
    for kind in ("declared","reported"):
        rows=[];seen=set()
        for row in report[kind+"_matrix"]:
            region,cls,total=row["region"],row["class"],row["count"]
            if region not in eligible:continue
            key=(kind,region,cls);c=cells.get(key,Counter());seen.add(key)
            if not 0<=c["matched"]<=total or any(c[k+"_observations"]>c["matched"] for k in ("income","expense","workers")):raise ValueError("Охват ячейки")
            v=dict(region=region,**{"class":cls},sme_total=total,matched=c["matched"],paired_money=c["paired_money"],income_workers_pair=c["income_workers_pair"])
            for k in ("income","expense","workers"):
                n=c[k+"_observations"];v[k+"_observations"]=n
                # Monetary sums use arbitrary-precision integers serialized as strings.
                v[k+"_sum"]=str(c[k+"_sum"]) if n else None
            rows.append(v)
        if any(k[0]==kind and k not in seen for k in cells) or sum(x["matched"] for x in rows)!=counts["included"] or sum(x["sme_total"] for x in rows)!=sum(eligible.values()):raise ValueError("Баланс матрицы объединения")
        result[kind]=rows
    return dict(schema=1,status="diagnostic",note=NOTE,financial_year=index["year"],financial_fingerprint=index["fingerprint"],financial_sources=index["sources"],sme_edition=report["edition"],sme_archive_sha256=report["archive_sha256"],reference_sha256=rec["sha256"],national_difference=rec["national_difference"],quarantined=report["counts"].get("quarantined",0),eligible_regions=len(eligible),counts=dict(counts),**result)
