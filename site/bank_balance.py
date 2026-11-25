"""Standalone bank published balance sheet 0409806, fixed date pilot."""
import hashlib,json,re
from datetime import date,timedelta
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor
from bank_registry import Tables,clean
from bank_capital import money,PERIOD,target_cohort
FILE="bank-balance.json"
ROOT="https://www.cbr.ru/banking_sector/credit/coinfo/f806/1904/"
MAX=2*1024*1024
FIELDS={
 "assets":("14","Всего активов"),
 "liabilities":("24","Всего обязательств"),
 "equity":("38","Всего источников собственных средств"),
 "loans":("5","Чистая ссудная задолженность, оцениваемая по амортизированной стоимости"),
 "client_funds":("16","Средства клиентов, оцениваемые по амортизированной стоимости"),
 "nonbank_funds":("16.2","средства клиентов, не являющихся кредитными организациями"),
 "retail_funds":("16.2.1","вклады (средства) физических лиц, в том числе индивидуальных предпринимателей")
}
NOTE="Форма 0409806 отдельной кредитной организации, тыс. руб. Строки 5, 16, 16.2, 16.2.1 имеют разные определения; не суммировать вложенные строки. Источники собственных средств не регуляторный капитал."
def url(reg):
    if not re.fullmatch(r"\d{1,6}",reg):raise ValueError("Регистрационный номер")
    return ROOT+"?dt=202601&regnum="+reg
def check_values(v):
    if set(v)!=set(FIELDS) or any(x is not None and (not isinstance(x,str) or not re.fullmatch(r"-?\d{1,18}",x)) for x in v.values()):raise ValueError("Поля баланса")
    a,l,e=(v[k] for k in ("assets","liabilities","equity"))
    if a is None or l is None or e is None or int(a)<=0 or int(l)<0 or int(a)!=int(l)+int(e):raise ValueError("Балансовое равенство")
def parse(raw,enc,reg):
    if not 0<len(raw)<=MAX:raise ValueError("Размер HTML")
    p=Tables();p.feed(raw.decode(enc));p.close();txt=clean(" ".join(p.text))
    if not re.search(r"Бухгалтерский баланс \(публикуемая форма\) на 0?1\.0?1\.2026(?!\d)",txt,re.I) or "Код формы по ОКУД 0409806" not in txt or not re.search(r"Регистрационный номер \(порядковый номер\)\s+"+re.escape(reg)+r"(?!\d)",txt):raise ValueError("Дата, форма или номер")
    by={n:(k,label.casefold()) for k,(n,label) in FIELDS.items()}
    candidates=[]
    for table in p.tables:
        if not any(len(r)>=5 and "данные за отчетный период" in r[3].lower() and "тыс. руб" in r[3].lower() and "предыдущий отчетный год" in r[4].lower() for r in table):continue
        current={};prior={}
        for r in table:
            if len(r)<5 or r[0] not in by:continue
            k,label=by[r[0]]
            if clean(r[1]).casefold()!=label or k in current:raise ValueError("Строка или определение: "+r[0])
            current[k]=money(r[3]);prior[k]=money(r[4])
        if set(current)==set(FIELDS):candidates.append((current,prior))
    if len(candidates)!=1:raise ValueError("Нет однозначного баланса")
    current,prior=candidates[0];check_values(current)
    # A newly registered bank can have no comparative balance at all.
    if any(prior[k] is not None for k in ("assets","liabilities","equity")):check_values(prior)
    elif any(v is not None for v in prior.values()):raise ValueError("Неполная сравнительная база")
    return dict(registration_number=reg,current=current,prior=prior,source=url(reg),sha256=hashlib.sha256(raw).hexdigest())
def fetch(reg):
    u=url(reg)
    with urlopen(Request(u,headers={"User-Agent":"Mozilla/5.0"}),timeout=12) as r:
        a=urlsplit(r.geturl());b=urlsplit(u)
        if a.scheme!="https" or a.hostname not in ("cbr.ru","www.cbr.ru") or a.path!=b.path or parse_qs(a.query)!=parse_qs(b.query):raise ValueError("Другой отчёт")
        return parse(r.read(MAX+1),r.headers.get_content_charset() or "utf-8",reg)
def empty():return dict(schema=1,period=PERIOD,note=NOTE,rows=[],attempts={},cohort=[],cohort_edition=None,checked=None)
def quality(d):
    if d.get("schema")!=1 or d.get("period")!=PERIOD or d.get("note")!=NOTE:raise ValueError("Паспорт баланса")
    ids=set()
    for r in d["rows"]:
        reg=r["registration_number"]
        if reg in ids or r["source"]!=url(reg) or not re.fullmatch(r"[a-f0-9]{64}",r["sha256"]):raise ValueError("Источник")
        check_values(r["current"])
        if set(r["prior"])!=set(FIELDS):raise ValueError("Сравнительные поля")
        if any(v is not None for v in r["prior"].values()):check_values(r["prior"])
        ids.add(reg)
    cohort=d["cohort"]
    if len(cohort)>5000 or len(set(cohort))!=len(cohort):raise ValueError("Охват")
    for reg in cohort:url(reg)
    if d["cohort_edition"]:date.fromisoformat(d["cohort_edition"])
    if d["checked"]:date.fromisoformat(d["checked"][:10])
    for reg,a in d["attempts"].items():
        url(reg);date.fromisoformat(a["checked"][:10])
        if a["error"] is not None and not isinstance(a["error"],str):raise ValueError("Протокол")
    return {"bank_balance_records":len(ids),"bank_balance_target":len(cohort),"bank_balance_observations":sum(v is not None for r in d["rows"] for v in r["current"].values())}
def publish(out,previous,stamp,refresh,directory,fetcher=fetch):
    d=empty()
    try:
        old=json.loads((previous/FILE).read_text());quality(old);d=old
    except (OSError,ValueError,KeyError,TypeError):pass
    system={r["registration_number"] for r in directory["datasets"]["system"]["rows"]}
    # First 12 systemic + verified source examples, then bounded daily expansion.
    cohort=target_cohort(directory)
    d.update(cohort=cohort,cohort_edition=directory["datasets"]["full"]["edition"])
    if refresh and (not d["checked"] or d["checked"][:10]!=stamp[:10]):
        by={r["registration_number"]:r for r in d["rows"]};today=date.fromisoformat(stamp[:10]);a=d["attempts"]
        candidates=set(cohort)|system|{"2664","933","3161","1143","1399","3554"}
        todo=sorted((r for r in candidates if r not in by and (r not in a or today>=date.fromisoformat(a[r]["checked"][:10])+timedelta(days=14))),key=lambda r:(r not in system,r not in {"2664","933","3161","1143","1399","3554"},r in a,a.get(r,{}).get("checked",""),int(r)))[:20]
        def one(reg):
            try:
                row=fetcher(reg)
                if row["registration_number"]!=reg or row["source"]!=url(reg):raise ValueError("Другой банк")
                check_values(row["current"]);return reg,row,None
            except Exception as e:return reg,None,str(e)[:180]
        with ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(one,todo))
        for reg,row,error in results:
            a[reg]=dict(checked=stamp,error=error)
            if row is not None:by[reg]=row
        d.update(rows=sorted(by.values(),key=lambda r:int(r["registration_number"])),checked=stamp)
        print("BANK_BALANCE_806",json.dumps({"attempted":len(todo),"verified":len(by),"target":len(cohort)},ensure_ascii=False),flush=True)
    quality(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8");return d
