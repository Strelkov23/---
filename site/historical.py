"""Discover official statistical files, import unambiguous annual regional tables.
Keep source URLs, sheet/cell coordinates, original units and explicit failure states.
"""
import json,re,io,math,ssl,hashlib,zipfile,csv
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit,unquote,quote,urlunsplit
from urllib.request import Request,urlopen
from datetime import date
from collections import defaultdict
import emiss_archive
import regional_seed

SOURCES=[
 ("regions","Росстат · Социально-экономические показатели субъектов","https://rosstat.gov.ru/folder/210/document/47652"),
 ("yearbook","Росстат · История России с 1991 года","https://rosstat.gov.ru/folder/210/document/13396"),
 ("accounts","Росстат · Национальные счета","https://rosstat.gov.ru/statistics/accounts"),
 ("investment","Росстат · Инвестиции","https://rosstat.gov.ru/investment_nonfinancial"),
 ("population","Росстат · Демография","https://rosstat.gov.ru/folder/12781"),
 ("food","Росстат · Продовольственные балансы","https://rosstat.gov.ru/enterprise_economy/"),
 ("costs","Росстат · Затраты на производство и реализацию","https://rosstat.gov.ru/statistics/instituteconomics"),
 ("finance","Росстат · Финансы организаций и задолженность","https://rosstat.gov.ru/statistics/finance"),
 ("prices","Росстат · Цены","https://rosstat.gov.ru/statistics/price"),
 ("industry","Росстат · Индексы промышленности и натуральный выпуск","https://www.rosstat.gov.ru/enterprise_industrial"),
 ("shortterm","Росстат · Краткосрочные показатели","https://www.rosstat.gov.ru/compendium/document/50802"),
 ("emiss_open","ЕМИСС · Открытые данные","https://fedstat.ru/opendata/"),
 ("emiss","ЕМИСС · Паспорт среднегодового населения","https://fedstat.ru/indicator/31556"),
 ("emiss_grp","ЕМИСС · Валовой региональный продукт","https://fedstat.ru/indicator/61497"),
 ("budget","Казначейство · Федеральный бюджет","https://roskazna.gov.ru/ispolnenie-byudzhetov/federalnyj-byudzhet"),
 ("budget_consolidated","Казначейство · Консолидированный бюджет РФ","https://roskazna.gov.ru/ispolnenie-byudzhetov/konsolidirovannyj-byudzhet-rf-i-byudzhetov-gosudarstvennyh-vnebyudzhetnyh-fondov"),
 ("budget_regions","Казначейство · Бюджеты субъектов","https://roskazna.gov.ru/ispolnenie-byudzhetov/konsolidirovannye-byudzhety-subektov-rossijskoj-federacii"),
]
REGIONAL_ZIPS={
 "population":"01","labor":"02","grp":"08","investment":"10","industry":"12","finance":"19",
 "enterprises":"11","agriculture":"13","construction":"14","trade":"15","transport":"16","innovation":"18"
}
MIRROR="https://storage.yandexcloud.net/tochno-st-catalog/Rosstat/data_regions_collection_102_v20260313/"
MIRROR_PAGE="https://tochno.st/datasets/regions_collection"
PRIMARY="https://rosstat.gov.ru/folder/210/document/13204"
def norm(v):return " ".join(str(v if v is not None else "").lower().replace("ё","е").split())
def allowed(url):
    try:
        u=urlsplit(url);h=u.hostname or ""
        return u.scheme=="https" and not u.username and not u.password and u.port in (None,443) and (h in ("storage.yandexcloud.net","datalakeiepru-s3-storage-public.storage.yandexcloud.net","repository.nsedc.ru") or any(h==d or h.endswith("."+d) for d in ("rosstat.gov.ru","fedstat.ru","roskazna.gov.ru","cbr.ru","budget.gov.ru")))
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
    p=urlsplit(url)
    encoded=urlunsplit((p.scheme,p.netloc,quote(p.path,safe="/%:@!()*+,;=-._~"),quote(p.query,safe="%=&+/:?"),""))
    with urlopen(Request(encoded,headers={"User-Agent":"EconomicsMonitor/2.3"}),timeout=18,context=context) as r:
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
            filename=unquote(urlsplit(url).path.rsplit("/",1)[-1])
            meaningful=re.sub(r"[\ue000-\uf8ff]","",title).strip()
            result[url]={"url":url,"title":filename if not meaningful or meaningful.lower() in ("xlsx","xls","csv","zip","rar","pdf") else title,"format":path.rsplit(".",1)[-1]}
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
 ("GRP","Валовой региональный продукт в текущих основных ценах",r"валов(?:ой|ого) региональн(?:ый|ого) продукт",r"(?:млн\.?\s*руб|миллионов рублей)",r"душу|индекс|структур|дол[яи]|сопоставим|темп|источник|формирование"),
 ("INV","Инвестиции в основной капитал в фактически действовавших ценах",r"инвестици[ияй] в основной капитал",r"(?:млн\.?\s*руб|миллионов рублей)",r"душу|индекс|структур|дол[яи]|сопоставим|темп|источник|без субъект|не относящ|малого предпринимательства|квартал"),
 ("POP","Численность населения",r"численность (?:постоянного )?населения",r"тыс\.?\s*человек",r"трудоспособ|среднегод|городск|сельск|возраст|прирост|мужчин|женщин"),
]
# Exact files found in the official source catalogue in the 2026-11-24 build.
DIRECT_FILES={
 "GRP": "https://rosstat.gov.ru/storage/mediabank/VRP_s1998.xlsx",
 "INV": "https://rosstat.gov.ru/storage/mediabank/Invest_sub_2000-2025.xlsx",
}
def candidates_for(code,pat,exclude,sources):
    matches=[]
    if code in DIRECT_FILES:
        url=DIRECT_FILES[code]
        matches.append({"url":url,"title":url.rsplit("/",1)[-1],"format":"xlsx"})
    for source in sources:
        for f in source["files"]:
            if f["format"]=="xlsx" and re.search(pat,norm(f["title"])) and not re.search(exclude,norm(f["title"])) and all(x["url"]!=f["url"] for x in matches):
                matches.append(f)
    return matches
def import_candidates(code,pat,unit,exclude,sources,fetch=None):
    """Try a bounded set of actual published candidates, not guessed filenames."""
    fetch=fetch or get
    errors=[]
    for f in candidates_for(code,pat,exclude,sources)[:3]:
        try:
            raw,_=fetch(f["url"],24_000_000)
            rows=parse_vrp(raw) if code=="GRP" and f["url"]==DIRECT_FILES["GRP"] else parse_xlsx(raw,code,pat,unit,exclude)
            if not rows:raise ValueError("Не распознана однозначная таблица")
            return rows,f["url"],errors
        except Exception as e:errors.append(f["url"]+" · "+str(e)[:100])
    raise ValueError("; ".join(errors)[:600] or "Нет подходящего файла в каталоге")
def import_status(db,code,title,url,stamp,status,success,files=None):
    """Persist actual attempt and most recent success independently, also across failed builds."""
    old=db.execute("select success,files from hist_sources where code=?",(code,)).fetchone()
    if success:
        saved=stamp
        kept=files or []
    else:
        saved=old[0] if old else None
        kept=json.loads(old[1]) if old else []
    db.execute("insert or replace into hist_sources values(?,?,?,?,?)",(code,stamp,saved,status,json.dumps(kept,ensure_ascii=False)))
    return dict(code=code,title=title,url=url,checked=stamp,success=saved,status=status,files=kept)
def parse_vrp(raw):
    """Read the observed Rosstat workbook layout; each title and its unit must match.
    Preserve note markers, named territory variants and the sheet period.
    Income structure tables with repeated subcolumns are not included.
    """
    import openpyxl
    specs=[
        ("GRP",r"^валовой региональный продукт по субъектам",r"в текущих ценах; миллионов рублей","млн руб.","ВРП в текущих ценах"),
        ("GRP_PC",r"^валовой региональный продукт на душу населения",r"\(рублей\)","руб.","ВРП на душу населения"),
        ("GRP_VOLUME",r"^индексы физического объема валового регионального продукта в ",r"в постоянных ценах; в процентах к предыдущему году","% к предыдущему году","Индекс физического объёма ВРП"),
        ("GRP_SHARE",r"^региональная структура валового регионального продукта",r"\(в процентах\)","%","Доля региона в суммарном ВРП"),
        ("GRP_PC_VOLUME",r"^индексы физического объема валового регионального продукта на душу населения",r"в процентах к предыдущему году","% к предыдущему году","Индекс физического объёма ВРП на душу населения"),
        ("HH_CONS",r"^фактическое конечное потребление домашних хозяйств в ",r"в текущих рыночных ценах; миллионов рублей","млн руб.","Фактическое конечное потребление домашних хозяйств"),
        ("HH_CONS_PC",r"^фактическое конечное потребление домашних хозяйств на душу населения",r"в текущих рыночных ценах; рублей","руб.","Фактическое конечное потребление домашних хозяйств на душу населения"),
    ]
    book=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    result=[]
    try:
        for sheet in book:
            rows=list(sheet.iter_rows(values_only=True,max_row=min(sheet.max_row or 400,400),max_col=min(sheet.max_column or 100,100)))
            # Identify by the exact title in its cell, not by text from data rows or contents.
            titles=[(i,norm(x)) for i,row in enumerate(rows[:8]) for x in row[:2] if x is not None]
            hits=[(i,t,spec) for i,t in titles for spec in specs if re.search(spec[1],t) and re.search(spec[2],t)]
            if len(hits)!=1:continue
            ti,caption,(code,_,__,unit,title)=hits[0]
            # The year may carry an original printed footnote, e.g. 20244).
            headers=[]
            for i in range(ti+1,min(ti+5,len(rows))):
                cols=[]
                for j,v in enumerate(rows[i][1:],1):
                    m=re.fullmatch(r"(19[89]\d|20[0-2]\d)(?:\s*\d+\))?",norm(v))
                    if m:cols.append((j,int(m[1]),str(v)))
                ys=[y for j,y,v in cols]
                if len(ys)>=3 and ys==list(range(ys[0],ys[-1]+1)) and [j for j,y,v in cols]==list(range(1,len(cols)+1)):
                    headers.append((i,cols))
            if len(headers)!=1:continue
            i,cols=headers[0]
            local=[]
            for rn,row in enumerate(rows[i+1:],i+2):
                reg=str(row[0] or "").strip()
                if not (region_like(reg) or re.match(r"^г\.\s*(москва|санкт-петербург|севастополь)",norm(reg)) or re.match(r"^чувашская республика",norm(reg)) or re.match(r"^валовой региональный продукт по субъектам российской федерации",norm(reg))):continue
                for j,y,marker in cols:
                    v=numeric(row[j]) if j<len(row) else None
                    if v is None or v<0:continue
                    local.append(dict(indicator=code,title=title,region=reg,year=y,value=v,unit=unit,sheet=sheet.title,row=rn,column=j+1,note="Заголовок: "+caption+"; обозначение года: "+marker+". Сноски и границы территории — в оригинале; не суммировать пересекающиеся территории."))
            if len(set(r["region"] for r in local))>=10:result.extend(local)
    finally:book.close()
    return result

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
# Choose a bounded set of core concepts first. Do not copy hundreds of unreviewed series
# into the SQLite archive (GitHub file size limit); all source files remain in the registry.
MIRROR_PRIORITY={
 "population":[r"^численность населения$",r"^среднегодовая численность населения$",r"^общие коэффициенты рождаемости",r"^общие коэффициенты смертности"],
 "labor":[r"^уровень безработицы",r"^среднегодовая численность занятых",r"^уровень занятости населения",r"^численность безработных"],
 "grp":[r"^валовой региональный продукт(?: \(.*\))?$",r"^валовой региональный продукт на душу населения",r"^валовое накопление основного капитала",r"^индекс.*физического объема валового регионального продукта"],
 "investment":[r"^инвестиции в основной капитал$",r"^инвестиции в основной капитал на душу населения",r"^индекс.*физического объема инвестиций в основной капитал",r"^инвестиции в основной капитал.*всего"],
 "industry":[r"^индекс.*промышленного производства.*оквэд2",r"^индекс.*производства.*обрабатывающие производства.*оквэд2",r"^индекс.*производства.*добыча полезных ископаемых.*оквэд2",r"^объем отгруженных.*обрабатывающие"],
 "finance":[r"^доходы консолидированных бюджетов субъектов",r"^расходы консолидированных бюджетов субъектов",r"^сальдированный финансовый результат",r"^удельный вес убыточных организаций"],
 "enterprises":[r"^(?:число|количество) предприятий и организаций(?:$|:)",r"^(?:число|количество) малых предприятий(?:$|:)",r"^оборот организаций(?:$|:)",r"^число средних предприятий(?:$|:)"],
 "agriculture":[r"^(?:объем )?(?:производства )?продукци[яи] сельского хозяйства(?:$|:| в хозяйствах всех категорий)",r"^индекс.*производства продукции сельского хозяйства",r"^валов(?:ой|ые) сбор(?:ы)? зерновых",r"^производство молока(?:$|:| в хозяйствах всех категорий)"],
 "construction":[r"^объем работ,? выполненных по виду экономической деятельности.{0,4}строительство",r"^ввод в действие жилых домов",r"^индекс.*физического объема работ.*строительств",r"^введено.*жилых помещений"],
 "trade":[r"^оборот розничной торговли(?:$|:)",r"^оборот розничной торговли на душу населения",r"^оборот оптовой торговли(?:$|:)",r"^объем платных услуг населению(?:$|:)"],
 "transport":[r"^перевозки грузов автомобильным транспортом",r"^грузооборот автомобильного транспорта",r"^плотность автомобильных дорог общего пользования",r"^перевозки пассажиров автобусами"],
 "innovation":[r"^внутренние затраты на исследования и разработки",r"^численность персонала,? занятого исследованиями и разработками",r"^уровень инновационной активности организаций",r"^объем инновационных товаров, работ, услуг"]
}
INDUSTRY_ACTIVITY=[
 r"производств[ао]\s+(?:текстильн[а-я]*|одежд[а-я]*|кожи|кожаных изделий)|текстильное и швейное производство",
 r"производств[ао]\s+химическ|химическое производство",
 r"производств[ао]\s+пищевых продуктов|производств[ао]\s+напитков",
 r"металлургическ[а-я]+\s+производств[ао]",
 r"производств[ао]\s+(?:машин и оборудования|автотранспортных средств|прочих транспортных средств|электрического оборудования|компьютеров,? электронных)",
 r"обеспечени[ея]\s+электрической энергией|производств[ао]\s+и распределени[ея]\s+электроэнергии"]
def select_mirror(rows,section,limit=4):
    by=defaultdict(list)
    for r in rows:by[r["indicator"]].append(r)
    picked=[]
    for pat in MIRROR_PRIORITY.get(section,[]):
        candidates=[(k,v) for k,v in by.items() if k not in picked and re.search(pat,norm(v[0]["title"]))]
        if candidates:
            # Prefer the largest complete historical series, not the first arbitrary CSV row.
            picked.append(max(candidates,key=lambda item:(len(item[1]),item[1][0]["unit"]=="млн руб.",item[0]))[0])
    if not picked and section not in {'enterprises','agriculture','construction','trade','transport','innovation'}:
        picked=[k for k,v in sorted(by.items(),key=lambda item:(-len(item[1]),item[0]))[:limit]]
    selected=[r for k in picked[:limit] for r in by[k]]
    if section=='industry':
        used=set(picked[:limit])
        for pat in INDUSTRY_ACTIVITY:
            candidates=[(k,v) for k,v in by.items() if k not in used and re.search(pat,norm(v[0]['title'])) and re.search(r'^индекс|^объем отгруженных',norm(v[0]['title']))]
            for k,v in sorted(candidates,key=lambda item:(-len(item[1]),item[0]))[:2]:
                selected.extend(v);used.add(k)
    # Include a separate nationwide budget unit only when its exact indicator title is selected.
    if section=="finance":
        titles={r["title"] for r in selected}
        selected.extend(r for k,v in by.items() if k not in picked and v[0]["title"] in titles and v[0]["unit"]=="млрд руб." for r in v)
    return selected
def mirror_rows(raw,section,selected=False):
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
                  "region":field("region","region_name","territory","территория","регион","name_region","object_name"),
                  "year":field("year","год"),
                  "value":field("value","значение","indicator_value"),
                  "title":field("indicator","indicator_name","indicator_title","показатель","название показателя","name_indicator"),
                  "unit":field("unit","units","единица измерения","единица","measure","indicator_unit"),
                  "note":field("comment","comments","note","примечание","комментарий"),
                  "code":field("indicator_id","indicator_code","id_indicator","code","код показателя"),
                }
                if any(not keys[k] for k in ("region","year","value","title","unit")):continue
                for r in reader:
                    def val(k):return str(r.get(keys[k],"") or "").strip()
                    y=year(val("year"));v=numeric(val("value"));title=val("title");unit=val("unit");region=val("region")
                    if not y or v is None or not title or not unit or not region:continue
                    # The publisher explicitly uses mixed units for nationwide budget totals.
                    original_unit=unit
                    if "для значений в целом по россии" in norm(unit):
                        if not re.fullmatch(r"миллионов рублей; для значений в целом по россии: млрд руб\.?",norm(unit)):continue
                        level=norm(r.get("object_level"))
                        if norm(region) in ("российская федерация","россия") or level in ("страна","россия","рф"):
                            unit="млрд руб."
                        elif level in ("регион","федеральный округ","фо"):
                            unit="млн руб."
                        else:continue
                    # For new large sections retain only indicators selected by the declared concepts.
                    if selected and section in {'enterprises','agriculture','construction','trade','transport','innovation'} and not any(re.search(pat,norm(title)) for pat in MIRROR_PRIORITY[section]):continue
                    # Keep definitions separate by exact title, unit and provider code.
                    code=hashlib.sha256((val("code")+"|"+title+"|"+unit+"|"+str(r.get("subsection",""))).encode()).hexdigest()[:16]
                    note=val("note")+" · Единица в оригинале: "+original_unit+" · Издание: "+str(r.get("source",""))+" · Версия: "+str(r.get("version_date",""))+" · Уровень территории: "+str(r.get("object_level",""))+" · ОКТМО: "+str(r.get("object_oktmo",""))+" · ОКАТО: "+str(r.get("object_okato",""))+" · Код показателя: "+val("code")
                    result.append({"indicator":"R_"+code,"title":title,"region":region,"year":y,"value":v,"unit":unit,"sheet":member.filename,"row":reader.line_num,"column":None,"note":note})
                    if len(result)>250000:raise ValueError("Слишком большой раздел; требуется выборочная загрузка")
    if not result:raise ValueError("Не распознана документированная структура CSV")
    return select_mirror(result,section) if selected else result

def parse_budget(raw,filename=""):
    """Annual actual federal budget totals from 0503117 only.
    Require year-end date, rubles, single actual-execution column, balance identity.
    Other report forms and monthly cumulative totals are not relabelled annual.
    """
    import openpyxl
    result=[]
    def workbook(blob,member):
        book=openpyxl.load_workbook(io.BytesIO(blob),read_only=True,data_only=True)
        try:
            for sheet in book:
                rows=list(sheet.iter_rows(values_only=True,max_row=min(sheet.max_row or 3000,3000),max_col=min(sheet.max_column or 35,35)))
                header=" ".join(norm(x) for row in rows[:20] for x in row if x is not None)
                if "0503117" not in header+" "+member or not re.search(r"рубл|оке[ий]\s*383",header):continue
                if "федеральн" not in header or "бюджет" not in header:continue
                dates=re.findall(r"\b01[./]01[./](20[0-2]\d)\b",header+" "+member)
                if len(set(dates))!=1:continue
                yr=int(dates[0])-1
                cols=set(j for row in rows[:25] for j,v in enumerate(row) if norm(v) in ("исполнено","исполнено всего","исполнение"))
                if len(cols)!=1:continue
                col=next(iter(cols));vals={}
                labels={"доходы бюджета - всего":"BUD_REV","доходы бюджета всего":"BUD_REV","доходы - всего":"BUD_REV","расходы бюджета - всего":"BUD_EXP","расходы бюджета всего":"BUD_EXP","расходы - всего":"BUD_EXP","результат исполнения бюджета":"BUD_BAL"}
                for i,row in enumerate(rows):
                    for x in row[:col]:
                        label=norm(x).replace("–","-").replace("—","-")
                        if label not in labels:continue
                        key=labels[label];v=numeric(row[col]) if col<len(row) else None
                        if v is None:continue
                        if key in vals and vals[key][0]!=v:vals[key]=(None,i+1)
                        else:vals[key]=(v,i+1)
                if any(k not in vals or vals[k][0] is None for k in ("BUD_REV","BUD_EXP","BUD_BAL")):continue
                rev,exp,bal=[vals[k][0] for k in ("BUD_REV","BUD_EXP","BUD_BAL")]
                if rev<0 or exp<0 or abs(rev-exp-bal)>max(1,abs(rev)*1e-9):continue
                for k,title in (("BUD_REV","Федеральный бюджет: исполненные доходы"),("BUD_EXP","Федеральный бюджет: исполненные расходы"),("BUD_BAL","Федеральный бюджет: сальдо исполнения")):
                    result.append(dict(indicator=k,title=title,region="Российская Федерация",year=yr,value=vals[k][0],unit="руб.",sheet=member+" / "+sheet.title,row=vals[k][1],column=col+1,note="Форма 0503117; годовой итог на 1 января следующего года. Контроль: доходы минус расходы равны сальдо."))
        finally:book.close()
    if filename.lower().endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            for item in z.infolist():
                if item.filename.lower().endswith(".xlsx") and "0503117" in item.filename and item.file_size<25_000_000:workbook(z.read(item),item.filename)
    else:workbook(raw,filename)
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
                if not found and code not in ("emiss","emiss_grp","emiss_open"):raise ValueError("Ссылки на файлы не распознаны")
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
        return sum(1 for rr in grouped.values() if len(set(r["value"] for r in rr))==1)
    # Stable published bulletin, kept as its own dated edition (also available offline).
    seed=list(regional_seed.rows())
    n=store(seed,regional_seed.SOURCE,regional_seed.TITLE,"Росстат · опубликованный бюллетень, текстовая транскрипция")
    sources.append(dict(code="nw_bulletin_2026q1",title=regional_seed.TITLE,url=regional_seed.SOURCE,checked=None,success=None,status="Транскрипция опубликованных таблиц: "+str(n)+" наблюдений; повторная доступность PDF не подтверждена",files=[]))
    if refresh:
        # Try up to three catalogued official workbooks per concept, retaining prior successes.
        for code,title,pat,unit,exclude in SPECS:
            matches=candidates_for(code,pat,exclude,sources)
            if not matches:continue
            url=matches[0]["url"]
            try:
                rows,url,errors=import_candidates(code,pat,unit,exclude,sources)
                n=store(rows,url,title,"Росстат · прямой импорт")
                if not n:raise ValueError("Нет однозначных наблюдений")
                sources.append(import_status(db,"import_"+code,title,url,stamp,"Ключей: "+str(n)+(f"; отклонено альтернатив: {len(errors)}" if errors else ""),True,[dict(url=url,title=title,format="xlsx")]))
            except Exception as e:
                sources.append(import_status(db,"import_"+code,title,url,stamp,"Ошибка: "+str(e)[:400],False))
        # Year-end federal reports only. Keep the other Treasury files in the source registry.
        budget_files=[f for x in sources if x["code"]=="budget" for f in x["files"] if f["format"] in ("zip","xlsx") and re.search(r"01[._-]01[._-]20\d\d",f["title"]+" "+unquote(f["url"])) and re.search(r"исполнени|0503117",norm(f["title"]+" "+unquote(f["url"])))]
        for f in budget_files[:3]:
            try:
                raw,_=get(f["url"],35_000_000);rows=parse_budget(raw,unquote(urlsplit(f["url"]).path.rsplit("/",1)[-1]))
                if not rows:raise ValueError("Годовая форма 0503117 не распознана")
                n=store(rows,f["url"],"Федеральный бюджет","Казначейство · прямой импорт")
                sources.append(import_status(db,"budget_import_"+hashlib.sha256(f["url"].encode()).hexdigest()[:12],"Годовое исполнение бюджета",f["url"],stamp,"Ключей: "+str(n),True,[f]))
            except Exception as e:sources.append(import_status(db,"budget_import_"+hashlib.sha256(f["url"].encode()).hexdigest()[:12],"Годовое исполнение бюджета",f["url"],stamp,"Ошибка: "+str(e)[:160],False))
        # EMISS publisher-coded historical archives: preserve every dimension and cite the primary portal.
        for code,(title,agency,unit) in emiss_archive.SPECS.items():
            url=emiss_archive.resource(code)
            try:
                rows,url=emiss_archive.retrieve(code,get,numeric,year)
                n=store(rows,url,title,agency+" · ЕМИСС, архив НЦСЭД (CC BY)")
                if not n:raise ValueError("Нет однозначных наблюдений")
                sources.append(import_status(db,"emiss_"+code,title,emiss_archive.primary(code),stamp,"Ключей: "+str(n),True,[dict(url=url,title="Файл архива НЦСЭД",format="parquet" if url.endswith(".parquet") else "csv.gz"),dict(url=emiss_archive.card(code),title="Паспорт архива НЦСЭД",format="html")]))
            except Exception as e:
                failed=import_status(db,"emiss_"+code,title,emiss_archive.primary(code),stamp,"Ошибка: "+str(e)[:250],False)
                if not failed["files"]:failed["files"]=[dict(url=emiss_archive.card(code),title="Карточка архива НЦСЭД",format="html")]
                sources.append(failed)
        # Backfill up to three not-yet-loaded sections per refresh to keep builds bounded. Afterwards rotate one per day.
        # Use published provider ZIPs with exact original indicator and unit, not derived values.
        sections=[]
        for section in REGIONAL_ZIPS:
            saved=db.execute("select success from hist_sources where code=?",("mirror_"+section,)).fetchone()
            if not saved or not saved[0]:sections.append(section)
        expanded=db.execute("select success from hist_sources where code=?",("mirror_industry_activity_v2",)).fetchone()
        if not expanded or not expanded[0]:
            sections=[s for s in sections if s!="industry"]
            sections.insert(0,"industry")
        if sections:
            # A permanently failing source must not starve later sections.
            offset=date.fromisoformat(stamp[:10]).toordinal()%len(sections)
            sections=(sections[offset:]+sections[:offset])[:3]
        else:sections=[list(REGIONAL_ZIPS)[date.fromisoformat(stamp[:10]).toordinal()%len(REGIONAL_ZIPS)]]
        for section in sections:
            code="mirror_"+section
            url=MIRROR+"data_"+REGIONAL_ZIPS[section]+"_socio_economic_102_v20260313.zip"
            try:
                raw,_=get(url,35_000_000);n=store(mirror_rows(raw,section,selected=True),url,section,"Росстат · обработка «Если быть точным», CC BY 4.0")
                if not n:raise ValueError("Нет однозначных наблюдений")
                status="Ключей выбранных основных показателей: "+str(n)
                db.execute("insert or replace into hist_sources values(?,?,?,?,?)",(code,stamp,stamp,status,"[]"))
                if section=="industry":db.execute("insert or replace into hist_sources values(?,?,?,?,?)",("mirror_industry_activity_v2",stamp,stamp,status,"[]"))
                sources.append(dict(code=code,title="Архив регионов: "+section,url=url,checked=stamp,success=stamp,status=status,files=[]))
            except Exception as e:
                status="Ошибка: "+str(e)[:160]
                db.execute("insert into hist_sources values(?,?,null,?,?) on conflict(code) do update set checked=excluded.checked,status=excluded.status",(code,stamp,status,"[]"))
                sources.append(dict(code=code,title="Архив регионов: "+section,url=url,checked=stamp,success=None,status=status,files=[]))
    # Include historical check metadata even if this build used cached data.
    present={s["code"] for s in sources}
    for code,checked,success,status,raw_files in db.execute("select code,checked,success,status,files from hist_sources"):
        if code in present or not code.startswith(("import_","emiss_","budget_import_")):continue
        files=json.loads(raw_files);url=files[0]["url"] if files else None
        if code.startswith("emiss_") and code[6:] in emiss_archive.SPECS:
            title=emiss_archive.SPECS[code[6:]][0];url=emiss_archive.primary(code[6:])
        else:title=files[0]["title"] if files else code
        if url:sources.append(dict(code=code,title=title,url=url,checked=checked,success=success,status=status,files=files))
    # Publish bounded sets grouped by indicator and source, never merge across providers.
    series={}
    for row in db.execute("""select payload from (select indicator,region,year,unit,source,payload,row_number() over(partition by indicator,region,year,unit,source order by seen desc) rn from hist_values) where rn=1 order by indicator,region,year,unit,source"""):
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
