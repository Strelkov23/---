"""Exact regional mining and energy shipment tables from the verified Rosstat archive.
All values are nominal million RUB. These are not physical production or installed capacities.
The two sections have distinct totals; they must not be combined as a denominator.
"""
import csv,io,json,zipfile,hashlib
from datetime import date,timedelta
from collections import Counter
import regional_manufacturing as m
SOURCE=m.SOURCE
RELEASE=m.RELEASE
EDITIONS=m.EDITIONS
UNIT=m.UNIT
TABLES={
 "Y477090008":("B","Добыча полезных ископаемых","Объем отгруженных товаров собственного производства, выполненных работ и услуг собственными силами по видам экономической деятельности раздела добыча полезных ископаемых",[
 ("mining_total","Добыча полезных ископаемых — всего","B","Добыча полезных ископаемых — всего"),
 ("coal","Добыча угля","05","Из нее: Добыча угля"),
 ("oil_gas","Добыча нефти и природного газа","06","Из нее: Добыча нефти и природного газа"),
 ("metal_ores","Добыча металлических руд","07","Из нее: Добыча металлических руд"),
 ("other_mining","Добыча прочих полезных ископаемых","08","Из нее: Добыча прочих полезных ископаемых"),
 ("mining_services","Услуги в области добычи полезных ископаемых","09","Из нее: Предоставление услуг в области добычи полезных ископаемых")]),
 "Y477090009":("D","Электроэнергия, газ, пар","Объем отгруженных товаров собственного производства, выполненных работ и услуг собственными силами по видам экономической деятельности раздела обеспечение электрической энергией, газом и паром, кондиционирование воздуха",[
 ("energy_total","Обеспечение электрической энергией, газом и паром — всего","D","Обеспечение электрической энергией, газом и паром; кондициони-рование воздуха — всего"),
 ("electricity","Производство, передача и распределение электроэнергии","35.1","В том числе по видам экономической деятельности: производство, передача и распределение электроэнергии"),
 ("gas_distribution","Производство и распределение газообразного топлива","35.2","В том числе по видам экономической деятельности: производство и распределение газообразного топлива"),
 ("heat","Пар, горячая вода, кондиционирование","35.3","В том числе по видам экономической деятельности: производство, передача и распределение пара и горячей воды; кондиционирование воздуха")])
}
GROUPS={g[0]:dict(id=g[0],title=g[1],okved=g[2],subsection=g[3],section=t[0],table=code) for code,t in TABLES.items() for g in t[3]}
ALIASES={(g["table"],g["subsection"]):g["id"] for g in GROUPS.values()}
METHOD="Отгруженные товары собственного производства, работы и услуги собственными силами. Текущие цены, млн руб. ОКВЭД2, разделы B и D; итоги каждого раздела и его группы показываются отдельно. Не физическая добыча, не установленная мощность и не ВРП."
def value(raw):
    if str(raw).strip() in ("-99999999","-99999999.0"):return None
    return m.number(raw)
def parse(raw):
    if not 0<len(raw)<=35_000_000:raise ValueError("Размер ZIP")
    rows=[]
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        files=[x for x in z.infolist() if x.filename.rsplit("/",1)[-1]=="data_industry_102_v20260313.csv"]
        if len(files)!=1 or files[0].file_size>200_000_000:raise ValueError("Неоднозначный CSV")
        with z.open(files[0]) as f:
            reader=csv.DictReader(io.TextIOWrapper(f,encoding="utf-8-sig"),delimiter=";")
            if not m.FIELDS<=set(reader.fieldnames or []) or len(reader.fieldnames)!=len(set(reader.fieldnames)):raise ValueError("Схема архива")
            for r in reader:
                if reader.line_num>1_500_001:raise ValueError("Лимит строк")
                if None in r or any(v is None for v in r.values()):raise ValueError("Длина строки")
                code=r["indicator_code"]
                if code not in TABLES:continue
                if r["indicator_name"]!=TABLES[code][2] or r["indicator_unit"]!=UNIT:raise ValueError("Изменился смысл или единица")
                sub=r["subsection"];group=ALIASES.get((code,sub))
                if not group:raise ValueError("Неизвестный подраздел "+sub)
                y=int(r["year"])
                rows.append(dict(group=group,region=r["object_name"],level=r["object_level"],okato=r["object_okato"],oktmo=r["object_oktmo"],year=y,value=value(r["indicator_value"]),raw_value=r["indicator_value"],subsection=sub,edition=r["source"],version=r["version_date"],sheet=files[0].filename,row=reader.line_num,note=r["comment"],table=code))
    rows.sort(key=lambda r:(r["year"],r["level"],r["region"],r["okato"],r["group"]))
    check_rows(rows)
    return rows
def key(r):return (r["group"],r["region"],r["level"],r["okato"],r["oktmo"],r["year"])
def check_rows(rows):
    keys=set();lines=set()
    for r in rows:
        k=key(r)
        if k in keys or r["row"] in lines or ALIASES.get((r["table"],r["subsection"]))!=r["group"]:raise ValueError("Неоднозначная строка добычи/энергетики")
        if r["level"] not in ("Регион","Страна","Федеральный округ") or not r["region"] or EDITIONS.get(r["year"])!=r["edition"] or r["version"]!=RELEASE or r["value"]!=value(r["raw_value"]) or type(r["row"]) is not int or r["row"]<2:raise ValueError("Некорректные метаданные отраслевой строки")
        keys.add(k);lines.add(r["row"])
    if not rows:return
    if set(r["year"] for r in rows)!=set(EDITIONS) or set(r["group"] for r in rows)!=set(GROUPS):raise ValueError("Неполный архив")
    for y in EDITIONS:
        national=[r for r in rows if r["year"]==y and r["level"]=="Страна"]
        if len(national)!=len(GROUPS) or {r["group"] for r in national}!=set(GROUPS) or any(r["region"]!="Российская Федерация" for r in national):raise ValueError("Неоднозначный итог РФ")
        for g in ("mining_total","energy_total"):
            v=next(r["value"] for r in national if r["group"]==g)
            if v is None or v<=0:raise ValueError("Нет числового итога раздела РФ")
        for g in GROUPS:
            if len({r["region"] for r in rows if r["year"]==y and r["level"]=="Регион" and r["group"]==g})<70:raise ValueError("Недостаточный охват "+g)
def empty(stamp):
    return dict(schema=1,built=stamp,source=SOURCE,catalog=m.CATALOG,primary=m.PRIMARY,license=m.LICENSE,release=RELEASE,unit=UNIT,method=METHOD,groups=list(GROUPS.values()),checked=None,success=None,status="Ожидается загрузка",sha256=None,rows=[])
def quality(d,previous=None):
    if d["schema"]!=1 or d["source"]!=SOURCE or d["release"]!=RELEASE or d["unit"]!=UNIT or d["groups"]!=list(GROUPS.values()):raise ValueError("Метаданные добычи/энергетики")
    rows=d["rows"]
    if rows and (d["sha256"]!=m.EXPECTED_SHA256 or not d["success"]):raise ValueError("Непроверенный исходный файл")
    check_rows(rows)
    if previous and {key(r) for r in previous["rows"]}-{key(r) for r in rows}:raise ValueError("Потеря архивных наблюдений")
    return dict(regional_mining_energy_groups=len({r["group"] for r in rows if r["value"] is not None}),regional_mining_energy_rows=len(rows),regional_mining_energy_numeric=sum(r["value"] is not None for r in rows),regional_mining_energy_missing=sum(r["value"] is None for r in rows))
CSV_FIELDS=["group","region","level","okato","oktmo","year","value","raw_value","subsection","edition","version","sheet","row","note","table","unit","source","sha256"]
def csv_rows(d):
    for r in d["rows"]:yield {**r,"unit":UNIT,"source":SOURCE,"sha256":d["sha256"]}
def verify_csv(path,d):
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if reader.fieldnames!=CSV_FIELDS:raise ValueError("Поля CSV добычи/энергетики")
        actual=list(reader)
    expected=[{k:"" if r[k] is None else str(r[k]) for k in CSV_FIELDS} for r in csv_rows(d)]
    if actual!=expected:raise ValueError("CSV добычи/энергетики не соответствует JSON")
def publish(out,previous,stamp,refresh):
    d=empty(stamp);old=None
    try:
        old=json.loads((previous/"regional-mining-energy.json").read_text(encoding="utf-8"));quality(old);d={**old,"built":stamp}
    except (OSError,ValueError,KeyError,TypeError):old=None
    due=not d["checked"] or date.fromisoformat(stamp[:10])>=date.fromisoformat(d["checked"][:10])+timedelta(days=30 if d["checked"]==d["success"] else 2)
    if refresh and due:
        try:
            raw=m.verified_archive()
            candidate={**empty(stamp),"checked":stamp,"success":stamp,"status":"Импортировано","sha256":m.EXPECTED_SHA256,"rows":parse(raw)}
            quality(candidate,old);d=candidate
        except Exception as e:d.update(checked=stamp,status="Ошибка: "+str(e)[:450])
    quality(d,old)
    (out/"regional-mining-energy.json").write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    with (out/"regional-mining-energy.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=CSV_FIELDS);w.writeheader();w.writerows(csv_rows(d))
    return d
