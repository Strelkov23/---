"""FNS public corporate source passports. No mass observation import at this stage."""
import hashlib,json,re,xml.etree.ElementTree as ET
from datetime import datetime,date,timedelta
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
from bank_registry import Tables
FILE="company-sources.json"
KINDS={"income_expense":"7707329152-revexp","employment":"7707329152-sshr2019"}
BASE="https://www.nalog.gov.ru/rn77/opendata/"
HOSTS={"file.nalog.ru","data.nalog.ru","www.nalog.gov.ru","nalog.gov.ru"}
XSD_NS="{http://www.w3.org/2001/XMLSchema}"
def parse_catalog(raw,encoding,kind):
    p=Tables();p.feed(raw.decode(encoding));p.close()
    tables=[t for t in p.tables if any(len(r)>=3 and r[1]=="Идентификационный номер" and r[2]==KINDS[kind] for r in t)]
    if len(tables)!=1:raise ValueError("Паспорт набора не найден")
    fields={}
    for r in tables[0]:
        if len(r)>=3:
            if r[1] in fields:raise ValueError("Повтор поля паспорта")
            fields[r[1]]=r[2]
    prefix="/opendata/"+KINDS[kind]+"/"
    def url(key,pattern):
        v=fields[key];u=urlsplit(v)
        if u.scheme!="https" or u.hostname not in ("file.nalog.ru","data.nalog.ru") or u.query or u.fragment or not re.fullmatch(prefix+pattern,u.path):raise ValueError("Неожиданная ссылка "+key)
        return v
    archive=url("Гиперссылка (URL) на набор",r"data-\d{8}-structure-\d{8}\.zip")
    schema=url("Описание структуры набора данных",r"structure-\d{8}\.xsd")
    if fields["Формат данных"].lower()!="xml":raise ValueError("Не XML")
    release=datetime.strptime(fields["Дата последнего внесения изменений"],"%d.%m.%Y").date().isoformat()
    m=re.fullmatch(r"Данные за (20\d{2}) год",fields["Содержание последнего изменения"])
    if not m:raise ValueError("Неоднозначный отчётный год")
    report_year=int(m[1])
    if report_year>=int(release[:4]) or release.replace("-","")!=re.search(r"data-(\d{8})",archive)[1] or re.search(r"structure-(\d{8})",archive)[1]!=re.search(r"structure-(\d{8})",schema)[1]:raise ValueError("Несогласованные редакции")
    return dict(kind=kind,catalog=BASE+KINDS[kind]+"/",archive=archive,schema=schema,release=release,report_year=report_year,format="xml",catalog_sha256=hashlib.sha256(raw).hexdigest())
def inspect_schema(raw):
    if not 0<len(raw)<=2_000_000 or re.search(br"<!\s*(?:DOCTYPE|ENTITY)",raw,re.I):raise ValueError("Неподдерживаемый XSD")
    root=ET.fromstring(raw)
    if root.tag!=XSD_NS+"schema":raise ValueError("Не схема XML")
    # Only structural field names; do not assume their semantics or parse data.
    attrs=sorted({r.attrib["name"] for r in root.iter(XSD_NS+"attribute") if r.get("name")})
    elems=sorted({r.attrib["name"] for r in root.iter(XSD_NS+"element") if r.get("name")})
    if not attrs or not elems or len(attrs)>500 or len(elems)>500:raise ValueError("Неожиданный состав XSD")
    return dict(schema_sha256=hashlib.sha256(raw).hexdigest(),attributes=attrs,elements=elems)
def fetch(url,limit):
    u=urlsplit(url)
    if u.scheme!="https" or u.hostname not in HOSTS:raise ValueError("Источник вне списка")
    with urlopen(Request(url,headers={"User-Agent":"Mozilla/5.0"}),timeout=20) as r:
        u=urlsplit(r.geturl())
        if u.scheme!="https" or u.hostname not in HOSTS:raise ValueError("Перенаправление вне списка")
        raw=r.read(limit+1)
        if len(raw)>limit:raise ValueError("Превышен размер")
        return raw,r.headers.get_content_charset() or "utf-8"
def empty(kind):
    return dict(kind=kind,catalog=BASE+KINDS[kind]+"/",status="not_loaded",checked=None,success=None,schema_verified=None,archive=None,schema=None,release=None,report_year=None,format=None,catalog_sha256=None,schema_sha256=None,attributes=[],elements=[])
def quality(d):
    if d.get("schema")!=1 or [r["kind"] for r in d["rows"]]!=list(KINDS):raise ValueError("Паспорт корпоративных источников")
    for r in d["rows"]:
        kind=r["kind"]
        if r["catalog"]!=BASE+KINDS[kind]+"/" or r["status"] not in ("not_loaded","unavailable","partial","ok","cached"):raise ValueError("Статус")
        if r["archive"]:
            if not r["success"] or not r["checked"] or not r["release"] or type(r["report_year"]) is not int or not re.fullmatch(r"[a-f0-9]{64}",r["catalog_sha256"] or ""):raise ValueError("Метаданные выпуска")
            for k,suffix in [("archive",r"data-\d{8}-structure-\d{8}\.zip"),("schema",r"structure-\d{8}\.xsd")]:
                u=urlsplit(r[k])
                if u.scheme!="https" or u.hostname not in ("file.nalog.ru","data.nalog.ru") or not re.fullmatch("/opendata/"+KINDS[kind]+"/"+suffix,u.path):raise ValueError("Ссылка выпуска")
        elif r["success"] or r["schema_verified"] or r["status"] in ("ok","partial","cached"):raise ValueError("Пустой успех")
        if r["schema_verified"]:
            if not r["archive"] or not re.fullmatch(r"[a-f0-9]{64}",r["schema_sha256"] or "") or not r["attributes"] or not r["elements"]:raise ValueError("Проверка XSD")
        elif r["status"]=="ok" or r["schema_sha256"] or r["attributes"] or r["elements"]:raise ValueError("Нет XSD")
    return {"company_catalogs_checked":sum(bool(r["archive"]) for r in d["rows"]),"company_schemas_checked":sum(bool(r["schema_verified"]) for r in d["rows"])}
def publish(out,previous,stamp,refresh,get=fetch):
    d=dict(schema=1,rows=[empty(k) for k in KINDS])
    try:
        old=json.loads((previous/FILE).read_text(encoding="utf-8"));quality(old);d=old
        for r in d["rows"]:
            if r["archive"]:r["status"]="cached"
    except (OSError,ValueError,TypeError,KeyError):pass
    for i,r in enumerate(d["rows"]):
        days=7 if r["checked"]==r["success"] and r["schema_verified"] else 2
        if not refresh or r["checked"] and date.fromisoformat(stamp[:10])<date.fromisoformat(r["checked"][:10])+timedelta(days=days):continue
        try:
            raw,enc=get(r["catalog"],4_000_000);new=parse_catalog(raw,enc,r["kind"])
            if r["release"] and new["release"]<r["release"]:raise ValueError("Старая редакция")
            base={**empty(r["kind"]),**new,"checked":stamp,"success":stamp,"status":"partial"}
            if r["schema"]==new["schema"] and r["schema_verified"]:
                base.update(schema_verified=r["schema_verified"],schema_sha256=r["schema_sha256"],attributes=r["attributes"],elements=r["elements"])
            try:
                schema,_=get(new["schema"],2_000_000);base.update(inspect_schema(schema),schema_verified=stamp,status="ok")
            except Exception as e:base["error"]="XSD: "+str(e)[:160]
            d["rows"][i]=base
        except Exception as e:r.update(checked=stamp,status="cached" if r["archive"] else "unavailable",error=str(e)[:180])
    quality(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8");return d
