"""Regional manufacturing shipments, exact table Y477090010, licensed fixed edition.
Not GRP, profit, physical output or factory coordinates. Preserve source subheading and row.
"""
import csv,io,json,hashlib,math,re,zipfile
from datetime import date,timedelta
from collections import defaultdict
from decimal import Decimal,InvalidOperation
from html import escape
from pathlib import Path
SOURCE="https://storage.yandexcloud.net/tochno-st-catalog/Rosstat/data_regions_collection_102_v20260313/data_industry_102_v20260313.zip"
CATALOG="https://tochno.st/datasets/regions_collection"
PRIMARY="https://rosstat.gov.ru/folder/210/document/13204"
LICENSE="CC BY 4.0"
RELEASE="v20260313"
EXPECTED_SHA256="70aa400bc0318c413ebd17f50780e9e1d10e47a44c8b60db9d323bd766b9b6bf"
EDITIONS={2022:"Промышленное производство в России 2023",2024:"Промышленное производство в России 2025"}
CODE="Y477090010"
TITLE="Объем отгруженных товаров собственного производства, выполненных работ и услуг собственными силами по видам экономической деятельности раздела обрабатывающие производства"
UNIT="Миллионов рублей"
METHOD="Отгрузка товаров собственного производства, работы и услуги собственными силами, раздел C ОКВЭД2. Текущие цены. Группы приведены именно в агрегировании источника; это не ВРП, не физический выпуск, не фактическая мощность, не перечень предприятий."
# Explicitly observed source aliases; no fuzzy matching or splitting grouped activities.
GROUPS=[
 ("total","Обрабатывающие производства — всего","C",["Обрабаты-вающие производства — всего"]),
 ("light","Лёгкая промышленность","13–15",["В том числе: производство текстиль-ных изделий, одежды, производство кожи и изделий из кожи","В том числе: производство текстильных изделий, одежды, производство кожи и изделий из кожи"]),
 ("chemical","Химическая промышленность и фармацевтика","20–21",["В том числе: производство химических веществ и химических продуктов, производство лекарс-венных средств и материалов, применяе-мых в медицинских целях","В том числе: производство химических веществ и химических продуктов, производство лекарсвенных средств и материалов, применяемых в медицинских целях"]),
 ("food","Пищевые продукты, напитки, табак","10–12",["В том числе: производство пищевых продуктов, напитков и табачных изделий"]),
 ("metal","Металлургия и готовые металлические изделия","24–25",["В том числе: производство металлур-гическое; производство готовых металлических изделий, кроме машин и оборудования"]),
 ("wood","Деревообработка и бумага","16–17",["В том числе: обработка древесины и производство изделий из дерева и пробки, кроме мебели, производство изделий из соломки и материалов для плетения, производство бумаги и бумажных изделий"]),
 ("print","Полиграфия","18",["В том числе: деятельность полигра-фическая и копирование носителей информации"]),
 ("oil_rubber","Кокс, нефтепродукты, резина и пластмассы","19, 22",["В том числе: производство кокса и нефтепро-дуктов, производство резиновых и пластмассо-вых изделий"]),
 ("minerals","Неметаллические минеральные продукты","23",["В том числе: производство прочей неметал-лической минеральной продукции"]),
 ("electronics","Электроника и электрическое оборудование","26–27",["В том числе: производство компьютеров, электронных и оптических изделий; производство электриче-ского оборудования"]),
 ("machinery","Машины и оборудование","28",["В том числе: производство машин и оборудования, не включенных в другие группировки"]),
 ("vehicles","Транспортное машиностроение","29–30",["В том числе: производство автотран-спортных средств, прицепов и полуприце-пов; производство прочих транспортных средств и оборудования"]),
 ("furniture","Мебель и прочие готовые изделия","31–32",["В том числе: производство мебели; производство прочих готовых изделий"]),
 ("repair","Ремонт и монтаж машин и оборудования","33",["В том числе: ремонт и монтаж машин и оборудования"]),
]
LOOKUP={alias:ident for ident,_,_,aliases in GROUPS for alias in aliases}
LABELS={ident:dict(id=ident,title=title,okved=okved,aliases=aliases) for ident,title,okved,aliases in GROUPS}
FIELDS={"indicator_code","indicator_name","subsection","object_name","object_level","object_oktmo","object_okato","year","indicator_value","indicator_unit","comment","source","version_date"}
def old_ids():
    # Preserve historical series IDs. Labels are proved by hash of the original four fields.
    return {"R_"+hashlib.sha256((CODE+"|"+TITLE+"|"+UNIT+"|"+alias).encode()).hexdigest()[:16]:LABELS[ident]["title"] for alias,ident in LOOKUP.items()}
LEGACY_LABELS=old_ids()
def legacy_title(indicator,source,original):
    if source!=SOURCE:return original
    title=LEGACY_LABELS.get(indicator)
    return TITLE+" · "+title if title else original
def number(raw):
    s=str(raw if raw is not None else "").strip().replace("\u00a0","").replace(" ","").replace(",",".")
    if s in ("","…","...","-","–","—","х","Х","x","X","н/д"):return None
    try:v=Decimal(s)
    except InvalidOperation:raise ValueError("Неизвестное числовое обозначение: "+s[:60])
    # The downloaded edition uses -77777777.0 for suppressed observations.
    # The marker is retained verbatim in raw_value and never treated as negative output.
    if v==Decimal("-77777777"):return None
    if not v.is_finite() or v<0:raise ValueError("Некорректная отгрузка")
    n=float(v)
    if not math.isfinite(n):raise ValueError("Число вне диапазона")
    return n
def parse(raw):
    if not 0<len(raw)<=35_000_000:raise ValueError("Размер ZIP")
    rows=[];seen=set()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        files=[x for x in z.infolist() if x.filename.rsplit("/",1)[-1]=="data_industry_102_v20260313.csv"]
        if len(files)!=1 or files[0].file_size>200_000_000:raise ValueError("Неоднозначный CSV")
        with z.open(files[0]) as f:
            reader=csv.DictReader(io.TextIOWrapper(f,encoding="utf-8-sig"),delimiter=";")
            if not FIELDS<=set(reader.fieldnames or []) or len(reader.fieldnames)!=len(set(reader.fieldnames)):raise ValueError("Неизвестная схема архива")
            for r in reader:
                if reader.line_num>1_500_001:raise ValueError("Лимит строк")
                if None in r or any(v is None for v in r.values()):raise ValueError("Длина строки")
                if r["indicator_code"]!=CODE:continue
                if r["indicator_name"]!=TITLE or r["indicator_unit"]!=UNIT:raise ValueError("Изменился смысл или единица таблицы")
                sub=r["subsection"];group=LOOKUP.get(sub)
                if not group:raise ValueError("Неизвестный подраздел: "+sub)
                y=int(r["year"]);region=r["object_name"];level=r["object_level"]
                if y not in EDITIONS or not region or level not in ("Регион","Страна","Федеральный округ"):raise ValueError("Некорректная территория или год")
                if r["source"]!=EDITIONS[y] or r["version_date"]!=RELEASE:raise ValueError("Неизвестная редакция")
                # A territory name can carry distinct official codes; never merge them.
                key=(group,region,level,r["object_okato"],r["object_oktmo"],y)
                if key in seen:raise ValueError("Дублирующийся ключ: "+str(key))
                seen.add(key)
                rows.append(dict(group=group,region=region,level=level,okato=r["object_okato"],oktmo=r["object_oktmo"],year=y,value=number(r["indicator_value"]),raw_value=r["indicator_value"],subsection=sub,edition=r["source"],version=r["version_date"],sheet=files[0].filename,row=reader.line_num,note=r["comment"]))
    if {r["group"] for r in rows}!=set(LABELS):raise ValueError("Неполное покрытие групп")
    years=sorted({r["year"] for r in rows})
    if set(years)!=set(EDITIONS) or len({r["region"] for r in rows if r["level"]=="Регион"})<70:raise ValueError("Неполное покрытие регионов/лет")
    for y in years:
        national=[r for r in rows if r["year"]==y and r["level"]=="Страна"]
        if {r["group"] for r in national}!=set(LABELS) or len(national)!=len(LABELS) or any(r["region"]!="Российская Федерация" or r["value"] is None for r in national):raise ValueError("Неоднозначный итог РФ "+str(y))
        if next(r for r in national if r["group"]=="total")["value"]<=0:raise ValueError("Нулевой итог РФ")
    return sorted(rows,key=lambda r:(r["year"],r["level"],r["region"],r["okato"],r["group"]))
def empty(stamp):
    return dict(schema=1,built=stamp,source=SOURCE,catalog=CATALOG,primary=PRIMARY,license=LICENSE,release=RELEASE,unit=UNIT,indicator=CODE,method=METHOD,groups=list(LABELS.values()),checked=None,success=None,status="Ожидается загрузка",sha256=None,rows=[])
def quality(d,previous=None):
    if d["schema"]!=1 or d["source"]!=SOURCE or d["release"]!=RELEASE or d["groups"]!=list(LABELS.values()) or d["indicator"]!=CODE or d["unit"]!=UNIT:raise ValueError("Метаданные отраслевой таблицы")
    rows=d["rows"];keys=set();line_numbers=set()
    if rows and (not d["success"] or d["sha256"]!=EXPECTED_SHA256):raise ValueError("Нет хеша исходного файла")
    for r in rows:
        key=(r["group"],r["region"],r["level"],r["okato"],r["oktmo"],r["year"])
        if key in keys or LOOKUP.get(r["subsection"])!=r["group"] or r["version"]!=RELEASE or r["value"]!=number(r["raw_value"]) or not isinstance(r["row"],int) or r["row"]<2:raise ValueError("Неверная строка отраслевого архива")
        if r["row"] in line_numbers or r["level"] not in ("Регион","Страна","Федеральный округ") or not r["region"] or EDITIONS.get(r["year"])!=r["edition"]:raise ValueError("Некорректная территория, издание или номер строки")
        keys.add(key);line_numbers.add(r["row"])
    if previous and previous.get("rows"):
        old={(r["group"],r["region"],r["level"],r["okato"],r["oktmo"],r["year"]) for r in previous["rows"]}
        if old-keys:raise ValueError("Потеря ранее опубликованных наблюдений")
    if rows:
        if {r["year"] for r in rows}!=set(EDITIONS) or {r["group"] for r in rows}!=set(LABELS):raise ValueError("Неполный отраслевой архив")
        for y in sorted(EDITIONS):
            national=[r for r in rows if r["year"]==y and r["level"]=="Страна"]
            if len(national)!=len(LABELS) or {r["group"] for r in national}!=set(LABELS) or any(r["region"]!="Российская Федерация" or r["value"] is None for r in national):raise ValueError("Итог РФ не воспроизводится")
            if next(r for r in national if r["group"]=="total")["value"]<=0:raise ValueError("Нулевой итог РФ")
    return dict(regional_manufacturing_groups=sum(any(r["group"]==ident and r["value"] is not None for r in rows) for ident in LABELS if ident!="total"),regional_manufacturing_rows=len(rows),regional_manufacturing_numeric=sum(r["value"] is not None for r in rows),regional_manufacturing_suppressed=sum(str(r["raw_value"]).strip() in ("-77777777","-77777777.0") for r in rows),regional_manufacturing_years=len({r["year"] for r in rows}))
def publish(out,previous,stamp,refresh):
    import historical
    d=empty(stamp);old=None
    try:
        old=json.loads((previous/"regional-manufacturing.json").read_text(encoding="utf-8"));quality(old);d={**old,"built":stamp}
    except (OSError,ValueError,KeyError,TypeError):old=None
    due=not d["checked"] or date.fromisoformat(stamp[:10])>=date.fromisoformat(d["checked"][:10])+timedelta(days=30 if d["checked"]==d["success"] else 2)
    if refresh and due:
        try:
            raw,_=historical.get(SOURCE,35_000_000)
            if hashlib.sha256(raw).hexdigest()!=EXPECTED_SHA256:raise ValueError("Изменился хеш фиксированного выпуска; требуется проверка источника")
            candidate={**empty(stamp),"checked":stamp,"success":stamp,"status":"Импортировано","sha256":hashlib.sha256(raw).hexdigest(),"rows":parse(raw)}
            quality(candidate,old);d=candidate
        except Exception as e:
            d.update(checked=stamp,status="Ошибка: "+str(e)[:450])
    quality(d,old)
    (out/"regional-manufacturing.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    with (out/"regional-manufacturing.csv").open("w",encoding="utf-8-sig",newline="") as f:
        fields=["group","region","level","okato","oktmo","year","value","raw_value","subsection","edition","version","sheet","row","note","unit","source","sha256"]
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for r in d["rows"]:w.writerow({**r,"unit":UNIT,"source":SOURCE,"sha256":d["sha256"]})
    return d
