"""Discover official statistical files, import unambiguous annual regional tables.
Keep source URLs, sheet/cell coordinates, original units and explicit failure states.
"""
import json,re,io,math,ssl,hashlib,zipfile,csv
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit,unquote,quote,urlunsplit
from urllib.request import Request,urlopen
from datetime import date,timedelta
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
 ("minfin_budget","Минфин · Исполнение федерального бюджета","https://minfin.gov.ru/ru/statistics/fedbud/execute/"),
 ("budget","Казначейство · Федеральный бюджет","https://roskazna.gov.ru/ispolnenie-byudzhetov/federalnyj-byudzhet"),
 ("budget_consolidated","Казначейство · Консолидированный бюджет РФ","https://roskazna.gov.ru/ispolnenie-byudzhetov/konsolidirovannyj-byudzhet-rf-i-byudzhetov-gosudarstvennyh-vnebyudzhetnyh-fondov"),
 ("budget_regions","Казначейство · Бюджеты субъектов","https://roskazna.gov.ru/ispolnenie-byudzhetov/konsolidirovannye-byudzhety-subektov-rossijskoj-federacii"),
]
REGIONAL_ZIPS={
 "population":"01","labor":"02","grp":"08","investment":"10","industry":"12","finance":"19",
 "enterprises":"11","agriculture":"13","construction":"14","trade":"15","transport":"16","innovation":"18",
 "farming":"farming","manufacturing":"industry",
 "living":"03","capital":"09","ict":"17","prices":"20","foreign_trade":"21"
}
MIRROR="https://storage.yandexcloud.net/tochno-st-catalog/Rosstat/data_regions_collection_102_v20260313/"
MIRROR_PAGE="https://tochno.st/datasets/regions_collection"
PRIMARY="https://rosstat.gov.ru/folder/210/document/13204"
def mirror_url(section):
    n=REGIONAL_ZIPS[section]
    return MIRROR+"data_"+n+("_socio_economic" if n.isdigit() else "")+"_102_v20260313.zip"
def norm(v):return " ".join(str(v if v is not None else "").lower().replace("ё","е").split())
def allowed(url):
    try:
        u=urlsplit(url);h=u.hostname or ""
        return u.scheme=="https" and not u.username and not u.password and u.port in (None,443) and (h in ("storage.yandexcloud.net","datalakeiepru-s3-storage-public.storage.yandexcloud.net","repository.nsedc.ru") or any(h==d or h.endswith("."+d) for d in ("rosstat.gov.ru","fedstat.ru","roskazna.gov.ru","cbr.ru","budget.gov.ru","minfin.gov.ru")))
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
    if type(v) in (int,float) and math.isfinite(v) and v==int(v) and 1980<=v<=2029:return int(v)
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
def due_date(checked,success,stamp,success_days=1,failure_days=1):
    """Calendar-day retry policy, independent of repeated deployments."""
    if not checked:return stamp[:10]
    try:
        last=date.fromisoformat(checked[:10])
        return (last+timedelta(days=success_days if success==checked else failure_days)).isoformat()
    except (TypeError,ValueError):return stamp[:10]

def due(db,code,stamp,success_days=1,failure_days=1):
    row=db.execute("select checked,success from hist_sources where code=?",(code,)).fetchone()
    return not row or due_date(*row,stamp,success_days,failure_days)<=stamp[:10]

def choose_sections(db,stamp,limit=3):
    """Untried first, then longest overdue; a failing section cannot monopolise the queue."""
    options=[]
    for section in REGIONAL_ZIPS:
        code="mirror_"+section
        if section=="industry" and not db.execute("select success from hist_sources where code='mirror_industry_activity_v2' and success is not null").fetchone():
            code="mirror_industry_activity_v2"
        row=db.execute("select checked,success from hist_sources where code=?",(code,)).fetchone()
        if not row:options.append((0,"",section));continue
        if due_date(*row,stamp,30,2)<=stamp[:10]:
            options.append((1,row[0] or "",section))
    return [s for _,__,s in sorted(options)[:limit]]

def budget_import_code(url):
    return "budget_import_"+hashlib.sha256(url.encode()).hexdigest()[:12]

def choose_budget_files(db,files,stamp,limit=3):
    """Deduplicate, then select untried and longest-overdue reports before applying limit."""
    options=[]
    for url,f in {f["url"]:f for f in files}.items():
        row=db.execute("select checked,success from hist_sources where code=?",(budget_import_code(url),)).fetchone()
        if not row or not row[0]:
            options.append((0,"",url,f))
        elif due_date(*row,stamp,30,2)<=stamp[:10]:
            options.append((1,row[0],url,f))
    return [f for _,__,___,f in sorted(options)[:limit]]

def import_status(db,code,title,url,stamp,status,success,files=None):
    """Persist actual attempt and most recent success independently, also across failed builds."""
    old=db.execute("select success,files from hist_sources where code=?",(code,)).fetchone()
    if success:
        saved=stamp
        kept=files or []
    else:
        saved=old[0] if old else None
        kept=json.loads(old[1]) if old else []
    db.execute("create table if not exists hist_attempts(code text primary key,url text not null,title text not null,attempted text not null)")
    db.execute("insert or replace into hist_attempts values(?,?,?,?)",(code,url,title,stamp))
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
MIRROR_PRIORITY["farming"]=MIRROR_PRIORITY["agriculture"]+[r"^продукция сельского хозяйства",r"^валовой сбор зерна",r"^поголовье крупного рогатого скота"]
MIRROR_PRIORITY["manufacturing"]=MIRROR_PRIORITY["industry"]
MIRROR_PRIORITY.update({
 "living":[r"^среднедушевые денежные доходы населения",r"^уровень бедности",r"^численность населения с денежными доходами ниже",r"^реальные располагаемые денежные доходы"],
 "capital":[r"^наличие основных фондов",r"^степень износа основных фондов",r"^коэффициент обновления основных фондов",r"^коэффициент выбытия основных фондов"],
 "ict":[r"^число абонентов фиксированного широкополосного доступа",r"^число абонентов мобильного широкополосного доступа",r"^удельный вес домашних хозяйств.*доступ.*интернет",r"^удельный вес организаций.*интернет"],
 "prices":[r"^индекс[ы]? потребительских цен",r"^стоимость фиксированного набора потребительских товаров и услуг",r"^стоимость условного.*минимального набора продуктов питания",r"^индекс цен производителей промышленных товаров"],
 "foreign_trade":[r"^экспорт товаров(?:$|:| \()",r"^импорт товаров(?:$|:| \()",r"^внешнеторговый оборот(?:$|:| \()",r"^сальдо торгового баланса"]
})
STRICT_MIRROR_SECTIONS={"enterprises","agriculture","construction","trade","transport","innovation","farming","manufacturing","living","capital","ict","prices","foreign_trade"}

def select_mirror(rows,section,limit=4):
    by=defaultdict(list)
    for r in rows:by[r["indicator"]].append(r)
    picked=[]
    for pat in MIRROR_PRIORITY.get(section,[]):
        candidates=[(k,v) for k,v in by.items() if k not in picked and re.search(pat,norm(v[0]["title"]))]
        if candidates:
            # Prefer the largest complete historical series, not the first arbitrary CSV row.
            picked.append(max(candidates,key=lambda item:(len(item[1]),item[1][0]["unit"]=="млн руб.",item[0]))[0])
    if not picked and section not in STRICT_MIRROR_SECTIONS:
        picked=[k for k,v in sorted(by.items(),key=lambda item:(-len(item[1]),item[0]))[:limit]]
    selected=[r for k in picked[:limit] for r in by[k]]
    if section in ('industry','manufacturing'):
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
    result=[];recognized=False;headers=[];scanned=0
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        all_csv=[x for x in z.infolist() if x.filename.lower().endswith(".csv") and not x.is_dir()]
        if not all_csv:raise ValueError("В архиве отсутствуют CSV-файлы")
        # Stream selected large sections rather than rejecting them at 60 MB.
        # The bounds apply to actual declared uncompressed CSV size and row count.
        if len(all_csv)>40 or sum(x.file_size for x in all_csv)>200_000_000:
            raise ValueError("CSV-архив превышает лимит 200 МБ или 40 файлов")
        candidates=all_csv
        for member in candidates:
            with z.open(member) as f:
                reader=csv.DictReader(io.TextIOWrapper(f,encoding="utf-8-sig"),delimiter=";")
                header=reader.fieldnames or []
                headers.append(member.filename+": "+", ".join(header)[:220])
                fields={norm(x):x for x in header}
                if len(fields)!=len(header):raise ValueError("Повтор заголовка CSV: "+member.filename)
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
                recognized=True
                for r in reader:
                    scanned+=1
                    if scanned>1_500_000:raise ValueError("Превышен лимит 1,5 млн строк CSV")
                    if None in r or any(v is None for v in r.values()):raise ValueError("Некорректное число полей CSV: "+member.filename+" / "+str(reader.line_num))
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
                    if selected and section in STRICT_MIRROR_SECTIONS-{'manufacturing'} and not any(re.search(pat,norm(title)) for pat in MIRROR_PRIORITY[section]):continue
                    # Keep definitions separate by exact title, unit and provider code.
                    code=hashlib.sha256((val("code")+"|"+title+"|"+unit+"|"+str(r.get("subsection",""))).encode()).hexdigest()[:16]
                    note=val("note")+" · Единица в оригинале: "+original_unit+" · Издание: "+str(r.get("source",""))+" · Версия: "+str(r.get("version_date",""))+" · Уровень территории: "+str(r.get("object_level",""))+" · ОКТМО: "+str(r.get("object_oktmo",""))+" · ОКАТО: "+str(r.get("object_okato",""))+" · Код показателя: "+val("code")
                    result.append({"indicator":"R_"+code,"title":title,"region":region,"year":y,"value":v,"unit":unit,"sheet":member.filename,"row":reader.line_num,"column":None,"note":note})
                    if len(result)>250000:raise ValueError("Слишком большой раздел; требуется выборочная загрузка")
    if not result:raise ValueError("Структура CSV распознана, но нет наблюдений выбранных показателей" if recognized else "Не распознана документированная структура CSV: "+"; ".join(headers)[:350])
    result=select_mirror(result,section) if selected else result
    if not result:raise ValueError("Нет наблюдений выбранных показателей")
    return result

def minfin_annual_candidates(files):
    return [f for f in files if f["format"]=="xlsx" and urlsplit(f["url"]).hostname=="minfin.gov.ru" and re.search(r"prilozhenie_3_dannye_109-111_.*_god\.xlsx$",unquote(urlsplit(f["url"]).path),re.I)]
def parse_minfin_annual(raw,diagnostics=None):
    """Independent annual aggregate from Minfin appendix 3.1, not Treasury form 0503117."""
    import openpyxl
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        if sum(x.file_size for x in z.infolist())>30_000_000:raise ValueError("Превышен размер XLSX")
    book=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
    try:
        if "год" not in book.sheetnames:raise ValueError("Нет годового листа")
        s=book["год"]
        if (s.max_row or 0)>500 or (s.max_column or 0)>100:raise ValueError("Неожиданный размер")
        rows=list(s.iter_rows(values_only=True))
        header=" ".join(norm(v) for row in rows[:2] for v in row)
        if not re.search(r"краткая информация об исполнении федерального бюджета",header) or not re.search(r"млрд\.?\s*руб",header):raise ValueError("Не совпадает понятие или единица")
        columns=[(j,year(v)) for j,v in enumerate(rows[2]) if year(v)]
        if len(columns)<5 or any(b!=a+1 for a,b in zip([y for _,y in columns],[y for _,y in columns][1:])):raise ValueError("Неоднозначные годы")
        columns=[(j,y) for j,y in columns if y<date.today().year]
        if not columns:raise ValueError("Нет завершённых календарных лет")
        patterns={"MINFIN_REV":r"^доходы,?\s*всего$","MINFIN_EXP":r"^расходы,?\s*всего$","MINFIN_BAL":r"^дефицит\s*\([-−–]\)\s*/\s*профицит\s*\(\+\)$"}
        indexes={}
        for i,row in enumerate(rows[3:],4):
            label=norm(row[1] if len(row)>1 else None).rstrip("* ").strip()
            for k,pat in patterns.items():
                if re.fullmatch(pat,label):
                    if k in indexes:raise ValueError("Повтор агрегата")
                    indexes[k]=(i,row)
        if set(indexes)!=set(patterns):raise ValueError("Не найдены три итоговых агрегата")
        labels={"MINFIN_REV":"Минфин: доходы федерального бюджета","MINFIN_EXP":"Минфин: расходы федерального бюджета","MINFIN_BAL":"Минфин: сальдо федерального бюджета"}
        result=[]
        for j,y in columns:
            vals={k:numeric(row[j]) if j<len(row) else None for k,(i,row) in indexes.items()}
            problem=None
            if any(v is None for v in vals.values()):problem="Неполный год "+str(y)
            else:
                delta=vals["MINFIN_REV"]-vals["MINFIN_EXP"]-vals["MINFIN_BAL"]
                if vals["MINFIN_REV"]<0 or vals["MINFIN_EXP"]<0 or abs(delta)>0.2:
                    problem=f"Нарушено бюджетное тождество за {y}: доходы {vals['MINFIN_REV']:.8g}, расходы {vals['MINFIN_EXP']:.8g}, сальдо {vals['MINFIN_BAL']:.8g}, остаток {delta:.8g} млрд руб."
            if problem:
                if diagnostics is None:raise ValueError(problem)
                diagnostics.append(problem);continue
            for k,(i,row) in indexes.items():
                result.append(dict(indicator=k,title=labels[k],region="Российская Федерация",year=y,value=vals[k],unit="млрд руб.",sheet=s.title,row=i,column=j+1,note="Минфин, годовое приложение 3.1. Доходы − расходы = сальдо; допуск 0,2 млрд руб. Не форма 0503117."))
        return result
    finally:book.close()
def budget_report_year(header):
    """Use dates from the report itself, never the filename alone."""
    dates=set()
    for d,m,y in re.findall(r"\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b",header):
        dates.add((int(y),int(m),int(d)))
    for y,m,d in re.findall(r"\b(20\d{2})-(\d{2})-(\d{2})\b",header):
        dates.add((int(y),int(m),int(d)))
    months=("января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря")
    for d,m,y in re.findall(r"\b(\d{1,2})\s+("+"|".join(months)+r")\s+(20\d{2})\b",header):
        dates.add((int(y),months.index(m)+1,int(d)))
    if len(dates)!=1:return None
    y,m,d=next(iter(dates))
    return y-1 if m==d==1 and 2000<=y<=date.today().year else None

def budget_rubles(header):
    if re.search(r"(?:тыс(?:\.|яч\w*)?|млн\.?|миллион\w*|млрд\.?|миллиард\w*|трлн\.?)\s*руб",header):return False
    return bool(re.search(r"\bруб(?:\.|\b|л[ьяеи]\b|лей\b)|оке[ий]\s*[:—-]?\s*383\b",header))

def check_xlsx_size(blob,limit=80_000_000):
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        if sum(x.file_size for x in z.infolist())>limit or len(z.infolist())>2000:
            raise ValueError("Превышен размер распакованной книги")

BUDGET_LABELS={"доходы бюджета - всего":"BUD_REV","доходы бюджета всего":"BUD_REV","доходы - всего":"BUD_REV","расходы бюджета - всего":"BUD_EXP","расходы бюджета всего":"BUD_EXP","расходы - всего":"BUD_EXP","результат исполнения бюджета":"BUD_BAL"}
BUDGET_TITLES={"BUD_REV":"Федеральный бюджет: исполненные доходы","BUD_EXP":"Федеральный бюджет: исполненные расходы","BUD_BAL":"Федеральный бюджет: сальдо исполнения"}
def budget_label(v):
    label=norm(v).replace("–","-").replace("—","-")
    label=re.sub(r"\s*в том числе\s*:?\s*$","",label).strip().rstrip(":")
    return BUDGET_LABELS.get(label)
def budget_header(rows,n=20):
    return " ".join(norm(x) for row in rows[:n] for x in row if x is not None)
def budget_totals(rows,col,keys,sheet,require_marker=False):
    vals={};conflicts=set()
    for i,row in enumerate(rows,1):
        if not row:continue
        key=budget_label(row[0])
        if key not in keys:continue
        if require_marker:
            # A classification code is a detail row, not an aggregate.
            codes=[norm(x) for x in row[2:col-1] if x is not None and norm(x)]
            if not any(x in ("x","х") for x in codes) or any(x not in ("x","х","000") for x in codes):continue
        v=numeric(row[col]) if col<len(row) else None
        if v is None:continue
        if key in vals and vals[key][0]!=v:conflicts.add(key)
        elif key not in vals:vals[key]=(v,sheet,i,col+1)
    if conflicts:raise ValueError("Противоречивые итоговые строки "+sheet)
    return vals
def budget_execution_column(rows,expected=None,header_rows=25):
    cols={j for row in rows[:header_rows] for j,v in enumerate(row) if norm(v) in ("исполнено","исполнено всего","исполнение")}
    if len(cols)!=1:return None
    col=next(iter(cols))
    return col if expected is None or expected==col else None

def parse_budget(raw,filename=""):
    """Completed federal budget years only, with sheet/cell provenance."""
    import openpyxl
    result=[]
    def workbook(blob,member):
        check_xlsx_size(blob)
        book=openpyxl.load_workbook(io.BytesIO(blob),read_only=True,data_only=True)
        try:
            def sheet_rows(sheet):
                if not sheet.max_row or not sheet.max_column or sheet.max_row>10000 or sheet.max_column>80:return []
                return list(sheet.iter_rows(values_only=True))
            def emit(vals,yr):
                if set(vals)!=set(BUDGET_TITLES):return
                rev,exp,bal=[vals[k][0] for k in ("BUD_REV","BUD_EXP","BUD_BAL")]
                if rev<0 or exp<0 or abs(rev-exp-bal)>max(1,abs(rev)*1e-9):return
                for k,title in BUDGET_TITLES.items():
                    value,sheet,row,column=vals[k]
                    result.append(dict(indicator=k,title=title,region="Российская Федерация",year=yr,value=value,unit="руб.",sheet=member+" / "+sheet,row=row,column=column,note="Форма 0503117; годовой итог на 1 января следующего года. Контроль: доходы минус расходы равны сальдо; итоги не суммируются."))
            # Observed 2025 annual layout: income sheet without administrator
            # uses column F; federal expenditure sheet uses column H.
            names={norm(n):n for n in book.sheetnames}
            if "доходы без ад" in names and "расходы фб" in names:
                inc=book[names["доходы без ад"]];exp=book[names["расходы фб"]]
                a,b=sheet_rows(inc),sheet_rows(exp)
                if not a or not b:return
                header=budget_header(a,16)+" "+budget_header(b,6)
                yr=budget_report_year(header)
                if yr is None or "0503117" not in header+" "+member or not budget_rubles(header) or "федеральн" not in header or "бюджет" not in header:return
                ac=budget_execution_column(a,5,16);bc=budget_execution_column(b,7,6)
                if ac is None or bc is None:return
                vals=budget_totals(a,ac,{"BUD_REV"},inc.title,True)
                vals.update(budget_totals(b,bc,{"BUD_EXP","BUD_BAL"},exp.title,True))
                emit(vals,yr)
                return
            # Compact historical formats: all three explicitly named totals
            # must reside in the same dated sheet with one execution column.
            for sheet in book:
                if sheet.sheet_state!="visible":continue
                rows=sheet_rows(sheet)
                if not rows:continue
                header=budget_header(rows)
                if "0503117" not in header+" "+member or not budget_rubles(header) or "федеральн" not in header or "бюджет" not in header:continue
                yr=budget_report_year(header)
                if yr is None:continue
                col=budget_execution_column(rows)
                if col is None:continue
                try:vals=budget_totals(rows,col,set(BUDGET_TITLES),sheet.title)
                except ValueError:continue
                emit(vals,yr)
        finally:book.close()
    if filename.lower().endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(raw),metadata_encoding="cp866") as z:
            members=[item for item in z.infolist() if item.filename.lower().endswith(".xlsx") and "0503117" in item.filename]
            if len(members)>30 or sum(item.file_size for item in members)>100_000_000 or any(item.file_size>25_000_000 for item in members):
                raise ValueError("Превышен лимит годовых книг в архиве")
            for item in members:workbook(z.read(item),item.filename)
    else:workbook(raw,filename)
    unique={}
    for row in result:
        key=row["indicator"],row["year"]
        if key in unique and unique[key]["value"]!=row["value"]:raise ValueError("Противоречивые итоги годовых книг")
        unique.setdefault(key,row)
    return list(unique.values())

def budget_candidate(f):
    if f.get("format") not in ("zip","xlsx"):return False
    label=norm(f.get("title","")+" "+unquote(f.get("url","")))
    return bool(re.search(r"исполнени|0503117",label) and
        (re.search(r"01[._-]01[._-]20\d\d|\b0?1\s+января\s+20\d\d\b",label) or
         (re.search(r"\bгодов\w*",label) and re.search(r"\b20\d\d\b",label))))

def publish(db,stamp,out,refresh):
    db.execute("create table if not exists hist_sources(code text primary key,checked text,success text,status text,files text)")
    db.execute("create table if not exists hist_attempts(code text primary key,url text not null,title text not null,attempted text not null)")
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
            if not due(db,'import_'+code,stamp,7,2):continue
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
        # Independent Ministry of Finance aggregate, never substituted into Treasury rows.
        prior_minfin=db.execute("select status from hist_sources where code='import_minfin_budget'").fetchone()
        retry_new_parser=bool(prior_minfin and prior_minfin[0].startswith("Ошибка: Нарушено бюджетное тождество за ") and "остаток" not in prior_minfin[0])
        if retry_new_parser or due(db,"import_minfin_budget",stamp,7,2):
            catalog=next((s for s in sources if s["code"]=="minfin_budget"),None)
            files=minfin_annual_candidates(catalog["files"] if catalog else [])
            url=catalog["url"] if catalog else "https://minfin.gov.ru/ru/statistics/fedbud/execute/"
            try:
                if len(files)!=1:raise ValueError("Не обнаружен единственный годовой файл Минфина")
                url=files[0]["url"];raw,_=get(url,12_000_000)
                excluded=[]
                rows=parse_minfin_annual(raw,excluded)
                if not rows:raise ValueError("Нет прошедших проверку годов: "+"; ".join(excluded)[:700])
                n=store(rows,url,"Минфин · Федеральный бюджет","Минфин · годовая статистика исполнения")
                if not n:raise ValueError("Нет наблюдений")
                status="Ключей: "+str(n)
                if excluded:status+="; частичный импорт; исключено годов: "+str(len(excluded))+"; "+"; ".join(excluded)[:800]
                sources.append(import_status(db,"import_minfin_budget","Годовые итоги федерального бюджета Минфина",url,stamp,status,True,files))
            except Exception as e:
                sources.append(import_status(db,"import_minfin_budget","Годовые итоги федерального бюджета Минфина",url,stamp,"Ошибка: "+str(e)[:900],False))
        # Year-end federal reports only. Keep the other Treasury files in the source registry.
        budget_files=[f for x in sources if x["code"]=="budget" for f in x["files"] if budget_candidate(f)]
        for f in choose_budget_files(db,budget_files,stamp):
            code=budget_import_code(f["url"])
            try:
                raw,_=get(f["url"],35_000_000);rows=parse_budget(raw,unquote(urlsplit(f["url"]).path.rsplit("/",1)[-1]))
                if not rows:raise ValueError("Годовая форма 0503117 не распознана")
                n=store(rows,f["url"],"Федеральный бюджет","Казначейство · прямой импорт")
                sources.append(import_status(db,code,"Годовое исполнение бюджета",f["url"],stamp,"Ключей: "+str(n),True,[f]))
            except Exception as e:sources.append(import_status(db,code,"Годовое исполнение бюджета",f["url"],stamp,"Ошибка: "+str(e)[:160],False))
        # EMISS publisher-coded historical archives: preserve every dimension and cite the primary portal.
        for code,(title,agency,unit) in emiss_archive.SPECS.items():
            if not due(db,'emiss_'+code,stamp,30,7):continue
            url=emiss_archive.resource(code)
            try:
                rows,url=emiss_archive.retrieve(code,get,numeric,year)
                n=store(rows,url,title,agency+" · ЕМИСС, архив НЦСЭД (CC BY)")
                if not n:raise ValueError("Нет однозначных наблюдений")
                sources.append(import_status(db,"emiss_"+code,title,emiss_archive.primary(code),stamp,"Ключей: "+str(n),True,[dict(url=url,title="Файл архива НЦСЭД",format="parquet" if url.endswith(".parquet") else "csv.gz"),dict(url=emiss_archive.card(code),title="Паспорт архива НЦСЭД",format="html")]))
            except Exception as e:
                failed=import_status(db,"emiss_"+code,title,emiss_archive.primary(code),stamp,"Ошибка: "+str(e)[:900],False)
                if not failed["files"]:failed["files"]=[dict(url=emiss_archive.card(code),title="Карточка архива НЦСЭД",format="html")]
                sources.append(failed)
        # Bounded fair queue: retry failures after two days; refresh fixed editions monthly.
        sections=choose_sections(db,stamp)
        for section in sections:
            code="mirror_"+section
            url=mirror_url(section)
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
                if section=="industry":
                    db.execute("insert into hist_sources values(?,?,null,?,?) on conflict(code) do update set checked=excluded.checked,status=excluded.status",("mirror_industry_activity_v2",stamp,status,"[]"))
                old=db.execute("select success from hist_sources where code=?",(code,)).fetchone()
                sources.append(dict(code=code,title="Архив регионов: "+section,url=url,checked=stamp,success=old[0] if old else None,status=status,files=[]))
    # Include historical check metadata even if this build used cached data.
    present={s["code"] for s in sources}
    for code,checked,success,status,raw_files in db.execute("select code,checked,success,status,files from hist_sources"):
        if code in present or not code.startswith(("import_","emiss_","budget_import_")):continue
        files=json.loads(raw_files);url=files[0]["url"] if files else None
        if code.startswith("emiss_") and code[6:] in emiss_archive.SPECS:
            title=emiss_archive.SPECS[code[6:]][0];url=emiss_archive.primary(code[6:])
        elif code.startswith("budget_import_"):
            title="Годовое исполнение бюджета"
            if not url:
                candidate=next((f for source in sources if source["code"]=="budget" for f in source["files"] if budget_import_code(f["url"])==code),None)
                if candidate:url=candidate["url"]
        else:
            title=files[0]["title"] if files else next((t for k,t,*_ in SPECS if code=="import_"+k),code)
            if not url and code=="import_minfin_budget":url="https://minfin.gov.ru/ru/statistics/fedbud/execute/";title="Годовые итоги федерального бюджета Минфина"
            if not url and code.startswith("import_"):url=DIRECT_FILES.get(code[7:])
        attempt=db.execute("select url,title,attempted from hist_attempts where code=?",(code,)).fetchone()
        if attempt and attempt[2]==checked:
            url,title=attempt[:2]
        if url:sources.append(dict(code=code,title=title,url=url,checked=checked,success=success,status=status,files=files))
    # Keep every configured regional source visible even between scheduled attempts.
    present={s["code"] for s in sources}
    for section,number in REGIONAL_ZIPS.items():
        code="mirror_"+section
        if code in present:continue
        row=db.execute("select checked,success,status from hist_sources where code=?",(code,)).fetchone()
        url=mirror_url(section)
        sources.append(dict(code=code,title="Архив регионов: "+section,url=url,checked=row[0] if row else None,success=row[1] if row else None,status=row[2] if row else "Ожидается загрузка",files=[]))
    for s in sources:
        code=s["code"]
        if code.startswith("mirror_"):sd,fd=30,2
        elif code.startswith("import_"):sd,fd=7,2
        elif code.startswith("budget_import_"):sd,fd=30,2
        elif code.startswith("emiss_") and code[6:] in emiss_archive.SPECS:sd,fd=30,7
        else:continue
        s["next_due"]=due_date(s.get("checked"),s.get("success"),stamp,sd,fd)
        s["retry_policy"]=f"После успеха: {sd} суток; после ошибки: {fd} суток; очередь ограничена."
    # Publish bounded sets grouped by indicator and source, never merge across providers.
    series={}
    # Legacy series IDs remain stable unless a source actually publishes more than
    # one unit for the same indicator. Such editions must never share one label.
    mixed_units=set(db.execute("select indicator,source from hist_values group by indicator,source having count(distinct unit)>1"))
    for row in db.execute("""select payload from (select indicator,region,year,unit,source,payload,row_number() over(partition by indicator,region,year,unit,source order by seen desc) rn from hist_values) where rn=1 order by indicator,region,year,unit,source"""):
        r=json.loads(row[0])
        key=r["indicator"]+"_"+hashlib.sha256(r["source"].encode()).hexdigest()[:10]
        if (r["indicator"],r["source"]) in mixed_units:key+="_u"+hashlib.sha256(r["unit"].encode()).hexdigest()[:8]
        group=series.setdefault(key,dict(title=r["title"],unit=r["unit"],kind=r["kind"],source=r["source"],values=[]))
        if group["unit"]!=r["unit"] or group["source"]!=r["source"]:raise ValueError("Несовместимые исторические ряды")
        group["values"].append({k:r[k] for k in ("region","year","value","sheet","row","column","note","seen")})
    # Split into independent data files to avoid giant initial download.
    folder=out/"regional-data";folder.mkdir(exist_ok=True)
    catalog=[]
    for key,s in series.items():
        file=key+".json";(folder/file).write_text(json.dumps(s,ensure_ascii=False,allow_nan=False),encoding="utf-8")
        catalog.append(dict(code=key,title=s["title"],unit=s["unit"],kind=s["kind"],source=s["source"],file="regional-data/"+file,count=len(s["values"]),regions=len(set(r["region"] for r in s["values"])),first=min(r["year"] for r in s["values"]),last=max(r["year"] for r in s["values"])))
    (out/"historical.json").write_text(json.dumps(dict(built=stamp,sources=sources,series=catalog,mirror=MIRROR_PAGE,primary=PRIMARY),ensure_ascii=False,allow_nan=False),encoding="utf-8")
    return ["История · "+s["title"]+" · "+s["status"] for s in sources if s["status"].startswith("Ошибка")]
