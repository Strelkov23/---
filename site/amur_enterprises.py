"""Regional public directory: organization names and declared categories only."""
import hashlib,json,re
from datetime import date,timedelta
from html.parser import HTMLParser
from urllib.request import Request,urlopen
SOURCE="https://fond.amurobl.ru/prom-pred/"
FILE="amur-enterprises.json"
MAX=16_000_000
NOTE="Карточки каталога регионального фонда, не полный реестр и не доказательство текущего выпуска. Контактные данные и ИП исключены."
def clean(s):return re.sub(r"\s+"," ",s).strip()
class Cards(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.cards=[];self.current=None;self.heading=False;self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ("script","style"):self.skip+=1
        if self.skip:return
        if tag=="h6":self.finish();self.current={"name":[],"body":[]};self.heading=True
    def handle_endtag(self,tag):
        if tag in ("script","style"):
            self.skip=max(0,self.skip-1);return
        if tag=="h6":self.heading=False
    def handle_data(self,s):
        if self.skip or self.current is None:return
        v=clean(s)
        if v:self.current["name" if self.heading else "body"].append(v)
    def finish(self):
        if self.current:self.cards.append(self.current)
        self.current=None;self.heading=False
def parse(raw,encoding="utf-8"):
    if not 0<len(raw)<=MAX:raise ValueError("Размер HTML")
    p=Cards();p.feed(raw.decode(encoding));p.close();p.finish()
    rows=[];seen=set();matched=0
    for i,c in enumerate(p.cards,1):
        name=clean(" ".join(c["name"]))
        body=clean(" ".join(c["body"]))
        m=re.search(r"^(.*?)Н\s*\.\s*п\s*\.\s*:\s*(.*?)\s*(?:Сайт\s*:|Email\s*:|Телефон\s*:)",body,re.I)
        if not m or "Смотреть карточку" not in body:continue
        matched+=1
        # Only explicit corporate legal forms. No individual entrepreneurs,
        # contacts, websites, exact street addresses or inferred activity.
        if not re.match(r'^(?:ООО|АО|ПАО|ОАО|ЗАО|ГУП|МУП|ФГУП)(?=[\s"«])',name,re.I):continue
        category,locality=map(clean,m.groups())
        if len(name)>250 or len(category)>300 or len(locality)>100 or not locality or "@" in name+category+locality:raise ValueError("Неожиданные поля карточки")
        if re.search(r"\d{6,}|https?://|(?:ул\.|улица|дом\s+\d)",locality,re.I):continue
        key=hashlib.sha256((name.casefold()+"\t"+locality.casefold()+"\t"+category.casefold()).encode()).hexdigest()[:24]
        if key in seen:continue
        seen.add(key)
        rows.append(dict(id=key,name=name,category=category or None,locality=locality,source_card=i))
    if matched<20 or len(rows)<20:raise ValueError("Недостаточно распознанных карточек: "+str(matched)+", организаций: "+str(len(rows)))
    return sorted(rows,key=lambda r:r["id"]),matched
def quality(d):
    if d.get("schema")!=1 or d.get("source")!=SOURCE or d.get("note")!=NOTE or d.get("status") not in ("not_loaded","unavailable","ok","cached"):raise ValueError("Паспорт каталога")
    rows=d["rows"];ids=set()
    if rows and (len(rows)<20 or d["status"] not in ("ok","cached") or not d.get("success") or not re.fullmatch("[a-f0-9]{64}",d.get("sha256") or "") or d["matched"]<len(rows)):raise ValueError("Неподтверждённая редакция")
    if not rows and d["status"] in ("ok","cached"):raise ValueError("Пустой успех")
    for r in rows:
        if set(r)!={"id","name","category","locality","source_card"} or not re.fullmatch("[a-f0-9]{24}",r["id"]) or r["id"] in ids or not r["name"] or not r["locality"] or type(r["source_card"]) is not int or r["source_card"]<=0:raise ValueError("Карточка")
        ids.add(r["id"])
    return {"amur_enterprise_cards":len(rows),"amur_enterprise_localities":len({r["locality"] for r in rows})}
def fetch():
    with urlopen(Request(SOURCE,headers={"User-Agent":"Mozilla/5.0"}),timeout=25) as r:
        if r.geturl().split("?")[0].rstrip("/")!=SOURCE.rstrip("/"):raise ValueError("Неожиданный адрес")
        return r.read(MAX+1),r.headers.get_content_charset() or "utf-8"
def publish(out,previous,stamp,refresh,get=fetch):
    d=dict(schema=1,source=SOURCE,note=NOTE,status="not_loaded",checked=None,success=None,sha256=None,matched=0,rows=[])
    try:
        old=json.loads((previous/FILE).read_text(encoding="utf-8"));quality(old);d=old
        if d["rows"]:d["status"]="cached"
    except (OSError,ValueError,KeyError,TypeError):pass
    due=not d["checked"] or date.fromisoformat(stamp[:10])>=date.fromisoformat(d["checked"][:10])+timedelta(days=7 if d["checked"]==d["success"] else 2)
    if refresh and due:
        try:
            raw,enc=get();rows,matched=parse(raw,enc)
            if d["rows"] and len(rows)<len(d["rows"])*.9:raise ValueError("Существенное сокращение распознанных карточек")
            d.update(rows=rows,matched=matched,sha256=hashlib.sha256(raw).hexdigest(),status="ok",checked=stamp,success=stamp);d.pop("error",None)
        except Exception as e:d.update(status="cached" if d["rows"] else "unavailable",checked=stamp,error=str(e)[:200])
    quality(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8");return d
