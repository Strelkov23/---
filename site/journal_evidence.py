"""Versioned journal classification evidence, not article-level indexing.
The recorded verification date belongs to the curated source set; there is
no independent real-time verification or inferred historical tag interval.
"""
import json,hashlib,re
from datetime import date,datetime
from html import escape
from urllib.parse import urlsplit
from collections import Counter

FILE="journal-evidence.json"
NOTE="Классификация относится к журналу, а не к конкретной статье. Сохранённые редакции справочника не доказывают непрерывность индексации; исторические уровни Белого списка приводятся только за явно указанные годы. Отсутствие метки означает отсутствие подтверждения в справочнике, а не исключение из базы. Ссылки относятся к совокупности меток, если отдельное доказательство не указано."

def issn_valid(s):
    if not isinstance(s,str) or not re.fullmatch(r"[0-9]{4}-[0-9]{3}[0-9X]",s):return False
    digits=s.replace("-","")
    return sum((10 if x=="X" else int(x))*(8-i) for i,x in enumerate(digits))%11==0

def valid_url(s):
    try:
        u=urlsplit(s)
        return u.scheme in ("https","http") and bool(u.hostname) and u.username is None and u.password is None and u.port in (None,80,443)
    except (ValueError,TypeError):return False

def canonical(name,m):
    if not issn_valid(m["issn"]) or not isinstance(name,str) or not name.strip():raise ValueError("ISSN или название журнала")
    if not isinstance(m["tags"],list) or not m["tags"] or any(not isinstance(x,str) or not x for x in m["tags"]) or len(set(m["tags"]))!=len(m["tags"]):raise ValueError("Метки справочника")
    if not isinstance(m["sources"],list) or not m["sources"] or not all(valid_url(x) for x in m["sources"]) or not valid_url(m["site"]):raise ValueError("Источники справочника")
    date.fromisoformat(m["verified"])
    history=m.get("white_history",{})
    if not isinstance(history,dict) or any(not re.fullmatch(r"20[0-9]{2}",y) or type(level) is not int or not 1<=level<=4 for y,level in history.items()):raise ValueError("Исторические уровни")
    return dict(issn=m["issn"],journal=name,tags=sorted(m["tags"]),sources=sorted(set(m["sources"])),site=m["site"],verified=m["verified"],white_history=history,note=m.get("note",""),evidence_scope="journal_registry_set")

def encode(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False)
def fingerprint(x):return hashlib.sha256(encode(x).encode("utf-8")).hexdigest()

def setup(db):
    db.execute("""create table if not exists journal_evidence_versions(
        issn text not null,hash text not null,captured text not null,payload text not null,
        primary key(issn,hash))""")

def collect(db,registry,articles,stamp):
    setup(db)
    current=[canonical(name,m) for name,m in registry.items()]
    if len({m["issn"] for m in current})!=len(current):raise ValueError("Дубли ISSN")
    with db:
        for m in current:
            db.execute("insert or ignore into journal_evidence_versions values(?,?,?,?)",(m["issn"],fingerprint(m),stamp,encode(m)))
    counts=Counter(a["journal"] for a in articles)
    rows=[]
    for m in sorted(current,key=lambda x:x["journal"]):
        versions=[]
        for h,c,p in db.execute("select hash,captured,payload from journal_evidence_versions where issn=? order by captured,hash",(m["issn"],)):
            versions.append(dict(sha256=h,captured=c,record=json.loads(p)))
        rows.append(dict(current=m,current_sha256=fingerprint(m),articles=counts[m["journal"]],versions=versions))
    return dict(schema=1,built=stamp,note=NOTE,journals=rows)

def quality(data,literature):
    if data["schema"]!=1 or data["note"]!=NOTE:raise ValueError("Схема истории журналов")
    expected={m["issn"]:canonical(name,m) for name,m in literature["registry"].items()}
    counts=Counter(a["journal"] for a in literature["articles"])
    seen=set();versions=0
    for row in data["journals"]:
        m=row["current"];issn=m["issn"]
        if issn in seen or expected.get(issn)!=m or row["current_sha256"]!=fingerprint(m) or row["articles"]!=counts[m["journal"]]:raise ValueError("Редакция справочника не соответствует каталогу")
        seen.add(issn);hs=set()
        for v in row["versions"]:
            old=v["record"]
            if old["issn"]!=issn or canonical(old["journal"],old)!=old or v["sha256"]!=fingerprint(old) or v["sha256"] in hs:raise ValueError("Некорректная историческая редакция")
            dt=datetime.fromisoformat(v["captured"])
            if dt.tzinfo is None:raise ValueError("Дата регистрации без часового пояса")
            hs.add(v["sha256"]);versions+=1
        if row["current_sha256"] not in hs:raise ValueError("Текущая редакция отсутствует в истории")
    if seen!=set(expected):raise ValueError("Неполный реестр журналов")
    return dict(journal_evidence_journals=len(seen),journal_evidence_versions=versions)

def render(data):
    e=lambda x:escape(str(x),quote=True)
    body='<section class="mast"><p class="kicker">Научно-исследовательский центр</p><h1>Классификация научных журналов</h1><p>'+e(NOTE)+'</p><p><a href="papers.html">Поиск статей</a> · <a href="'+FILE+'">Скачать историю JSON</a></p></section><section><h2>Паспорта журналов</h2><p>Дата проверки — дата, зафиксированная в исходном справочнике. Дата регистрации — дата сохранения его редакции в архиве сайта.</p>'
    for row in data["journals"]:
        m=row["current"]
        body+='<article><h3>'+e(m["journal"])+'</h3><p>ISSN '+e(m["issn"])+' · '+e(row["articles"])+' статей в каталоге · проверка '+e(m["verified"])+'</p><p>'+e(" · ".join(m["tags"]))+'</p>'
        if m["note"]:body+='<p>'+e(m["note"])+'</p>'
        body+='<p><a href="'+e(m["site"])+'">Сайт журнала</a> · '+ ' · '.join('<a href="'+e(url)+'">Источник '+str(i)+'</a>' for i,url in enumerate(m["sources"],1))+'</p>'
        if m["white_history"]:body+='<p>Белый список, указанные годы: '+e("; ".join(y+": уровень "+str(level) for y,level in sorted(m["white_history"].items())))+'</p>'
        body+='<details><summary>Сохранённые редакции ('+str(len(row["versions"]))+')</summary><ul>'
        for v in row["versions"]:
            x=v["record"]
            body+='<li>'+e(v["captured"])+' · дата проверки '+e(x["verified"])+' · '+e(", ".join(x["tags"]))+' · '+ ' · '.join('<a href="'+e(url)+'">Источник '+str(i)+'</a>' for i,url in enumerate(x["sources"],1))+'</li>'
        body+='</ul></details></article>'
    return body+'</section>'

def publish(page,out,db,stamp):
    literature=json.loads((out/"literature.json").read_text(encoding="utf-8"))
    data=collect(db,literature["registry"],literature["articles"],stamp);quality(data,literature)
    (out/FILE).write_text(encode(data),encoding="utf-8")
    page("journal-evidence.html",render(data))
    return data
