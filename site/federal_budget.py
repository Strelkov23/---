"""Documentary fallback: article 1 of final federal budget execution laws, 2010–2025.
The legal text copies are not a live Treasury feed. No estimates or unapproved plans.
"""
import csv,json
from datetime import date
from decimal import Decimal
from html import escape
from urllib.parse import urlsplit
SOURCE="https://pravo.gov.ru/"
TRANSCRIBED="2026-11-25"
METRICS={"revenue":"Доходы федерального бюджета","expenditure":"Расходы федерального бюджета","balance":"Сальдо федерального бюджета (доходы минус расходы)"}
NOTE="Документальный снимок статьи 1 законов об исполнении федерального бюджета. Числа сверены по доступным текстовым копиям законов; автоматическая загрузка оригиналов Казначейства и повторная сверка официальных публикаций не подтверждены. Текущие цены, итог года; не консолидированный бюджет РФ."
LAWS=[
    (2010,"2011-10-07","272-ФЗ","8305414366.8","10117454466.6","-1812040099.8","https://base.garant.ru/12190566/1cafb24d049dcd1e7707a22d98e9858f/"),
    (2011,"2012-10-02","151-ФЗ","11367652622.6","10925617418.3","442035204.3","https://sudact.ru/law/federalnyi-zakon-ot-02102012-n-151-fz-ob/federalnyi-zakon/statia-1/"),
    (2012,"2013-09-30","254-ФЗ","12855540621.1","12894986746.7","-39446125.6","https://base.garant.ru/70462800/1cafb24d049dcd1e7707a22d98e9858f/"),
    (2013,"2014-10-04","280-ФЗ","13019939484.9","13342921640.3","-322982155.4","https://sudact.ru/law/federalnyi-zakon-ot-04102014-n-280-fz-ob/federalnyi-zakon/statia-1/"),
    (2014,"2015-10-05","276-ФЗ","14496880495.7","14831575911.0","-334695415.3","https://www.consultant.ru/document/cons_doc_LAW_186926/2b7f88742da5abad05b8bc29a84947176c096cff/"),
    (2015,"2016-10-31","377-ФЗ","13659242939.4","15620252569.9","-1961009630.5","https://base.garant.ru/71527398/1cafb24d049dcd1e7707a22d98e9858f/"),
    (2016,"2017-10-16","287-ФЗ","13460040690.5","16416446839.2","-2956406148.7","https://base.garant.ru/71788554/1cafb24d049dcd1e7707a22d98e9858f/"),
    (2017,"2018-10-11","354-ФЗ","15088914843.3","16420303082.7","-1331388239.4","https://base.garant.ru/72073820/1cafb24d049dcd1e7707a22d98e9858f/"),
    (2018,"2019-10-16","332-ФЗ","19454369032.0","16713002710.4","2741366321.6","https://bazanpa.ru/gd-rf-zakon-n332-fz-ot16102019-h4535579/"),
    (2019,"2020-10-15","314-ФЗ","20188796808.5","18214517482.9","1974279325.6","https://base.garant.ru/74759114/1cafb24d049dcd1e7707a22d98e9858f/"),
    (2020,"2021-10-25","361-ФЗ","18719089935.2","22821554464.1","-4102464528.9","https://base.garant.ru/402967992/1cafb24d049dcd1e7707a22d98e9858f/"),
    (2021,"2022-07-14","249-ФЗ","25286377583.5","24762100431.1","524277152.4","https://base.garant.ru/404994911/1cafb24d049dcd1e7707a22d98e9858f/"),
    (2022,"2023-07-24","329-ФЗ","27824392914.6","31118915372.3","-3294522457.7","https://base.garant.ru/407426496/1cafb24d049dcd1e7707a22d98e9858f/"),
    (2023,"2024-07-08","161-ФЗ","29124049914.5","32353847182.3","-3229797267.8","https://base.garant.ru/409324622/1cafb24d049dcd1e7707a22d98e9858f/"),
    (2024,"2025-07-23","220-ФЗ","36708608954.2","40180501752.7","-3471892798.5","https://base.garant.ru/412378644/1cafb24d049dcd1e7707a22d98e9858f/"),
    (2025,"2026-10-19","340-ФЗ","37283772222.8","42910312400.2","-5626540177.4","https://base.garant.ru/415115039/1cafb24d049dcd1e7707a22d98e9858f/"),
]
def records():
    rows=[]
    for y,law_date,number,rev,exp,bal,source in LAWS:
        a,b,c=map(Decimal,(rev,exp,bal))
        if a-b!=c or min(a,b)<=0 or date.fromisoformat(law_date).year!=y+1:raise ValueError("Некорректный итог "+str(y))
        original=dict(revenue=rev,expenditure=exp,balance=bal)
        values={k:float(Decimal(v)/Decimal(1000000)) for k,v in original.items()}
        rows.append(dict(year=y,law_date=law_date,law_number=number,article=1,source=source,source_unit="тыс. руб.",original=original,values=values))
    if [r["year"] for r in rows]!=list(range(2010,2026)):raise ValueError("Неполный документальный диапазон")
    return rows
def create(stamp):
    return dict(schema=1,built=stamp,mode="documentary",transcribed=TRANSCRIBED,source=SOURCE,unit="млрд руб.",scope="Федеральный бюджет РФ",metrics=METRICS,note=NOTE,rows=records())
CSV_FIELDS=["year","metric","title","original_thousand_rub","value_billion_rub","law_date","law_number","article","source","method"]
def csv_rows(d):
    for r in d["rows"]:
        for k,title in d["metrics"].items():
            yield dict(year=r["year"],metric=k,title=title,original_thousand_rub=r["original"][k],value_billion_rub=str(Decimal(r["original"][k])/Decimal(1000000)),law_date=r["law_date"],law_number=r["law_number"],article=r["article"],source=r["source"],method="Документальный снимок; статья 1")
def quality(d,csv_path=None):
    if d!=create(d["built"]):raise ValueError("Документальный набор не воспроизводится")
    import budget_programmes
    prior={k:Decimal(v) for k,_,v,*_ in budget_programmes.TOTALS}
    latest=d["rows"][-1]["original"]
    if Decimal(latest["revenue"])!=prior["revenue"] or Decimal(latest["expenditure"])!=prior["expenditure"] or Decimal(latest["balance"])!=-prior["deficit"]:raise ValueError("Не сходится с бюджетным паспортом 2025")
    if csv_path is not None:
        with csv_path.open(encoding="utf-8-sig",newline="") as f:
            reader=csv.DictReader(f)
            if reader.fieldnames!=CSV_FIELDS:raise ValueError("Неверные поля CSV")
            actual=list(reader)
        expected=[{k:str(v) for k,v in r.items()} for r in csv_rows(d)]
        if actual!=expected:raise ValueError("JSON/CSV mismatch")
    return dict(federal_budget_law_years=len(d["rows"]),federal_budget_law_observations=len(d["rows"])*len(METRICS),federal_budget_law_identities=len(d["rows"]))
def figure(d):
    rows=d["rows"];width=1000;top=28;bottom=310;mx=max(r["values"]["expenditure"] for r in rows)
    limit=(int(mx/10000)+1)*10000;step=900/len(rows);left=75
    y=lambda v:bottom-(bottom-top)*v/limit
    out=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 370" width="{width}" height="370" role="img" aria-label="Годовые доходы и расходы федерального бюджета, млрд рублей" font-family="Arial,sans-serif" font-size="12"><rect width="100%" height="100%" fill="white"/>']
    for i in range(6):
        v=limit*i/5
        out.append(f'<path d="M{left} {y(v):.2f} H980" stroke="#d3dedd"/><text x="68" y="{y(v)+4:.2f}" text-anchor="end" fill="#213e4b">{v:,.0f}</text>')
    for i,r in enumerate(rows):
        x=left+step*i+8
        for j,k,color in ((0,"revenue","#237b76"),(1,"expenditure","#b85a3f")):
            v=r["values"][k];xx=x+j*18;yy=y(v)
            out.append(f'<rect x="{xx:.2f}" y="{yy:.2f}" width="16" height="{bottom-yy:.2f}" fill="{color}"><title>{r["year"]} · {METRICS[k]}: {v:.3f} млрд руб.</title></rect>')
        out.append(f'<text x="{x+17:.2f}" y="330" text-anchor="middle" fill="#213e4b">{r["year"]}</text>')
    out.append('<rect x="75" y="345" width="14" height="14" fill="#237b76"/><text x="95" y="357" fill="#213e4b">Доходы</text><rect x="200" y="345" width="14" height="14" fill="#b85a3f"/><text x="220" y="357" fill="#213e4b">Расходы</text><text x="975" y="357" text-anchor="end" fill="#213e4b">млрд руб., текущие цены · ст. 1 ФЗ</text></svg>')
    return "".join(out)
def publish(page,out,stamp):
    d=create(stamp)
    (out/"federal-budget.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"federal-budget.csv").open("w",encoding="utf-8-sig",newline="") as f:
        writer=csv.DictWriter(f,fieldnames=CSV_FIELDS);writer.writeheader();writer.writerows(csv_rows(d))
    quality(d,out/"federal-budget.csv")
    svg=figure(d)
    (out/"federal-budget.svg").write_text(svg,encoding="utf-8")
    body='<section class="mast"><p class="kicker">Российская статистика · Государственные финансы</p><h1>Исполнение федерального бюджета, 2010–2025</h1><p>'+escape(NOTE)+'</p><p><a href="federal-budget.csv">Исходные значения CSV</a> · <a href="federal-budget.json">JSON</a> · <a href="consistency.html">Сверки с автоматическими источниками</a> · <a href="historical.html">Исторические источники</a> · <a href="methodology.html#federal-budget-method">Методика</a></p></section><section><h2>Доходы и расходы</h2><div class="regional-figure-scroll">'+svg+'</div><p><a href="federal-budget.svg" download>Скачать график SVG</a></p></section>'
    body+='<section><h2>Итоги по годам</h2><p>Единица — млрд рублей. Сальдо = доходы минус расходы; минус означает дефицит. В CSV сохранены исходные тыс. рублей без округления.</p><div class="table-scroll"><table><thead><tr><th>Год</th><th>Доходы</th><th>Расходы</th><th>Сальдо</th><th>Закон · статья 1</th></tr></thead><tbody>'
    for r in reversed(d["rows"]):
        cells="".join("<td>"+format(r["values"][k],",.3f").replace(","," ").replace(".",",")+"</td>" for k in METRICS)
        body+="<tr><td>"+str(r["year"])+"</td>"+cells+'<td><a href="'+escape(r["source"],quote=True)+'">'+escape(r["law_number"]+" от "+r["law_date"])+"</a> · текстовая копия</td></tr>"
    body+='</tbody></table></div></section><section><h2>Ограничения</h2><p>Суммы не скорректированы на инфляцию, не выражены в долях ВВП и не относятся к консолидированным бюджетам. Проверка тождества не подтверждает полноту всех операций. Этот снимок не заменяет прямые импорты и не обновляет будущие годы автоматически.</p></section>'
    page("federal-budget.html",body)
