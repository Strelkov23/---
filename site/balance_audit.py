"""Independent arithmetic reconciliation of the detailed and aggregated domestic 2021 balance.
Not a re-extraction of the official workbook and not a certification of statistical accuracy.
"""
import csv,hashlib,json,math
from pathlib import Path
from html import escape
SOURCE="https://rosstat.gov.ru/storage/mediabank/baz_tzv-2021.xlsx"
ABS=1.0 # million rubles
REL=1e-6
def number(v):
    x=float(v)
    if not math.isfinite(x):raise ValueError("Nonfinite value")
    return x
def check(label,expected,observed):
    a,b=number(expected),number(observed)
    residual=b-a;limit=max(ABS,REL*max(abs(a),abs(b)))
    return dict(label=label,expected=a,observed=b,residual=residual,tolerance=limit,within=abs(residual)<=limit)
def audit(matrix,products,m):
    n=len(matrix);g=len(m["names"])
    if not n or not g or len(set(m["names"]))!=g:raise ValueError("Invalid dimensions")
    codes=[r["code"] for r in matrix]
    if len(set(codes))!=n or set(codes)!=set(products):raise ValueError("Product code mismatch")
    idx=[int(r["group"])-1 for r in matrix]
    if any(i<0 or i>=g for i in idx) or set(idx)!=set(range(g)):raise ValueError("Group mismatch")
    vectors={k:[number(x) for x in m[k]] for k in ("output","demand","imports")}
    if any(len(v)!=g for v in vectors.values()):raise ValueError("Invalid group vectors")
    tables={k:[[number(x) for x in row] for row in m[k]] for k in ("flows","effects")}
    if any(len(a)!=g or any(len(row)!=g for row in a) for a in tables.values()):raise ValueError("Invalid group matrices")
    L=[[number(row["L"+str(j+1)]) for j in range(n)] for row in matrix]
    y=[number(r["domestic_final_demand"]) for r in matrix]
    x=[number(products[c]["output_mln"]) for c in codes]
    imports=[number(r["import_ratio"]) for r in matrix]
    if any(v<=0 for v in x):raise ValueError("Nonpositive output")
    groups=[[i for i,k in enumerate(idx) if k==j] for j in range(g)]
    agg_output=[math.fsum(x[i] for i in a) for a in groups]
    agg_demand=[math.fsum(y[i] for i in a) for a in groups]
    # Each column is a group-specific shock in the composition of the base final demand.
    effect=[[math.fsum(L[i][j]*y[j] for i in a for j in b) for b in groups] for a in groups]
    import_effect=[math.fsum(imports[i]*L[i][j]*y[j] for i in range(n) for j in b) for b in groups]
    detailed=[check(c,x[i],math.fsum(L[i][j]*y[j] for j in range(n))) for i,c in enumerate(codes)]
    aggregation=[]
    group_balance=[]
    for i,name in enumerate(m["names"]):
        aggregation.extend([check(name+" / выпуск",agg_output[i],vectors["output"][i]),check(name+" / спрос",agg_demand[i],vectors["demand"][i]),check(name+" / импортный эффект",import_effect[i],vectors["imports"][i])])
        group_balance.append(check(name,vectors["output"][i],math.fsum(tables["flows"][i])+vectors["demand"][i]))
        for j,b in enumerate(m["names"]):aggregation.append(check(name+" ← "+b,effect[i][j],tables["effects"][i][j]))
    sets={"aggregation":aggregation,"detailed_baseline":detailed,"group_balance":group_balance}
    return dict(year=2021,source=SOURCE,units="млн руб. в оценке баланса 2021",products=n,groups=g,threshold={"absolute":ABS,"relative":REL},
       checks=sets,summary={k:dict(total=len(v),within=sum(r["within"] for r in v),max_abs=max(abs(r["residual"]) for r in v)) for k,v in sets.items()})
def read_csv(path):
    with path.open(encoding="utf-8-sig",newline="") as f:return list(csv.DictReader(f))
def publish(page,out,root=Path(".")):
    files={name:root/name for name in ("model-input.csv","products.csv","sectors.json")}
    product_rows=read_csv(files["products.csv"])
    products={r["code"]:r for r in product_rows}
    if len(products)!=len(product_rows):raise ValueError("Duplicate product code")
    result=audit(read_csv(files["model-input.csv"]),products,json.loads(files["sectors.json"].read_text(encoding="utf-8")))
    result["input_sha256"]={name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in files.items()}
    (out/"balance-audit.json").write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"balance-audit.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f,delimiter=";");w.writerow(["Проверка","Позиция","Ожидалось","Наблюдалось","Невязка","Допуск","В допуске"])
        for key,rows in result["checks"].items():
            for r in rows:w.writerow([key,r["label"],r["expected"],r["observed"],r["residual"],r["tolerance"],"да" if r["within"] else "нет"])
    names={"aggregation":"Согласование агрегирования","detailed_baseline":"Детальный выпуск L × y","group_balance":"Баланс группы: поставки + спрос"}
    body='<section class="mast"><h1>Проверка межотраслевого баланса</h1><p>Россия, 2021. Независимый пересчёт уже сохранённых входных данных. Не заменяет сверку с первичным XLSX. Расхождения не исправляются автоматически.</p><p><a href="balance-audit.csv">CSV всех проверок</a> · <a href="balance-audit.json">JSON с SHA-256 входов</a> · <a href="methodology.html#balance-audit-method">Методика</a> · <a href="'+SOURCE+'">Росстат</a></p></section>'
    body+='<div class="metrics">'
    for key,v in result["summary"].items():body+='<div class="metric"><b>'+str(v["within"])+' / '+str(v["total"])+'</b><span>'+names[key]+'</span></div>'
    body+='</div><p>Порог: max(1 млн руб., 0,000001 × максимальный модуль сравниваемых сумм). Это техническое правило, а не статистическая доверительная граница.</p>'
    for key,rows in result["checks"].items():
        body+='<section><h2>'+names[key]+'</h2><p>Максимальная абсолютная невязка: '+format(result["summary"][key]["max_abs"],".6g")+' млн руб.</p><div class="table-scroll" tabindex="0" role="region" aria-label="'+names[key]+'"><table><thead><tr><th>Позиция</th><th>Ожидалось</th><th>Наблюдалось</th><th>Невязка</th><th>Допуск</th><th>Результат</th></tr></thead><tbody>'
        for r in sorted(rows,key=lambda r:(r["within"],-abs(r["residual"]))):
            body+='<tr><td>'+escape(r["label"])+'</td>'+''.join('<td>'+format(r[k],".9g")+'</td>' for k in ("expected","observed","residual","tolerance"))+'<td>'+("В допуске" if r["within"] else "Расхождение")+'</td></tr>'
        body+='</tbody></table></div></section>'
    page("balance-audit.html",body)
    return result
