"""Local catalogue coverage, not a bibliometric census of journal output."""
import csv,re
from collections import Counter,defaultdict
from html import escape
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from literature import TOPICS
FIELDS=("journal","issn","year","records","complete_bibliography","with_access_metadata")
REGISTRY_FIELDS=("journal","issn","records")
TOPIC_FIELDS=("topic","year","records","denominator")
NOTE="Числа относятся к локальному каталогу DOI, а не к общему выпуску журналов. Нулевой охват года не означает отсутствие публикаций. Темы определены по заголовкам, одна статья может иметь несколько тем; суммы тематических категорий не равны числу уникальных статей. Годы, следующие за годом сборки, отмечаются как будущие; неизвестный год не приравнивается к нулю."
def complete(p):
    return bool(p.get("authors") and p.get("volume") and p.get("issue") and (p.get("pages") or p.get("article_number")))
def collect(lit,stamp):
    asof=date.fromisoformat(stamp[:10]);journal=defaultdict(Counter);topic=Counter();years=Counter();seen=set()
    registry=lit["registry"]
    for p in lit["articles"]:
        doi=p["doi"]
        if doi in seen:raise ValueError("Повтор DOI")
        seen.add(doi)
        y=str(p.get("published",""))[:4]
        if not re.fullmatch(r"\d{4}",y) or not 1991<=int(y)<=asof.year+1:y="unknown"
        name=p["journal"]
        if name not in registry:raise ValueError("Журнал вне реестра")
        c=journal[name,y];c["records"]+=1;c["complete_bibliography"]+=complete(p);c["with_access_metadata"]+=bool(p.get("access_observed"))
        years[y]+=1
        tags=set(str(p.get("topics") or "").split(" · "))-{""}
        if not tags:tags={"Прочие экономические исследования"}
        if not tags<=set(TOPICS)|{"Прочие экономические исследования"}:raise ValueError("Неизвестная тема")
        for tag in tags:topic[tag,y]+=1
    rows=[dict(journal=name,issn=registry[name]["issn"],year=y,**{k:c[k] for k in FIELDS[3:]}) for (name,y),c in sorted(journal.items())]
    groups=[dict(topic=tag,year=y,records=n,denominator=years[y]) for (tag,y),n in sorted(topic.items())]
    if sum(r["records"] for r in rows)!=len(seen) or any(r["records"]>r["denominator"] for r in groups):raise ValueError("Баланс")
    return dict(schema=1,as_of=asof.isoformat(),note=NOTE,records=len(seen),registry_journals=[dict(journal=name,issn=registry[name]["issn"],records=sum(r["records"] for r in rows if r["journal"]==name)) for name in sorted(registry)],years=dict(sorted(years.items())),rows=rows,topics=groups)
def csv_value(v):
    s=str(v)
    return "'"+s if s[:1] in ("=","+","-","@","\t","\r") else s
def save_csv(path,fields,rows):
    with path.open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows({k:csv_value(r[k]) for k in fields} for r in rows)
def verify_csv(path,fields,rows):
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if reader.fieldnames!=list(fields) or list(reader)!=[{k:csv_value(r[k]) for k in fields} for r in rows]:raise ValueError("CSV охвата")
def search_link(year,journal=None,topic=None,metadata=None):
    if year=="unknown":return None
    params={"catalogue-view":"coverage","from":year,"to":year}
    if journal:params["journal"]=journal
    if topic:params["theme"]=topic
    if metadata:params["paper-meta"]=metadata
    return "papers.html?"+urlencode(params)
def render(d):
    e=lambda v:escape(str(v),quote=True)
    body='<section id="literature-period-coverage"><h2>Охват каталога по годам и темам</h2><p>'+e(NOTE)+'</p><p><a href="literature-journals.csv">CSV всех журналов</a> · <a href="literature-years.csv">CSV журналов и годов</a> · <a href="literature-topics.csv">CSV тем и годов</a></p><div class="table-scroll" tabindex="0" role="region" aria-label="Охват по годам"><table><thead><tr><th scope="col">Год</th><th scope="col">Записей</th></tr></thead><tbody>'
    def link(label,url):return '<a href="'+e(url)+'">'+e(label)+'</a>' if url else e(label)
    for y,n in d["years"].items():body+='<tr><td>'+e(("Год не определён" if y=="unknown" else y+" · будущий" if int(y)>int(d["as_of"][:4]) else y))+'</td><td>'+link(n,search_link(y))+'</td></tr>'
    body+='</tbody></table></div>'
    for j in d["registry_journals"]:
        name=j["journal"]
        rs=[r for r in d["rows"] if r["journal"]==name]
        if not rs:
            body+='<p>'+e(name)+' · '+e(j["issn"])+' — 0 записей в локальном каталоге; полнота выпуска не установлена.</p>'
            continue
        body+='<details><summary>'+e(name)+' · '+e(sum(r["records"] for r in rs))+' записей</summary><div class="table-scroll" tabindex="0" role="region" aria-label="'+e(name)+'"><table><thead><tr><th>Год</th><th>Статей</th><th>Полная библиография</th><th>Метаданные доступа</th></tr></thead><tbody>'
        for r in rs:
            y=r["year"];body+='<tr><td>'+e(y)+'</td><td>'+link(r["records"],search_link(y,journal=name))+'</td><td>'+link(r["complete_bibliography"],search_link(y,journal=name,metadata="complete"))+'</td><td>'+e(r["with_access_metadata"])+'</td></tr>'
        body+='</tbody></table></div></details>'
    body+='<h3>Тематические разрезы</h3><p>Доля — записи с данной темой / все записи соответствующего года. Темы могут пересекаться.</p>'
    for topic in sorted({r["topic"] for r in d["topics"]}):
        rs=[r for r in d["topics"] if r["topic"]==topic]
        body+='<details><summary>'+e(topic)+'</summary><div class="table-scroll" tabindex="0" role="region" aria-label="'+e(topic)+'"><table><thead><tr><th scope="col">Год</th><th scope="col">Записей</th><th scope="col">Знаменатель</th><th scope="col">Доля</th></tr></thead><tbody>'
        for r in rs:
            share=f'{100*r["records"]/r["denominator"]:.1f}'.replace(".",",")+" %"
            body+='<tr><td>'+e(r["year"])+'</td><td>'+link(r["records"],search_link(r["year"],topic=topic))+'</td><td>'+e(r["denominator"])+'</td><td>'+e(share)+'</td></tr>'
        body+='</tbody></table></div></details>'
    return body+'</section>'
