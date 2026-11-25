"""Pilot: official CBR reporting date inventory, not financial observations."""
import hashlib,json,re,xml.etree.ElementTree as ET
from datetime import date,timedelta
from urllib.request import Request,urlopen
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
SOURCE="https://www.cbr.ru/CreditInfoWebServ/CreditOrgInfo.asmx"
NS="http://web.cbr.ru/"
SOAP="http://schemas.xmlsoap.org/soap/envelope/"
FORMS=("101","102","123","135")
FILE="bank-disclosure.json"
LIMIT=3
MAX=1024*1024
def envelope(method,parameter,value):
    if method not in {"RegNumToIntCode",*("GetDatesForF"+k for k in FORMS)} or not str(value).isdigit():raise ValueError("Некорректный запрос")
    if parameter!=("RegNumber" if method=="RegNumToIntCode" else "CredprgNumber"):raise ValueError("Параметр")
    return (f'<soap:Envelope xmlns:soap="{SOAP}"><soap:Body><{method} xmlns="{NS}"><{parameter}>{value}</{parameter}></{method}></soap:Body></soap:Envelope>').encode()
def result(raw,method):
    if not 0<len(raw)<=MAX or re.search(br"<!\s*(?:DOCTYPE|ENTITY)",raw,re.I):raise ValueError("Недопустимый XML")
    root=ET.fromstring(raw)
    if root.tag!="{"+SOAP+"}Envelope":raise ValueError("SOAP envelope")
    body=root.find("{"+SOAP+"}Body")
    if body is None or len(body)!=1:raise ValueError("SOAP body")
    response=body[0]
    if response.tag!="{"+NS+"}"+method+"Response":raise ValueError("SOAP fault или неожиданный ответ")
    x=response.find("{"+NS+"}"+method+"Result")
    if x is None:raise ValueError("Нет результата")
    return x
def fetch(method,parameter,value):
    req=Request(SOURCE,data=envelope(method,parameter,value),headers={"Content-Type":"text/xml; charset=utf-8","SOAPAction":'"'+NS+method+'"',"User-Agent":"EconomicMonitor/1.0"})
    with urlopen(req,timeout=8) as r:
        if r.geturl()!=SOURCE:raise ValueError("Неожиданный URL")
        return r.read(MAX+1)
def mapping(raw):
    x=result(raw,"RegNumToIntCode")
    if len(x) or not re.fullmatch(r"[1-9]\d{0,8}(?:\.0+)?",x.text or ""):raise ValueError("Нет однозначного внутреннего кода")
    return int((x.text or "").split(".")[0])
def dates(raw,form,stamp):
    x=result(raw,"GetDatesForF"+form);out=set()
    for child in x:
        if child.tag!="{"+NS+"}dateTime" or len(child) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?",child.text or ""):raise ValueError("Неожиданная дата")
        d=date.fromisoformat(child.text[:10])
        if d>date.fromisoformat(stamp[:10]) or d.year<1990:raise ValueError("Дата вне допустимого периода")
        out.add(d.isoformat())
    if x.text and x.text.strip():raise ValueError("Неожиданный текст результата")
    return sorted(out,reverse=True)
def hash_raw(raw):return hashlib.sha256(raw).hexdigest()
def cohort(directory):
    a=directory["datasets"]["system"]
    return sorted(a["rows"],key=lambda r:int(r["registration_number"]))[:LIMIT]
def one(bank,stamp,fetcher):
    r=dict(registration_number=bank["registration_number"],name=bank["name"],internal_code=None,mapping_sha256=None,forms={},error=None)
    try:
        raw=fetcher("RegNumToIntCode","RegNumber",r["registration_number"])
        r["internal_code"]=mapping(raw);r["mapping_sha256"]=hash_raw(raw)
    except Exception as e:r["error"]=str(e)[:180];return r
    for form in FORMS:
        try:
            raw=fetcher("GetDatesForF"+form,"CredprgNumber",r["internal_code"])
            r["forms"][form]=dict(status="ok",dates=dates(raw,form,stamp),sha256=hash_raw(raw))
        except Exception as e:r["forms"][form]=dict(status="unavailable",dates=[],sha256=None,error=str(e)[:180])
    return r
def empty():return dict(schema=1,source=SOURCE,checked=None,edition=None,status="not_loaded",rows=[])
def quality(d):
    if d.get("schema")!=1 or d.get("source")!=SOURCE or d.get("status") not in ("not_loaded","ok","partial","cached","unavailable"):raise ValueError("Паспорт раскрытия")
    rows=d["rows"]
    if not isinstance(rows,list) or len(rows)>LIMIT or len({r["registration_number"] for r in rows})!=len(rows):raise ValueError("Охват пилота")
    if rows and (not d["checked"] or not d["edition"]):raise ValueError("Дата пилота")
    if d["edition"]:date.fromisoformat(d["edition"])
    if d["checked"]:date.fromisoformat(d["checked"][:10])
    ok=0
    for r in rows:
        if not re.fullmatch(r"\d{1,6}",r["registration_number"]) or not r["name"]:raise ValueError("Регистрационный номер")
        if r["internal_code"] is None:
            if r["forms"] or r["mapping_sha256"] is not None or not r["error"]:raise ValueError("Неподтверждённый код")
            continue
        if type(r["internal_code"]) is not int or r["internal_code"]<=0 or not re.fullmatch(r"[a-f0-9]{64}",r["mapping_sha256"] or "") or set(r["forms"])!=set(FORMS):raise ValueError("Код/формы")
        for x in r["forms"].values():
            if x["status"]=="ok":
                if not re.fullmatch(r"[a-f0-9]{64}",x["sha256"] or "") or x["dates"]!=sorted(set(x["dates"]),reverse=True):raise ValueError("Даты/хеш")
                if any(date.fromisoformat(v)>date.fromisoformat(d["checked"][:10]) or date.fromisoformat(v).year<1990 for v in x["dates"]):raise ValueError("Дата вне периода")
                ok+=1
            elif x["status"]!="unavailable" or x["dates"] or x["sha256"] is not None or not x.get("error"):raise ValueError("Статус формы")
    return {"bank_disclosure_pilot_banks":len(rows),"bank_disclosure_verified_forms":ok}
def publish(out,previous,stamp,refresh,directory,fetcher=fetch):
    d=empty();selected=cohort(directory);edition=directory["datasets"]["system"]["edition"]
    try:
        old=json.loads((previous/FILE).read_text(encoding="utf-8"));quality(old)
        if old["edition"]==edition and [r["registration_number"] for r in old["rows"]]==[r["registration_number"] for r in selected]:
            d=old
            if d["rows"] and quality(d)["bank_disclosure_verified_forms"]:d["status"]="cached"
    except (OSError,ValueError,KeyError,TypeError):pass
    due=not d["checked"] or date.fromisoformat(stamp[:10])>=date.fromisoformat(d["checked"][:10])+timedelta(days=7)
    if refresh and selected and due:
        with ThreadPoolExecutor(max_workers=LIMIT) as pool:
            rows=list(pool.map(lambda b:one(b,stamp,fetcher),selected))
        candidate=dict(schema=1,source=SOURCE,checked=stamp,edition=edition,status="partial",rows=rows)
        n=quality(candidate)["bank_disclosure_verified_forms"]
        if n==len(rows)*len(FORMS):candidate["status"]="ok"
        elif n==0:candidate["status"]="unavailable"
        # Retain the previous verified snapshot on reduced coverage; do not silently combine check dates.
        if n<quality(d)["bank_disclosure_verified_forms"]:
            d["last_attempt"]=stamp;d["status"]="cached"
        else:d=candidate
    quality(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8");return d
