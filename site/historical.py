"""Discover official statistical files, import unambiguous annual regional tables.
Keep source URLs, sheet/cell coordinates, original units and explicit failure states.
"""
import json,re,io,math,ssl,hashlib,zipfile,csv
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit,unquote
from urllib.request import Request,urlopen
from datetime import date
from collections import defaultdict

SOURCES=[
 ("regions","Росстат · Социально-экономические показатели субъектов","https://rosstat.gov.ru/folder/210/document/47652"),
 ("yearbook","Росстат · История России с 1991 года","https://rosstat.gov.ru/folder/210/document/13396"),
 ("accounts","Росстат · Национальные счета","https://rosstat.gov.ru/statistics/accounts"),
 ("investment","Росстат · Инвестиции","https://rosstat.gov.ru/investment_nonfinancial"),
 ("population","Росстат · Демография","https://rosstat.gov.ru/folder/12781"),
 ("prices","Росстат · Цены","https://rosstat.gov.ru/statistics/price"),
 ("shortterm","Росстат · Краткосрочные показатели","https://www.rosstat.gov.ru/compendium/document/50802"),
 ("emiss","ЕМИСС · Паспорт среднегодового населения","https://fedstat.ru/indicator/31556"),
 ("emiss_grp","ЕМИСС · Валовой региональный продукт","https://fedstat.ru/indicator/61497"),
 ("budget","Казначейство · Федеральный бюджет","https://roskazna.gov.ru/ispolnenie-byudzhetov/federalnyj-byudzhet"),
 ("budget_consolidated","Казначейство · Консолидированный бюджет РФ","https://roskazna.gov.ru/ispolnenie-byudzhetov/konsolidirovannyj-byudzhet-rf-i-byudzhetov-gosudarstvennyh-vnebyudzhetnyh-fondov"),
 ("budget_regions","Казначейство · Бюджеты субъектов","https://roskazna.gov.ru/ispolnenie-byudzhetov/konsolidirovannye-byudzhety-subektov-rossijskoj-federacii"),
]
REGIONAL_ZIPS={
 "population":"01","labor":"02","grp":"08","investment":"10","industry":"12"
}
MIRROR="https://storage.yandexcloud.net/tochno-st-catalog/Rosstat/data_regions_collection_102_v20260313/"
MIRROR_PAGE="https://tochno.st/datasets/regions_collection"
PRIMARY="https://rosstat.gov.ru/folder/210/document/13204"
def norm(v):return " ".join(str(v if v is not None else "").lower().replace("ё","е").split())
def allowed(url):
    try:
        u=urlsplit(url);h=u.hostname or ""
        return u.scheme=="https" and not u.username and not u.password and u.port in (None,443) and (h=="storage.yandexcloud.net" or any(h==d or h.endswith("."+d) for d in ("rosstat.gov.ru","fedstat.ru","roskazna.gov.ru","cbr.ru","budget.gov.ru")))
    except ValueError:return False
class Anchors(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.links=[];self.href=None;self.label=[]
    def handle_starttag(self,tag,attrs):
        if tag=="a":self.href=dict(attrs).get("href");self.label=[]
    def handle_data(self,s):
        if self.href:self.label.append(s)
    def handle_endtag(self,tag):
        if tag=="a" and self.href:
            self.links.append((self.href," ".join(" ".join(self.label).split())));self.href=None
def get(url,limit):
    if not allowed(url):raise ValueError("Неразрешённый источник")
    context=ssl.create_default_context()
    cert=Path(__file__).with_name("rosstat-root.pem")
    if cert.exists():context.load_verify_locations(cafile=str(cert))
    with urlopen(Request(url,headers={"User-Agent":"EconomicsMonitor/2.3"}),timeout=18,context=context) as r:
        if not allowed(r.geturl()):raise ValueError("Перенаправление вне источников")
        b=r.read(limit+1)
        if len(b)>limit:raise ValueError("Превышен размер")
        return b,r.headers.get_content_charset() or "utf-8"
def discover(raw,base):
    p=Anchors();p.feed(raw);result={}
    for href,title in p.links:
        url=urljoin(base,href)
        path=unquote(urlsplit(url).path).lower()
        if allowed(url) and re.search(r"\.(xlsx|xls|csv|zip|rar|pdf)$",path):
            result[url]={"url":url,"title":title or unquote(path.rsplit("/",1)[-1]),"format":path.rsplit(".",1)[-1]}
    return list(result.values())
def numeric(v):
    if isinstance(v,bool) or v is None:return None
    try:
        if isinstance(v,str):
            v=v.strip().replace("\u00a0","").replace(" ","").replace(",",".").replace("−","-")
            if not re.fullmatch(r"-?\d+(?:\.\d+)?",v):return None
        x=float(v);return x if math.isfinite(x) else None
    except (ValueError,TypeError):return None
def year(v):
    x=norm(v)
    m=re.fullmatch(r"(19[89]\d|20[0-2]\d)(?:\s*г\.?)?",x)
    return int(m[1]) if m else None
def region_like(v):
    s=norm(v)
    return bool(s and re.search(r"республик|област|край|округ|москва|санкт-петербург|севастопол|российская федерация",s) and len(s)<130 and not re.search(r"в том числе|итого|субъект|на душу|численность|инвестиции|валовой",s))
# Selection is intentionally conservative: only exact indicator concepts and explicit units.
SPECS=[
 ("GRP","Валовой региональный продукт в текущих основных ценах",r"валов(?:ой|ого) региональн(?:ый|ого) продукт",r"млн\.?\s*руб",r"душу|индекс|структур|дол[яи]|сопоставим|темп"),
 ("INV","Инвестиции в основной капитал в фактически действовавших ценах",r"инвестици[ияй] в основной капитал",r"млн\.?\s*руб",r"душу|индекс|структур|дол[яи]|сопоставим|темп|источник|без субъект|не относящ"),
 ("POP","Численность населения",r"численность (?:постоянного )?населения",r"тыс\.?\s*человек",r"трудоспособ|среднегод|городск|сельск|возраст|прирост|мужчин|женщин"),
]
def parse_xlsx(raw,code,pattern,unit,exclude):
    import openpyxl
    book=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    records=[]
    try:
        for sheet in book:
            rows=list(sheet.iter_rows(values_only=True,max_row=min(sheet.max_row or 400,400),max_col=min(sheet.max_column or 100,100)))
            header=" ".join(norm(x) for row in rows[:8] for x in row if x is not None)
            if not re.search(pattern,header) or not re.search(unit,header) or re.search(exclude,header):continue
            # A row with at least 3 distinct years, monotonically increasing.
            candidates=[]
            for i,row in enumerate(rows[:15]):
                cols=[(j,year(x)) for j,x in enumerate(row) if year(x)]
                ys=[y for j,y in cols]
                if len(ys)>=3 and ys==sorted(set(ys)):candidates.append((i,cols))
            if len(candidates)!=1:continue
            i,cols=candidates[0]
            local=[]
            for rn,row in enumerate(rows[i+1:],i+2):
                labels=[(j,str(x).strip()) for j,x in enumerate(row[:cols[0][0]]) if region_like(x)]
                if len(labels)!=1:continue
                region=labels[0][1]
                for j,y in cols:
                    v=numeric(row[j]) if j<len(row) else None
                    if v is not None and v>=0:
                        local.append({"indicator":code,"region":region,"year":y,"value":v,"unit":"тыс. человек" if code=="POP" else "млн руб.","sheet":sheet.title,"row":rn,"column":j+1,"note":"Единица и заголовок проверены; границы территории как в источнике."})
            if len(set(x["region"] for x in local))>=10:records.extend(local)
    finally:book.close()
    return records
def mirror_rows(raw,section):
    """Accept only explicit long-format schemas. Never infer which field is value."""
    result=[]
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        candidates=[x for x in z.infolist() if x.filename.lower().endswith(".csv") and x.file_size<60_000_000]
        for member in candidates:
            with z.open(member) as f:
                reader=csv.DictReader(io.TextIOWrapper(f,encoding="utf-8-sig"),delimiter=";")
                fields={norm(x):x for x in (reader.fieldnames or [])}
                def field(*names):return next((fields[n] for n in names if n in fields),None)
                keys={
                  "region":field("region","region_name","territory","территория","регион","name_region"),
                  "year":field("year","год"),
                  "value":field("value","значение","indicator_value"),
                  "title":field("indicator","indicator_name","indicator_title","показатель","название показателя","name_indicator"),
                  "unit":field("unit","units","единица измерения","единица","measure"),
                  "note":field("comment","comments","note","примечание","комментарий"),
                  "code":field("indicator_id","indicator_code","id_indicator","code","код показателя"),
                }
                if any(not keys[k] for k in ("region","year","value","title","unit")):continue
                for r in reader:
                    def val(k):return str(r.get(keys[k],"") or "").strip()
                    y=year(val("year"));v=numeric(val("value"));title=val("title");unit=val("unit");region=val("region")
                    if not y or v is None or not title or not unit or not region:continue
                    # Keep definitions separate by exact title, unit and provider code.
                    code=hashlib.sha256((val("code")+"|"+title+"|"+unit).encode()).hexdigest()[:16]
                    result.append({"indicator":"R_"+code,"title":title,"region":region,"year":y,"value":v,"unit":unit,"sheet":member.filename,"row":reader.line_num,"column":None,"note":val("note")})
                    if len(result)>200000:raise ValueError("Слишком большой раздел; требуется выборочная загрузка")
    if not result:raise ValueError("Не распознана документированная структура CSV")
    return result
def publish(db,stamp,out,refresh):
    db.execute("create table if not exists hist_sources(code text primary key,checked text,success text,status text,files text)")
    db.execute("create table if not exists hist_values(indicator text,region text,year integer,unit text,value real,seen text,source text,payload text,primary key(indicator,region,year,unit,source,seen))")
    sources=[]
    for code,title,url in SOURCES:
        old=db.execute("select checked,success,status,files from hist_sources where code=?",(code,)).fetchone()
        files=json.loads(old[3]) if old else []
        if refresh and (not old or (old[0] or "")[:10]!=stamp[:10]):
            try:
                raw,enc=get(url,5_000_000);found=discover(raw.decode(enc,errors="replace"),url)
                if not found and code not in ("emiss","emiss_grp"):raise ValueError("Ссылки на файлы не распознаны")
                files=found
                db.execute("insert or replace into hist_sources values(?,?,?,?,?)",(code,stamp,stamp,"Найдено файлов: "+str(len(files)),json.dumps(files,ensure_ascii=False)))
            except Exception as e:
                db.execute("insert into hist_sources values(?,?,null,?,?) on conflict(code) do update set checked=excluded.checked,status=excluded.status",(code,stamp,"Ошибка: "+str(e)[:180],json.dumps(files,ensure_ascii=False)))
        c=db.execute("select checked,success,status,files from hist_sources where code=?",(code,)).fetchone()
        sources.append(dict(code=code,title=title,url=url,checked=c[0] if c else None,success=c[1] if c else None,status=c[2] if c else "Ожидается загрузка",files=json.loads(c[3]) if c else files))
    def store(rows,url,title,kind):
        # Reject conflicting duplicates within a file. Do not sum overlapping territories.
        grouped=defaultdict(list)
        for r in rows:grouped[(r["indicator"],r["region"],r["year"],r["unit"])].append(r)
        accepted=[]
        for key,rr in grouped.items():
            if len(set(r["value"] for r in rr))!=1:continue
            r=rr[0];r.update(source=url,kind=kind,title=r.get("title",title),seen=stamp)
            prev=db.execute("select value from hist_values where indicator=? and region=? and year=? and unit=? and source=? order by seen desc limit 1",(*key,url)).fetchone()
            if not prev or prev[0]!=r["value"]:
                accepted.append((*key,r["value"],stamp,url,json.dumps(r,ensure_ascii=False)))
        with db:db.executemany("insert or ignore into hist_values values(?,?,?,?,?,?,?,?)",accepted)
        return len(grouped)
    if refresh:
        # At most one official workbook for each concept per run; no guessing of columns.
        for code,title,pat,unit,exclude in SPECS:
            matches=[f for s in sources for f in s["files"] if f["format"]=="xlsx" and re.search(pat,norm(f["title"])) and not re.search(exclude,norm(f["title"]))]
            if matches:
                f=matches[0]
                try:
                    raw,_=get(f["url"],24_000_000);rows=parse_xlsx(raw,code,pat,unit,exclude)
                    if not rows:raise ValueError("Не распознана однозначная таблица")
                    n=store(rows,f["url"],title,"Росстат · прямой импорт")
                    sources.append(dict(code="import_"+code,title=title,url=f["url"],checked=stamp,success=stamp,status="Ключей: "+str(n),files=[]))
                except Exception as e:sources.append(dict(code="import_"+code,title=title,url=f["url"],checked=stamp,success=None,status="Ошибка: "+str(e)[:160],files=[]))
        # One bounded independent processed archive per update; rotate sections.
        section=list(REGIONAL_ZIPS)[date.fromisoformat(stamp[:10]).toordinal()%len(REGIONAL_ZIPS)]
        url=MIRROR+"data_"+REGIONAL_ZIPS[section]+"_socio_economic_102_v20260313.zip"
        try:
            raw,_=get(url,35_000_000);n=store(mirror_rows(raw,section),url,section,"Росстат · обработка «Если быть точным», CC BY 4.0")
            sources.append(dict(code="mirror_"+section,title="Архив регионов: "+section,url=url,checked=stamp,success=stamp,status="Ключей: "+str(n),files=[]))
        except Exception as e:sources.append(dict(code="mirror_"+section,title="Архив регионов: "+section,url=url,checked=stamp,success=None,status="Ошибка: "+str(e)[:160],files=[]))
    # Publish bounded sets grouped by indicator and source, never merge across providers.
    series={}
    for row in db.execute("""select payload from (select payload,row_number() over(partition by indicator,region,year,unit,source order by seen desc) rn from hist_values) where rn=1 order by indicator,region,year"""):
        r=json.loads(row[0])
        key=r["indicator"]+"_"+hashlib.sha256(r["source"].encode()).hexdigest()[:10]
        group=series.setdefault(key,dict(title=r["title"],unit=r["unit"],kind=r["kind"],source=r["source"],values=[]))
        group["values"].append({k:r[k] for k in ("region","year","value","sheet","row","column","note","seen")})
    # Split into independent data files to avoid giant initial download.
    folder=out/"regional-data";folder.mkdir(exist_ok=True)
    catalog=[]
    for key,s in series.items():
        file=key+".json";(folder/file).write_text(json.dumps(s,ensure_ascii=False,allow_nan=False),encoding="utf-8")
        catalog.append(dict(code=key,title=s["title"],unit=s["unit"],kind=s["kind"],source=s["source"],file="regional-data/"+file,count=len(s["values"]),regions=len(set(r["region"] for r in s["values"])),first=min(r["year"] for r in s["values"]),last=max(r["year"] for r in s["values"])))
    (out/"historical.json").write_text(json.dumps(dict(built=stamp,sources=sources,series=catalog,mirror=MIRROR_PAGE,primary=PRIMARY),ensure_ascii=False,allow_nan=False),encoding="utf-8")
    return ["История · "+s["title"]+" · "+s["status"] for s in sources if s["status"].startswith("Ошибка")]
