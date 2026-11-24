"""Aggregate domestic technical coefficients and reconcile the baseline price identity."""
import csv,json,math
from pathlib import Path

SOURCE="https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx"
def construct(m,products,rows):
    n=len(m["names"])
    if n!=19 or len(m["output"])!=n or len(m["flows"])!=n or any(len(r)!=n for r in m["flows"]):raise ValueError("Invalid group matrix")
    output=m["output"]
    if any(not math.isfinite(v) or v<=0 for v in output):raise ValueError("Invalid output")
    sums=[0.0]*n;imports=[0.0]*n;seen=set()
    for r in rows:
        code=r["code"];i=int(r["group"])-1
        if code in seen or not 0<=i<n:raise ValueError("Invalid product mapping")
        seen.add(code)
        x=float(products[code]["output_mln"]);q=float(r["import_ratio"])
        if not math.isfinite(x) or not math.isfinite(q) or x<0 or q<0:raise ValueError("Invalid product costs")
        sums[i]+=x;imports[i]+=q*x
    if any(abs(a-v)>1e-7*max(1,v) for a,v in zip(sums,output)):raise ValueError("Group output does not reconcile")
    A=[[v/output[j] for j,v in enumerate(row)] for row in m["flows"]]
    if any(not math.isfinite(v) or v<0 for row in A for v in row):raise ValueError("Invalid domestic flows")
    domestic=[sum(row[j] for row in A) for j in range(n)]
    imported=[v/output[j] for j,v in enumerate(imports)]
    residual=[1-d-i for d,i in zip(domestic,imported)]
    # The accounting remainder need not be an observed gross value-added component.
    # Do not silently clip or normalize a negative remainder.
    return dict(year=2021,source=SOURCE,names=m["names"],output=output,demand=m["demand"],A=A,domestic=domestic,imported=imported,residual=residual,
      compatible=all(v>=-1e-9 for v in residual),note="Остаток 1 − отечественные промежуточные затраты − импортные промежуточные затраты; не наблюдаемая прибыль или чистая ВДС.")
def publish(out):
    m=json.loads(Path("sectors.json").read_text())
    with open("products.csv",encoding="utf-8") as f:products={r["code"]:r for r in csv.DictReader(f)}
    with open("model-input.csv",encoding="utf-8") as f:data=construct(m,products,list(csv.DictReader(f)))
    (out/"price-data.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"price-coefficients.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f);w.writerow(["group","year","output_million_rub","domestic_intermediate_share","imported_intermediate_share","accounting_remainder","source"])
        for i,name in enumerate(data["names"]):w.writerow([name,2021,data["output"][i],data["domestic"][i],data["imported"][i],data["residual"][i],SOURCE])
