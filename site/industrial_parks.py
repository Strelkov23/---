"""Public association catalogue, regional infrastructure inventory, not a factory register."""
import csv,json,hashlib,re,unicodedata
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit
from datetime import date,timedelta
from collections import Counter
from urllib.request import Request,urlopen
SOURCE="https://indparks.ru/catalog/regions/"
CERTIFICATES="https://indparks.ru/certification/parks/"
OFFICIAL="https://gisp.gov.ru/pp794/p/pub/"
MAX=15_000_000
NOTE="Карточки каталога АИП, включая различные стадии проектов и ОЭЗ. Не полный государственный реестр, не количество заводов и не свидетельство работы резидентов. Признак сертификации на карточке не подтверждает действительность сертификата. Адреса, контакты, координаты и технические мощности не импортируются."
TYPES={"Гринфилд","Браунфилд","Комплексный"}
VOID={"meta","link","input","img","br","hr","source","area","wbr","base","embed","param","col","track"}
def clean(s):return " ".join(unicodedata.normalize("NFC",s).split())
class Node:
    def __init__(self,tag="",attrs=None):
        self.tag=tag;self.attrs=attrs or {};self.children=[]
    def has(self,c):return c in self.attrs.get("class","").split()
    def find(self,c):
        for n in self.children:
            if isinstance(n,Node):
                if n.has(c):yield n
                yield from n.find(c)
    def text(self):return clean(" ".join(n.text() if isinstance(n,Node) else n for n in self.children))
class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.root=Node();self.stack=[self.root]
    def handle_starttag(self,tag,attrs):
        n=Node(tag,dict(attrs));self.stack[-1].children.append(n)
        if tag not in VOID:
            if len(self.stack)>150:raise ValueError("HTML depth")
            self.stack.append(n)
    def handle_startendtag(self,tag,attrs):
        self.stack[-1].children.append(Node(tag,dict(attrs)))
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:self.stack=self.stack[:i];break
    def handle_data(self,s):
        if self.stack[-1].tag not in ("script","style"):self.stack[-1].children.append(s)
def one(node,cls):
    a=list(node.find(cls))
    if len(a)!=1:raise ValueError("Unexpected "+cls+" count: "+str(len(a)))
    return a[0]
def safe_link(value):
    if not value:return None
    u=urljoin(SOURCE,value);p=urlsplit(u)
    if p.scheme!="https" or p.netloc!="indparks.ru" or not p.path.startswith("/catalog/") or p.query or p.fragment:return None
    return u
def key(region,name):
    return hashlib.sha256((region+"\x00"+name).encode()).hexdigest()[:24]
def parse(raw):
    if not 0<len(raw)<=MAX:raise ValueError("HTML size")
    p=Tree();p.feed(raw.decode("utf-8-sig"));p.close()
    declared=one(p.root,"list-catalog-ajax__count").text()
    m=re.fullmatch(r"Найдено\s+(\d+)\s+предложени[йея]",declared)
    if not m:raise ValueError("Unknown catalogue count: "+declared)
    rows=[];seen_regions=set()
    for g in p.root.find("list-catalog__group"):
        # Region heading is a direct child, never an inferred address.
        headers=[n for n in g.children if isinstance(n,Node) and n.has("text-heading-3")]
        if len(headers)!=1:raise ValueError("Ambiguous region heading")
        region=headers[0].text()
        if not region or region in seen_regions:raise ValueError("Duplicate/empty region")
        seen_regions.add(region)
        for card in g.find("card-accordion"):
            n=one(card,"card-accordion__title");name=n.text()
            if not name or len(name)>300:raise ValueError("Invalid park name")
            flags=[t.text() for t in card.find("card-accordion__feature-title") if t.text() in TYPES]
            if len(set(flags))>1:raise ValueError("Conflicting infrastructure types")
            badge=any(t.text()=="Сертифицирован" for t in card.find("card-accordion__tooltip"))
            rows.append(dict(region=region,name=name,type=flags[0] if flags else None,card_certified=badge,url=safe_link(n.attrs.get("href")),id=key(region,name)))
    if len(rows)!=int(m[1]) or len(rows)!=len(list(p.root.find("card-accordion"))) or not 100<=len(rows)<=3000 or not 40<=len(seen_regions)<=100:raise ValueError("Catalogue coverage mismatch")
    # Same display names in the same region are retained as records, not merged.
    counts=Counter(r["id"] for r in rows)
    return [dict(r,ambiguous_name=counts[r["id"]]>1,record=i+1) for i,r in enumerate(rows)]
def empty(stamp):
    return dict(schema=1,built=stamp,source=SOURCE,certificate_register=CERTIFICATES,official_register=OFFICIAL,note=NOTE,status="not_loaded",checked=None,success=None,sha256=None,rows=[])
def quality(d):
    if d["schema"]!=1 or d["source"]!=SOURCE or d["status"] not in ("ok","cached","unavailable","not_loaded"):raise ValueError("Catalogue metadata")
    rows=d["rows"]
    if rows and (not re.fullmatch("[0-9a-f]{64}",d["sha256"] or "") or not d["success"] or d["status"] not in ("ok","cached") or not 100<=len(rows)<=3000):raise ValueError("Catalogue provenance")
    if not rows and d["status"] in ("ok","cached"):raise ValueError("Empty catalogue")
    counts=Counter(r["id"] for r in rows);regions={r["region"] for r in rows}
    if rows and not 40<=len(regions)<=100:raise ValueError("Regional coverage")
    for i,r in enumerate(rows,1):
        if set(r)!={"region","name","type","card_certified","url","id","ambiguous_name","record"} or r["record"]!=i or not r["region"] or not r["name"] or r["id"]!=key(r["region"],r["name"]) or r["type"] not in TYPES|{None} or type(r["card_certified"]) is not bool or r["ambiguous_name"]!=(counts[r["id"]]>1) or (r["url"] is not None and safe_link(r["url"])!=r["url"]):raise ValueError("Invalid catalogue record")
    return dict(park_catalogue_records=len(rows),park_catalogue_regions=len(regions),park_catalogue_badges=sum(r["card_certified"] for r in rows),park_catalogue_ambiguous_records=sum(r["ambiguous_name"] for r in rows))
FIELDS=["record","region","name","type","card_certified","ambiguous_name","url","id"]
def verify_csv(path,d):
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if reader.fieldnames!=FIELDS:raise ValueError("Park CSV schema")
        actual=list(reader)
    expected=[{k:"" if r[k] is None else str(r[k]) for k in FIELDS} for r in d["rows"]]
    if actual!=expected:raise ValueError("Park CSV mismatch")
def publish(out,previous,stamp,refresh):
    d=empty(stamp)
    try:
        old=json.loads((previous/"industrial-parks.json").read_text(encoding="utf-8"));quality(old)
        d={**old,"built":stamp}
        if d["rows"]:d["status"]="cached"
    except (OSError,ValueError,TypeError,KeyError):pass
    due=not d["checked"] or date.fromisoformat(stamp[:10])>=date.fromisoformat(d["checked"][:10])+timedelta(days=7 if d["checked"]==d["success"] else 2)
    if refresh and due:
        try:
            with urlopen(Request(SOURCE,headers={"User-Agent":"EconomicMonitor/2.5 (public research catalogue)"}),timeout=25) as f:
                if f.geturl()!=SOURCE:raise ValueError("Unexpected catalogue redirect")
                raw=f.read(MAX+1)
            rows=parse(raw)
            if d["rows"] and len(rows)<0.8*len(d["rows"]):raise ValueError("Unexpected catalogue coverage decline; retain previous edition")
            candidate={**empty(stamp),"rows":rows,"status":"ok","checked":stamp,"success":stamp,"sha256":hashlib.sha256(raw).hexdigest()}
            quality(candidate);d=candidate
        except Exception as e:d.update(status="cached" if d["rows"] else "unavailable",checked=stamp,error=str(e)[:250])
    quality(d)
    (out/"industrial-parks.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"industrial-parks.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows(d["rows"])
    return d
