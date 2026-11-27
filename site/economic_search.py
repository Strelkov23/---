"""Independent local inverted index rebuilt from the economic archive."""
import json,re
import economic_abstracts
from collections import Counter,defaultdict
from urllib.parse import quote,urlsplit
FILE="economic-search-index.json"
KINDS=("tool","series","news","paper","discovered","external","web")
NOTE="Поиск по заголовкам и метаданным опубликованного архива, не по всему интернету."
STOP=set("как что где найти мне можно нужно помоги покажи объясни это чем какой какие для при или по на в и с к у о об из за от до а".split())
SUFFIX=re.compile(r"(иями|ями|ами|ого|его|ему|ому|ыми|ими|иях|иям|ией|ия|ии|ий|ию|ие|ях|ах|ам|ом|ов|ем|ая|ые|ый|ой|ую|а|ы|у|и|е|я|ю)$")
def tokens(s):
    return [SUFFIX.sub("",w) if len(w)>=5 else w for w in re.findall(r"[a-zа-я0-9]+",str(s or "").lower().replace("ё","е")) if len(w)>=2 and w not in STOP][:200]
def safe(href):
    if not isinstance(href,str) or len(href)>2048 or any(c.isspace() or ord(c)<32 for c in href) or "\\" in href:return False
    if re.fullmatch(r"[a-zA-Z0-9_-]+\.html(?:[?#].*)?",href):return True
    try:
        p=urlsplit(href)
        return p.scheme in ("https","http") and bool(p.hostname) and p.username is None and p.password is None and p.port in (None,80,443)
    except ValueError:return False
def text(s,n):return str(s or "")[:n]
def record(kind,title,href,description="",source="",date="",code=""):
    if not isinstance(title,str) or not title.strip() or not safe(href):return None
    return dict(kind=kind,title=title[:350],href=href,description=text(description,700),source=text(source,180),date=text(date,10),code=text(code,120))
def compile_index(rows,stamp):
    docs=[];postings=defaultdict(list);seen=set()
    for r in rows:
        if not r:continue
        key=(r["kind"],r["href"])
        if key in seen:continue
        seen.add(key);i=len(docs);docs.append({k:v for k,v in r.items() if k!="abstract_text"})
        weights=Counter()
        for field,weight in (("title",5),("description",1),("source",1),("code",3)):
            for w in set(tokens(r[field])):weights[w]+=weight
        for w in set(tokens(r.get("abstract_text",""))):weights[w]+=1
        for w,weight in sorted(weights.items()):postings[w].append([i,weight])
    return dict(schema=1,built=stamp,note=NOTE,docs=docs,postings=dict(postings),counts={k:sum(r["kind"]==k for r in docs) for k in KINDS})
def read(out,name):return json.loads((out/name).read_text(encoding="utf-8"))
def build(out,stamp):
    rows=[]
    for r in read(out,"site-search.json"):
        rows.append(record("tool",r["title"],r["href"]," · ".join([text(r.get("description"),400),*map(str,r.get("questions",[]))]),r.get("section")))
    for r in read(out,"data-registry.json")["rows"]:
        rows.append(record("series",r["title"],"data-registry.html?id="+quote(r["id"],safe="")," · ".join(str(x) for x in (r.get("unit"),r.get("territory"),r.get("group"),r.get("first"),r.get("last")) if x is not None),r.get("source"),r.get("last"),r.get("code")))
    for r in read(out,"archive.json"):
        rows.append(record("news",r.get("title"),r.get("url"),r.get("topics"),r.get("source"),r.get("published")))
    for r in read(out,"literature.json")["articles"]:
        doi=r.get("doi") or ""
        if re.fullmatch(r"10\.\d{4,9}/\S+",doi):
            doc=record("paper",r.get("title"),"https://doi.org/"+quote(doi,safe="/:().-_;")," · ".join(str(x) for x in (r.get("authors"),r.get("topics")) if x),r.get("journal"),r.get("published"),doi)
            if doc and economic_abstracts.eligible(r,stamp):
                doc.update(abstract_text=r["licensed_abstract"]["text"],abstract_license=economic_abstracts.LICENSE)
            rows.append(doc)
    for code,r in read(out,"economic-ai-discovery.json")["rows"].items():
        if r["values"] and r["status"] in ("ok","error"):
            rows.append(record("discovered",r["title"],r["url"],r["definition"],"World Bank WDI",max(r["values"]),code))
    for key,r in read(out,"economic-external-research.json")["rows"].items():
        rows.append(record("external",r["title"],r["url"],"Препринт; статус рецензирования не подтверждён. "+" · ".join(r["authors"]+r["categories"]),"arXiv",r["published"],key))
    for href,r in read(out,"economic-web-crawl.json")["rows"].items():
        rows.append(record("web",r["title"],href,"Рабочее исследование FEDS; найдено "+r["first_seen"][:10]+". Дата публикации не извлечена.","Federal Reserve FEDS"))
    return compile_index(rows,stamp)
def validate(d):
    if d["schema"]!=1 or d["note"]!=NOTE or not isinstance(d["postings"],dict) or not isinstance(d["docs"],list):raise ValueError("Invalid index")
    docs=d["docs"]
    if d["counts"]!={k:sum(r["kind"]==k for r in docs) for k in KINDS}:raise ValueError("Wrong counts")
    if any(r["kind"] not in KINDS or not safe(r["href"]) or not r["title"] for r in docs):raise ValueError("Invalid document")
    if len({(r["kind"],r["href"]) for r in docs})!=len(docs):raise ValueError("Duplicate document")
    for word,posting in d["postings"].items():
        if not re.fullmatch(r"[a-zа-я0-9]+",word) or not posting:raise ValueError("Invalid term")
        last=-1
        for i,w in posting:
            if type(i) is not int or not last<i<len(docs) or type(w) is not int or not 1<=w<=11:raise ValueError("Invalid posting")
            last=i
    return {"documents":len(docs),"terms":len(d["postings"])}
def publish(out,stamp):
    d=build(out,stamp);validate(d)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
