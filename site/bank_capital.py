"""Published form 0409808, standalone bank. Historical fixed-period pilot."""
import hashlib,json,re
from datetime import date,timedelta
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor
from bank_registry import Tables,clean
FILE="bank-capital.json"
PERIOD="2026-01-01"
ROOT="https://www.cbr.ru/banking_sector/credit/coinfo/f808/1904/"
MAX=2*1024*1024
def url(reg,period=PERIOD):
    if not re.fullmatch(r"\d{1,6}",reg):raise ValueError("Номер банка")
    day=date.fromisoformat(period)
    if day.day!=1 or day.month not in (1,4,7,10) or day.year<2020:raise ValueError("Квартальная дата")
    return ROOT+"?dt="+day.strftime("%Y%m")+"&regnum="+reg
def money(v):
    v=re.sub(r"\s+","",v).replace("−","-")
    if v in ("","-","—","–"):return None
    if not re.fullmatch(r"-?\d{1,18}",v):raise ValueError("Не целое число тыс. руб.")
    return str(int(v))
def parse(raw,enc,reg,period=PERIOD):
    url(reg,period);day=date.fromisoformat(period)
    if not 0<len(raw)<=MAX:raise ValueError("Размер HTML")
    p=Tables();p.feed(raw.decode(enc));p.close();txt=clean(" ".join(p.text))
    pattern=rf"Отч[её]т об уровне достаточности капитала для покрытия рисков \(публикуемая форма\) на 0?1\.0?{day.month}\.{day.year}(?!\d)"
    if not re.search(pattern,txt,re.I):raise ValueError("Дата или форма")
    if "Код формы по ОКУД 0409808" not in txt or not re.search(r"Регистрационный номер \(порядковый номер\)\s+"+re.escape(reg)+r"(?!\d)",txt):raise ValueError("Номер/ОКУД")
    candidates=[]
    for t in p.tables:
        if not any(len(r)>=5 and "на отчетную дату" in r[3].lower() and "на начало отчетного года" in r[4].lower() and "тыс. руб." in r[3] for r in t):continue
        for r in t:
            if len(r)<5 or r[0] not in ("59","14") or not r[1].lower().startswith("собственные средства (капитал), итого"):continue
            a,b=money(r[3]),money(r[4])
            if a is not None:candidates.append((r[0],a,b))
    if len(candidates)!=1:raise ValueError("Нет однозначной опубликованной строки капитала")
    line,capital,opening=candidates[0]
    return dict(registration_number=reg,line=line,capital=capital,opening=opening,source=url(reg,period),sha256=hashlib.sha256(raw).hexdigest(),verification="html")
def fetch(reg,period=PERIOD):
    u=url(reg,period)
    with urlopen(Request(u,headers={"User-Agent":"Mozilla/5.0"}),timeout=12) as r:
        actual=urlsplit(r.geturl());expected=urlsplit(u)
        if actual.scheme!="https" or actual.hostname not in ("cbr.ru","www.cbr.ru") or actual.path!=expected.path or parse_qs(actual.query)!=parse_qs(expected.query):raise ValueError("Другой отчёт")
        return parse(r.read(MAX+1),r.headers.get_content_charset() or "utf-8",reg,period)
def quality(d):
    if d.get("schema")!=1 or d.get("period")!=PERIOD or d.get("status") not in ("documentary","partial","ok","cached"):raise ValueError("Паспорт капитала")
    date.fromisoformat(d["checked"][:10]);ids=set()
    for r in d["rows"]:
        reg=r["registration_number"]
        if reg in ids or r["source"]!=url(reg) or r["line"] not in ("59","14") or not re.fullmatch(r"-?\d{1,18}",r["capital"]) or r["opening"] is not None and not re.fullmatch(r"-?\d{1,18}",r["opening"]):raise ValueError("Строка капитала")
        if r["verification"]=="html":
            if not re.fullmatch(r"[a-f0-9]{64}",r["sha256"] or ""):raise ValueError("SHA-256")
        elif r["verification"]!="documentary" or r["sha256"] is not None:raise ValueError("Статус источника")
        ids.add(reg)
    if not ids:raise ValueError("Пустая выборка")
    return {"bank_capital_records":len(ids),"bank_capital_html_verified":sum(r["verification"]=="html" for r in d["rows"])}
def publish(out,previous,stamp,refresh,directory,fetcher=fetch):
    d=json.loads(Path(__file__).with_name("bank-capital-seed.json").read_text(encoding="utf-8"));quality(d)
    try:
        old=json.loads((previous/FILE).read_text(encoding="utf-8"));quality(old)
        if {r["registration_number"] for r in d["rows"]}<={r["registration_number"] for r in old["rows"]}:d=old;d["status"]="cached"
    except (OSError,ValueError,KeyError,TypeError):pass
    if refresh and (not d.get("last_attempt") or date.fromisoformat(stamp[:10])>=date.fromisoformat(d["last_attempt"][:10])+timedelta(days=7)):
        by={r["registration_number"]:r for r in d["rows"]}
        cohort=sorted(set(by)|{r["registration_number"] for r in directory["datasets"]["system"]["rows"]},key=int)
        def one(reg):
            try:return reg,fetcher(reg),None
            except Exception as e:return reg,None,str(e)[:180]
        with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(one,cohort))
        errors=[]
        for reg,r,e in results:
            if r is not None:by[reg]=r
            else:errors.append(dict(registration_number=reg,error=e))
        d.update(rows=sorted(by.values(),key=lambda r:int(r["registration_number"])),status="partial" if errors else "ok",checked=stamp,last_attempt=stamp,errors=errors)
    quality(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8");return d
