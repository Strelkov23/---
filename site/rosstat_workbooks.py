"""Official tables, conservative parsing, explicit scope and original cell provenance."""
import csv,io,json,hashlib,re,math,zipfile
from datetime import date,timedelta
import calendar
from html import escape
from urllib.parse import urlsplit,unquote
import historical as h
CATALOGS={
 "capital":"https://rosstat.gov.ru/folder/14304",
 "capacity":"https://www.rosstat.gov.ru/enterprise_industrial",
 "cost":"https://rosstat.gov.ru/statistics/instituteconomics",
 "debt":"https://rosstat.gov.ru/statistics/finance"}
# Titles must occur in workbook headers; catalogue hints alone do not prove meaning.
RULES={
 "stock":(r"наличие основных фондов.*полной учетной стоимости",r"миллион[а-я]* рубл|млн\.?\s*руб","млн руб.","capital"),
 "wear":(r"степень износа основных фондов",r"процент|%","%","capital"),
 "renewal":(r"коэффициент обновления основных фондов",r"процент|%","%","capital"),
 "disposal":(r"коэффициент выбытия основных фондов",r"процент|%","%","capital"),
 "capacity":(r"использовани[ея] среднегодовой производственной мощности",r"процент|%","%","capacity"),
 "cost":(r"структура затрат на производство и продажу",r"процент|%","%","cost"),
 "debt":(r"(?:кредиторская|дебиторская|суммарная) задолженность",r"миллиард[а-я]* рубл|млрд\.?\s*руб","млрд руб.","debt")}
HINTS={
 "capital":r"основн.*фонд|износ|обновлен|выбыт",
 "capacity":r"мощност|mosh|mo[sš]chn|urov_motsh",
 "cost":r"структур.*затрат|zatraty_god",
 "debt":r"финансов.*состояни|задолженност|fin_sost"}
def allowed(url):
    u=urlsplit(url)
    return h.allowed(url) and (u.hostname=="rosstat.gov.ru" or u.hostname.endswith(".rosstat.gov.ru")) and u.path.lower().endswith((".xlsx",".xls"))
def candidates(group,files):
    # Exclude catalogue instructions, nomenclatures and unrelated tables before
    # consuming the limited download queue. The workbook parser remains authoritative.
    result=[];seen=set()
    for f in files:
        url=f["url"];title=h.norm(f["title"]);name=h.norm(unquote(urlsplit(url).path.rsplit("/",1)[-1]))
        if not allowed(url) or url in seen:continue
        if not re.search(HINTS[group],title+" "+name):continue
        if re.search(r"по субъектам|в разрезе субъектов|по федеральным округам|региональн",title):continue
        if re.search(r"номенклатур|для разработки статистической информации|указания по заполнению|форм[аы] федерального статистического наблюдения|методологические пояснения",title):continue
        if group=="capacity" and re.search(r"^nom[_-]?bm|^nom[_-]",name):continue
        if group=="capital" and re.search(r"по формам собственности|по видам основных фондов|арендная плата|фактическая стоимость сделок|ликвидация основных фондов",title):continue
        if group=="debt" and re.search(r"поступление налогов|задолженность по налогам и сборам|налоговым санкциям",title):continue
        seen.add(url);result.append(f)
    return result
def catalogue_is_newer(source,old):
    """A cached or failed historical scan must not overwrite a newer accepted list."""
    if not source or not source.get("files") or not source.get("success"):return False
    if not old:return True
    return not old[1] or source["success"]>old[1]
def catalogue_due(old,stamp,version_current):
    if not old or not old[0] or not version_current:return True
    return (date.fromisoformat(stamp[:10])-date.fromisoformat(old[0][:10])).days>=7
COST_FIELDS={
 "cost_materials":r"^материальные затраты$",
 "cost_labor":r"^затраты на оплату труда$|^оплата труда$",
 "cost_insurance":r"^страховые взносы$|^отчисления на социальные нужды$",
 "cost_depreciation":r"^амортизация$",
 "cost_other":r"^прочие затраты$"}
DEBT_FIELDS={
 "debt_total":r"^суммарная задолженность по обязательствам$|^суммарные обязательства$",
 "debt_payable":r"^кредиторская задолженность$",
 "debt_loans":r"^задолженность по кредитам и займам$|^кредиты и займы$",
 "debt_overdue_total":r"^просроченная задолженность по обязательствам$|^просроченные обязательства$",
 "debt_overdue_payable":r"^просроченная кредиторская задолженность$",
 "debt_overdue_loans":r"^просроченная задолженность по кредитам и займам$|^просроченные кредиты и займы$",
 "debt_receivable":r"^дебиторская задолженность$",
 "debt_overdue_receivable":r"^просроченная дебиторская задолженность$"}
for k,pat in COST_FIELDS.items():RULES[k]=(pat,r"процент|%","%","cost")
for k,pat in DEBT_FIELDS.items():RULES[k]=(pat,r"миллиард[а-я]* рубл|млрд\.?\s*руб","млрд руб.","debt")
def scope(header):
    return bool(re.search(r"российск[а-я]+ федераци|в целом по россии",header) and not re.search(r"по субъектам|в разрезе субъектов|по федеральным округам",header))
def complete_cost(values):
    return set(values)==set(COST_FIELDS) and all(v is not None and 0<=v<=100 for v in values.values()) and abs(sum(values.values())-100)<=0.30000001
def complete_debt(values):
    if set(values)!=set(DEBT_FIELDS) or any(v is None or v<0 for v in values.values()):return False
    v=values
    return (abs(v["debt_total"]-v["debt_payable"]-v["debt_loans"])<=0.15000001 and
            abs(v["debt_overdue_total"]-v["debt_overdue_payable"]-v["debt_overdue_loans"])<=0.15000001 and
            all(v["debt_overdue_"+k]<=v["debt_"+k] for k in ("total","payable","loans","receivable")))

# Observed official annual monetary layout: independent metrics, not percentages.
AMOUNT_FIELDS=("cost_amount_total","cost_amount_materials","cost_amount_labor","cost_amount_insurance","cost_amount_depreciation","cost_amount_other")
AMOUNT_LABELS=(r"материальные затраты",r"расходы на оплату труда",r"страховые взносы в (?:пенсионный фонд, фсс,фомс,тфомс|социальный фонд россии \(сфр\), ффомс)",r"амортизация основных средств",r"прочие затраты")
for k in AMOUNT_FIELDS:RULES[k]=(k,r"млн\.?\s*руб","млн руб.","cost")
def complete_amount(values):
    return (set(values)==set(AMOUNT_FIELDS) and all(type(v) in (int,float) and math.isfinite(v) and v>=0 for v in values.values()) and
            abs(values[AMOUNT_FIELDS[0]]-sum(values[k] for k in AMOUNT_FIELDS[1:]))<=3.00000001)
def cost_amount_sheet(rows,sheet,url,now_year):
    # Only the observed modern section layout, with the original exclusion notes.
    if len(rows)<34 or len(rows[1])<1 or len(rows[2])<7 or len(rows[3])<3 or len(rows[4])<7:return []
    title=h.norm(rows[1][0])
    if not scope(title) or not re.search(r"затраты на производство и продажу продукции.*организаций \(юридических лиц\).*в разрезе видов экономической деятельности",title):return []
    years=re.findall(r"\b(20[0-2]\d)\s+год",title)
    if len(years)!=1 or not 2017<=int(years[0])<=now_year:return []
    y=int(years[0])
    if not re.fullmatch(r"млн\.?\s*рублей",h.norm(rows[2][6])):return []
    if not re.fullmatch(r"затраты на производство и продажу продукции \(товаров, работ, услуг\)",h.norm(rows[3][1])):return []
    if any(not re.fullmatch(p,h.norm(v)) for p,v in zip(AMOUNT_LABELS,rows[4][2:7])):return []
    notes=[str(r[0]).strip() for r in rows[32:] if r and isinstance(r[0],str) and r[0].strip()]
    coverage=" ".join(h.norm(v) for v in notes)
    if not all(s in coverage for s in ("без субъектов малого предпринимательства","бюджетных организаций","банков","страховых и прочих финансово-кредитных организаций")):return []
    if y>=2022 and not all(s in coverage for s in ("без учета статистической информации","донецкой","луганской","запорожской","херсонской")):return []
    if not h.norm(rows[12][0]).startswith("всего по организациям (юридическим лицам)"):return []
    if not h.norm(rows[13][0]).startswith("из них с основным видом деятельности"):return []
    definition=str(rows[1][0])+" | "+str(rows[2][6])+" | "+str(rows[4][4])+" | "+" ".join(notes)+" | Только полные строки; суммы в текущих денежных единицах, не проценты."
    result=[];seen=set()
    for index in [12,*range(14,32)]:
        line=rows[index]
        if len(line)<7:continue
        label=str(line[0] or "").strip()
        if not label or not re.search(r"[а-яё]",label,re.I):continue
        values=dict(zip(AMOUNT_FIELDS,(h.numeric(v) for v in line[1:7])))
        if any(v is None for v in values.values()):continue
        if not complete_amount(values):raise ValueError("Не сходятся денежные затраты: "+label)
        key=h.norm(label)
        if key in seen:raise ValueError("Повтор вида деятельности")
        seen.add(key)
        for j,k in enumerate(AMOUNT_FIELDS,2):
            result.append(dict(metric=k,title=label,year=y,value=values[k],unit="млн руб.",source=url,sheet=sheet,row=index+1,column=j,definition=definition))
    if len(seen)<10:return []
    return result

def cost_sheet(rows,sheet,url,now_year):
    found=[]
    for hi,row in enumerate(rows[:35]):
        header=" ".join(h.norm(v) for line in rows[:hi] for v in line if v is not None)
        if not scope(header) or not re.search(r"структура затрат на производство и (?:продажу|реализацию)",header) or not re.search(r"процент|%",header) or not re.search(r"без субъектов малого предпринимательства|без малых предприятий",header):continue
        if not re.search(r"видам экономической деятельности",header):continue
        years=set(int(y) for y in re.findall(r"\b20[0-2]\d\b",header))
        if len(years)!=1 or max(years)>now_year:continue
        y=next(iter(years));cols={}
        for k,pat in COST_FIELDS.items():
            matches=[j for j,v in enumerate(row) if re.fullmatch(pat,h.norm(v))]
            if len(matches)!=1:break
            cols[k]=matches[0]
        if len(cols)!=5:continue
        names=[j for j,v in enumerate(row) if re.search(r"вид.*экономическ.*деятельност",h.norm(v))]
        if len(names)!=1 or names[0] in cols.values():continue
        n=names[0];result=[];seen=set()
        for i,line in enumerate(rows[hi+1:],hi+2):
            if len(line)<=max(n,*cols.values()):continue
            title=str(line[n] or "").strip()
            if not re.search(r"[а-яё]",title,re.I) or h.norm(title).startswith(("примечан","источник","сноск")):continue
            values={k:h.numeric(line[j]) for k,j in cols.items()}
            if all(v is None for v in values.values()):continue
            if not complete_cost(values):raise ValueError("Не сходится структура затрат: "+title)
            if h.norm(title) in seen:raise ValueError("Повтор вида деятельности")
            seen.add(h.norm(title))
            for k,j in cols.items():result.append(dict(metric=k,title=title,year=y,value=values[k],unit="%",source=url,sheet=sheet,row=i,column=j+1,definition=header))
        if len(seen)>=10:found.append(result)
    if len(found)>1:raise ValueError("Несколько таблиц структуры затрат")
    return found[0] if found else []
def month_end(v,now_year):
    if isinstance(v,date):d=v
    else:
        m=re.fullmatch(r"(\d{1,2})[./](\d{1,2})[./](20[0-2]\d)",str(v).strip())
        if not m:return None
        try:d=date(int(m[3]),int(m[2]),int(m[1]))
        except ValueError:return None
    if d.year>now_year or d.day!=calendar.monthrange(d.year,d.month)[1]:return None
    return d.strftime("%Y-%m")
def debt_sheet(rows,sheet,url,now_year):
    found=[]
    for hi,row in enumerate(rows[:35]):
        header=" ".join(h.norm(v) for line in rows[:hi] for v in line if v is not None)
        if not scope(header) or not re.search(r"задолженность организаций",header) or not re.search(r"на конец месяца|на конец отчетного периода",header) or not re.search(r"миллиард[а-я]* рубл|млрд\.?\s*руб",header):continue
        if not re.search(r"без субъектов малого предпринимательства|без малых предприятий",header):continue
        periods=[(j,month_end(v,now_year)) for j,v in enumerate(row)]
        periods=[(j,p) for j,p in periods if p]
        if not periods or len({p for j,p in periods})!=len(periods):continue
        first=periods[0][0];mapping={}
        for i,line in enumerate(rows[hi+1:],hi+2):
            names=[str(v).strip() for v in line[:first] if isinstance(v,str) and re.search(r"[а-яё]",v,re.I)]
            if len(names)!=1:continue
            keys=[k for k,pat in DEBT_FIELDS.items() if re.fullmatch(pat,h.norm(names[0]))]
            if len(keys)!=1:continue
            k=keys[0]
            if k in mapping:raise ValueError("Повтор вида задолженности")
            mapping[k]=(i,line)
        if set(mapping)!=set(DEBT_FIELDS):continue
        result=[]
        for j,period in periods:
            values={k:h.numeric(line[j]) if j<len(line) else None for k,(i,line) in mapping.items()}
            if all(v is None for v in values.values()):continue
            if not complete_debt(values):raise ValueError("Не сходится баланс задолженности: "+period)
            for k,(i,line) in mapping.items():result.append(dict(metric=k,title="Россия, всего",year=int(period[:4]),period=period,value=values[k],unit="млрд руб.",source=url,sheet=sheet,row=i,column=j+1,definition=header))
        if result:found.append(result)
    if len(found)>1:raise ValueError("Несколько таблиц задолженности")
    return found[0] if found else []
def parse_sheet(rows,group,sheet,url,now_year):
    if group=='cost':return cost_amount_sheet(rows,sheet,url,now_year) or cost_sheet(rows,sheet,url,now_year)
    if group=='debt':return debt_sheet(rows,sheet,url,now_year)
    # Annual horizontal layouts only. Reject mixed/ambiguous metric or geographical dimensions.
    if not rows:return []
    found=[]
    for hi,row in enumerate(rows[:35]):
        yrcols=[(j,h.year(v)) for j,v in enumerate(row) if h.year(v)]
        if len(yrcols)<2 or len({y for j,y in yrcols})!=len(yrcols) or any(y>now_year for j,y in yrcols):continue
        if any(b!=a+1 for a,b in zip([y for j,y in yrcols],[y for j,y in yrcols][1:])):continue
        first=yrcols[0][0]
        if first<1:continue
        header=" ".join(h.norm(v) for line in rows[max(0,hi-8):hi+1] for v in line if v is not None)
        # National scope explicitly stated; reject regional tables.
        if not re.search(r"российск[а-я]+ федераци|в целом по россии",header) or re.search(r"по субъектам|в разрезе субъектов|по федеральным округам",header):continue
        matches=[(k,v) for k,v in RULES.items() if v[3]==group and re.search(v[0],header) and re.search(v[1],header)]
        if len(matches)!=1:continue
        metric,(_,_,unit,_)=matches[0]
        if group=="capital" and "видам экономической деятельности" not in header:continue
        if group=="capacity" and not re.search(r"без субъектов малого предпринимательства|без малых предприятий",header):continue
        result=[];seen=set()
        for i,line in enumerate(rows[hi+1:],hi+2):
            names=[str(v).strip() for v in line[:first] if isinstance(v,str) and re.search(r"[А-Яа-яЁё]",v)]
            if len(names)!=1:continue
            title=names[0];key=h.norm(title)
            if key.startswith(("примечан","источник","сноск","в том числе")):continue
            obs=[]
            for j,y in yrcols:
                v=h.numeric(line[j]) if j<len(line) else None
                if v is None or v<0 or (metric in ("wear","renewal","disposal","capacity") and v>100):continue
                obs.append(dict(metric=metric,title=title,year=y,value=v,unit=unit,source=url,sheet=sheet,row=i,column=j+1,definition=header))
            if not obs:continue
            if key in seen:raise ValueError("Повтор названия строки")
            seen.add(key);result.extend(obs)
        if len(seen)>=10:found.append(result)
    if len(found)>1:raise ValueError("Несколько возможных заголовков")
    return found[0] if found else []
def parse(raw,group,url,now_year):
    if raw[:4]==b"PK\x03\x04":
        import openpyxl
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            if sum(x.file_size for x in z.infolist())>80_000_000:raise ValueError("Слишком большой архив")
        book=openpyxl.load_workbook(io.BytesIO(raw),read_only=True,data_only=True)
        try:
            sheets=[]
            for s in book:
                if (s.max_row or 0)>4000 or (s.max_column or 0)>150:raise ValueError("Неожиданный размер листа")
                sheets.append((s.title,list(s.iter_rows(values_only=True))))
        finally:book.close()
    elif raw[:8]==bytes.fromhex("d0cf11e0a1b11ae1"):
        import xlrd
        book=xlrd.open_workbook(file_contents=raw,on_demand=True)
        try:
            sheets=[]
            for s in book.sheets():
                if s.nrows>4000 or s.ncols>150:raise ValueError("Неожиданный размер листа")
                sheets.append((s.name,[s.row_values(i) for i in range(s.nrows)]))
        finally:book.release_resources()
    else:raise ValueError("Не XLS/XLSX")
    result=[r for name,rows in sheets for r in parse_sheet(rows,group,name,url,now_year)]
    if not result:raise ValueError("Нет однозначной таблицы нужного показателя, периода и охвата")
    keys=[(r["metric"],h.norm(r["title"]),r.get("period",str(r["year"]))) for r in result]
    if len(keys)!=len(set(keys)):raise ValueError("Неоднозначные повторные наблюдения между листами")
    return result
def sync(db,stamp,refresh,out):
    db.execute("create table if not exists rosstat_workbooks(url text primary key,grp text,checked text,success text,status text,sha text,rows text)")
    db.execute("create table if not exists rosstat_workbook_catalog(grp text primary key,checked text,success text,status text,files text)")
    db.execute("create table if not exists rosstat_catalog_versions(grp text primary key,version integer not null)")
    historical=json.loads((out/"historical.json").read_text(encoding="utf-8"))
    for group,url in CATALOGS.items():
        source=next((s for s in historical["sources"] if s["url"]==url),None)
        old=db.execute("select checked,success,status,files from rosstat_workbook_catalog where grp=?",(group,)).fetchone()
        if catalogue_is_newer(source,old) and candidates(group,source["files"]):
            files=candidates(group,source["files"])
            db.execute("insert or replace into rosstat_workbook_catalog values(?,?,?,?,?)",(group,source.get("checked"),source.get("success"),source["status"],json.dumps(files,ensure_ascii=False)))
        elif refresh and catalogue_due(old,stamp,db.execute("select 1 from rosstat_catalog_versions where grp=? and version=3",(group,)).fetchone()):
            db.execute("insert or replace into rosstat_catalog_versions values(?,?)",(group,3))
            try:
                raw,enc=h.get(url,5_000_000);files=candidates(group,h.discover(raw.decode(enc,errors="replace"),url))
                if not files:raise ValueError("Не обнаружено подходящих XLS/XLSX")
                db.execute("insert or replace into rosstat_workbook_catalog values(?,?,?,?,?)",(group,stamp,stamp,"Найдено файлов: "+str(len(files)),json.dumps(files,ensure_ascii=False)))
            except Exception as e:
                db.execute("insert into rosstat_workbook_catalog values(?,?,null,?,?) on conflict(grp) do update set checked=excluded.checked,status=excluded.status",(group,stamp,"Ошибка: "+str(e)[:180],"[]"))
    catalogs=[dict(group=g,checked=c,success=s,status=t,files=json.loads(f)) for g,c,s,t,f in db.execute("select grp,checked,success,status,files from rosstat_workbook_catalog")]
    if refresh:
        options=[]
        for cat in catalogs:
            for file in candidates(cat["group"],cat["files"]):
                u=file["url"];old=db.execute("select checked,success,sha,rows from rosstat_workbooks where url=?",(u,)).fetchone()
                if not old or (date.fromisoformat(stamp[:10])-date.fromisoformat(old[0][:10])).days>=(30 if old[0]==old[1] else 7):
                    options.append((old is not None,old[0] if old else "",u,cat["group"],old))
        # Rotate groups first to prevent a large catalogue starving the others.
        groups=list(CATALOGS);offset=date.fromisoformat(stamp[:10]).toordinal()%len(groups);order=groups[offset:]+groups[:offset]
        queue=[]
        for group in order:
            pool=sorted((x for x in options if x[3]==group),key=lambda r:r[:3])
            if pool:queue.append(pool[0])
        queue.extend(x for x in sorted(options,key=lambda r:r[:3]) if x not in queue)
        for _,__,url,group,old in queue[:3]:
            try:
                raw,_=h.get(url,12_000_000);rows=parse(raw,group,url,int(stamp[:4]))
                db.execute("insert or replace into rosstat_workbooks values(?,?,?,?,?,?,?)",(url,group,stamp,stamp,"Импортировано",hashlib.sha256(raw).hexdigest(),json.dumps(rows,ensure_ascii=False,allow_nan=False)))
            except Exception as e:
                db.execute("insert or replace into rosstat_workbooks values(?,?,?,?,?,?,?)",(url,group,stamp,old[1] if old else None,"Ошибка: "+str(e)[:180],old[2] if old else None,old[3] if old else "[]"))
    return dict(schema=1,built=stamp,catalogs=catalogs,files=[dict(url=u,group=g,checked=c,success=s,status=t,sha256=sha,rows=json.loads(r)) for u,g,c,s,t,sha,r in db.execute("select url,grp,checked,success,status,sha,rows from rosstat_workbooks order by grp,url")])
def quality(d):
    if d.get("schema")!=1:raise ValueError("schema")
    urls=set();count=0
    for f in d["files"]:
        u=f["url"]
        if u in urls or not allowed(u):raise ValueError("Invalid URL")
        urls.add(u);keys=set()
        if f["rows"] and (not f["success"] or not re.fullmatch(r"[a-f0-9]{64}",f["sha256"] or "")):raise ValueError("No provenance")
        for r in f["rows"]:
            k=(r["metric"],h.norm(r["title"]),r.get("period",str(r["year"])))
            if k in keys or r["source"]!=u or r["metric"] not in RULES or RULES[r["metric"]][3]!=f["group"] or r["unit"]!=RULES[r["metric"]][2] or type(r["value"]) not in (int,float) or not math.isfinite(r["value"]) or r["value"]<0 or (r["unit"]=="%" and r["value"]>100):raise ValueError("Bad observation")
            keys.add(k);count+=1
        groups={}
        for r in f["rows"]:
            if f["group"] in ("cost","debt"):groups.setdefault((r["title"],r.get("period",str(r["year"])),r["metric"] in AMOUNT_FIELDS),{})[r["metric"]]=r["value"]
        for v in groups.values():
            if not (complete_amount(v) if set(v)&set(AMOUNT_FIELDS) else complete_cost(v) if f["group"]=="cost" else complete_debt(v)):raise ValueError("Balance not reproducible")
    return dict(rosstat_workbook_files=sum(bool(f["rows"]) for f in d["files"]),rosstat_workbook_observations=count)
def publish(page,out,d):
    quality(d)
    (out/"rosstat-workbooks.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"rosstat-workbooks.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=["metric","title","year","period","value","unit","source","sheet","row","column","definition"]);w.writeheader()
        for batch in d["files"]:w.writerows(batch["rows"])
    body="<h1>Оригинальные отраслевые таблицы Росстата</h1><p>Автоматический импорт однозначных годовых таблиц фондов, мощностей, структуры и денежных сумм затрат и месячных запасов задолженности. Денежные затраты (млн руб.) за 2017 год и далее отделены от процентных долей; исключения и исходные примечания указаны в CSV/JSON. До 2017 года классификация не объединяется. Неоднозначные форматы отклоняются; ручные наборы не замещаются.</p><p><a href='rosstat-workbooks.csv'>CSV</a> · <a href='rosstat-workbooks.json'>JSON</a> · <a href='capital.html'>Основные фонды</a> · <a href='cost-structure.html'>Затраты</a> · <a href='financial-state.html'>Финансовое состояние</a></p>"
    for group,url in CATALOGS.items():
        c=next((x for x in d["catalogs"] if x["group"]==group),None)
        body+="<section><h2>"+escape({"capital":"Основные фонды","capacity":"Мощности","cost":"Затраты","debt":"Задолженность"}[group])+"</h2><p><a href='"+escape(url,quote=True)+"'>Каталог Росстата</a> · "+escape(c["status"] if c else "Ожидается проверка")+"</p>"
        if c:
            body+="<details><summary>Обнаруженные файлы: "+str(len(c["files"]))+"</summary><ul>"
            for f in c["files"]:body+="<li><a href='"+escape(f["url"],quote=True)+"'>"+escape(f["title"])+"</a></li>"
            body+="</ul></details>"
        for f in d["files"]:
            if f["group"]==group:body+="<p>"+escape(f["url"].rsplit("/",1)[-1])+" · "+escape(f["status"])+" · наблюдений: "+str(len(f["rows"]))+" · последний успех: "+escape(str(f["success"] or "—"))+"</p>"
        body+="</section>"
    page("rosstat-workbooks.html",body)
