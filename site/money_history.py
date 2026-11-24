"""Conservative parser for the official CBR monetary aggregates workbook.
Read only explicitly labelled stock series in rubles on the first day of the month.
"""
import io, re, math
from datetime import datetime,date
from collections import defaultdict
from urllib.request import Request,urlopen
URL="https://www.cbr.ru/vfs/statistics/credit_statistics/monetary_agg.xlsx"

def norm(v):
    return " ".join(str(v if v is not None else "").lower().replace("ё","е").split())
def period(v):
    if isinstance(v,(date,datetime)):
        d=v
    elif isinstance(v,str):
        d=None
        for fmt in ("%d.%m.%Y","%d/%m/%Y","%Y-%m-%d","%d.%m.%Y %H:%M:%S"):
            try:d=datetime.strptime(v.strip(),fmt);break
            except ValueError:pass
        if d is None:return None
    else:return None
    return d.strftime("%Y-%m") if d.day==1 and 1991<=d.year<=date.today().year else None

def label(v):
    s=norm(v)
    # Explicit aggregate code; don't accept growth rates or FX-adjusted variants.
    if re.search(r"темп|прирост|изменен|переоцен|сезон|скоррект|индекс|%|доллар",s):return None
    m=re.fullmatch(r"(?:денежный агрегат\s+)?([мm][012][хx]?)(?:\s*\((?:широкая денежная масса|денежная масса(?: в национальном определении)?|наличные деньги в обращении)\))?(?:\s*,?\s*(?:млрд|трлн|млн)\.?\s*руб\.?)?",s)
    if m:
        code=m[1].replace("м","M").replace("х","X").upper()
        return code if code in ("M0","M1","M2","M2X") else None
    return {"денежная масса (национальное определение)":"M2","широкая денежная масса":"M2X"}.get(s)

def scale(v):
    s=norm(v)
    m=re.findall(r"\b(трлн|млрд|млн)\.?\s*руб",s)
    if len(set(m))!=1:return None
    return {"трлн":1,"млрд":0.001,"млн":0.000001}[m[0]]

def numeric(v):
    if v is None or isinstance(v,bool):return None
    try:
        if isinstance(v,str):
            v=v.strip().replace(" ","").replace("\u00a0","").replace(",",".")
            if not re.fullmatch(r"\d+(?:\.\d+)?",v):return None
        n=float(v)
        return n if math.isfinite(n) and n>0 else None
    except (TypeError,ValueError):return None

def parse(raw):
    import openpyxl
    book=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    found=defaultdict(set)
    try:
        for sheet in book:
            rows=list(sheet.iter_rows(values_only=True,max_row=min(sheet.max_row or 1200,1200),max_col=min(sheet.max_column or 600,600)))
            if not rows:continue
            header=" ".join(norm(v) for row in rows[:8] for v in row if v is not None)
            # A sheet-wide unit is accepted only when unambiguous and not a rate table.
            if re.search(r"темп(?:ы|ов)? прироста|с исключением валютной переоценки|сезонно скорректирован",norm(sheet.title)):continue
            common=scale(header)
            # Vertical layout: dates in one column, aggregate labels in header row.
            for i,row in enumerate(rows[:20]):
                cols={j:label(v) for j,v in enumerate(row) if label(v)}
                if not cols:continue
                for dc in range(min(cols)):
                    dates=[(k,period(r[dc])) for k,r in enumerate(rows[i+1:],i+1) if dc<len(r) and period(r[dc])]
                    if len({d for _,d in dates})<3:continue
                    for j,code in cols.items():
                        factor=scale(row[j]) or common
                        if not factor:continue
                        for k,p in dates:
                            val=numeric(rows[k][j]) if j<len(rows[k]) else None
                            if val is not None:found[(code,p)].add(round(val*factor,9))
            # Horizontal layout: date header across columns, named stock rows below.
            for i,row in enumerate(rows[:20]):
                cols=[(j,period(v)) for j,v in enumerate(row) if period(v)]
                if len({p for _,p in cols})<3:continue
                first=cols[0][0]
                for r in rows[i+1:]:
                    codes={label(v) for v in r[:first] if label(v)}
                    if len(codes)!=1:continue
                    # Require no contradictory rate / adjusted metadata anywhere in row stub.
                    stub=" ".join(norm(v) for v in r[:first])
                    if re.search(r"темп|прирост|переоцен|сезон|%|доллар",stub):continue
                    factor=scale(stub) or common
                    if not factor:continue
                    code=next(iter(codes))
                    for j,p in cols:
                        val=numeric(r[j]) if j<len(r) else None
                        if val is not None:found[(code,p)].add(round(val*factor,9))
    finally:book.close()
    # Reject inconsistent copies of the same observation, and impossible ordering.
    data={key:next(iter(vals)) for key,vals in found.items() if len(vals)==1}
    for p in {p for _,p in data}:
        vals=[data[(k,p)] for k in ("M0","M1","M2","M2X") if (k,p) in data]
        if vals!=sorted(vals):
            data={key:v for key,v in data.items() if key[1]!=p}
    if len({p for _,p in data})<3:raise ValueError("Не распознаны однозначные ряды уровней денежных агрегатов с единицами измерения")
    return data

def fetch():
    with urlopen(Request(URL,headers={"User-Agent":"EconomicsMonitor/2.3"}),timeout=25) as r:
        raw=r.read(16_000_001)
    if len(raw)>16_000_000:raise ValueError("Превышен размер XLSX")
    return parse(raw)
