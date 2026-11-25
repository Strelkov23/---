"""CBR published profit and loss form 0409807, first quarter 2026."""
import hashlib,json,re
from datetime import date,timedelta
from urllib.parse import urlsplit,parse_qs
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor
from bank_registry import Tables,clean
from bank_capital import money,target_cohort
FILE="bank-profit.json"
ROOT="https://www.cbr.ru/banking_sector/credit/coinfo/f807/1904/"
PERIOD="2026-Q1"
PRIOR="2025-Q1"
MAX=2*1024*1024
FIELDS={
 "interest_income":("1","Процентные доходы, всего, в том числе:"),
 "interest_expense":("2","Процентные расходы, всего, в том числе:"),
 "net_interest":("3","Чистые процентные доходы (отрицательная процентная маржа)"),
 "net_interest_after_reserves":("5","Чистые процентные доходы (отрицательная процентная маржа) после создания резерва на возможные потери"),
 "fee_income":("14","Комиссионные доходы"),
 "fee_expense":("15","Комиссионные расходы"),
 "net_income":("20","Чистые доходы (расходы)"),
 "operating_expense":("21","Операционные расходы"),
 "pretax_profit":("22","Прибыль (убыток) до налогообложения"),
 "profit":("26","Прибыль (убыток) за отчетный период")
}
NOTE="Форма 0409807 отдельной кредитной организации, тыс. руб., 1 квартал 2026 и сопоставимый квартал 2025. Не МСФО группы и не годовые показатели."
def url(reg):
    if not re.fullmatch(r"\d{1,6}",reg):raise ValueError("Регистрационный номер")
    return ROOT+"?dt=202604&regnum="+reg
def validate_values(v):
    if set(v)!=set(FIELDS) or any(x is not None and (not isinstance(x,str) or not re.fullmatch(r"-?\d{1,18}",x)) for x in v.values()):raise ValueError("Поля финансового результата")
    for a,b,c in (("interest_income","interest_expense","net_interest"),("net_income","operating_expense","pretax_profit")):
        if all(v[k] is not None for k in (a,b,c)) and int(v[a])-int(v[b])!=int(v[c]):raise ValueError("Контрольное равенство: "+c)
def parse(raw,enc,reg):
    if not 0<len(raw)<=MAX:raise ValueError("Размер HTML")
    p=Tables();p.feed(raw.decode(enc));p.close();txt=clean(" ".join(p.text))
    if not re.search(r"Отч[её]т о финансовых результатах \(публикуемая форма\) за первый квартал 2026 года",txt,re.I) or "Код формы по ОКУД 0409807" not in txt or not re.search(r"Регистрационный номер \(порядковый номер\)\s+"+re.escape(reg)+r"(?!\d)",txt):raise ValueError("Период, форма или номер")
    candidates=[]
    by={n:(k,label.casefold()) for k,(n,label) in FIELDS.items()}
    for table in p.tables:
        if not any(len(r)>=5 and "данные за отчетный период" in r[3].lower() and "тыс. руб" in r[3].lower() and "за соответствующий период прошлого года" in r[4].lower() for r in table):continue
        # Identify section 1 by its distinctive first row; section 2 reuses row numbers.
        if not any(len(r)>=5 and r[0]=="1" and clean(r[1]).casefold()==FIELDS["interest_income"][1].casefold() for r in table):continue
        current={};prior={}
        for r in table:
            if len(r)<5 or r[0] not in by:continue
            k,label=by[r[0]]
            if clean(r[1]).casefold()!=label or k in current:raise ValueError("Строка: "+r[0])
            current[k]=money(r[3]);prior[k]=money(r[4])
        if set(current)==set(FIELDS):candidates.append((current,prior))
    if len(candidates)!=1:raise ValueError("Нет однозначного раздела прибылей и убытков")
    current,prior=candidates[0];validate_values(current);validate_values(prior)
    if current["profit"] is None:raise ValueError("Прибыль не раскрыта")
    return dict(registration_number=reg,current=current,prior=prior,source=url(reg),sha256=hashlib.sha256(raw).hexdigest())
def fetch(reg):
    u=url(reg)
    with urlopen(Request(u,headers={"User-Agent":"Mozilla/5.0"}),timeout=12) as r:
        a=urlsplit(r.geturl());b=urlsplit(u)
        if a.scheme!="https" or a.hostname not in ("cbr.ru","www.cbr.ru") or a.path!=b.path or parse_qs(a.query)!=parse_qs(b.query):raise ValueError("Другой отчёт")
        return parse(r.read(MAX+1),r.headers.get_content_charset() or "utf-8",reg)
def empty():return dict(schema=1,period=PERIOD,prior_period=PRIOR,note=NOTE,rows=[],attempts={},cohort=[],cohort_edition=None,checked=None)
def quality(d):
    if d.get("schema")!=1 or d.get("period")!=PERIOD or d.get("prior_period")!=PRIOR or d.get("note")!=NOTE:raise ValueError("Паспорт прибыли")
    seen=set()
    for r in d["rows"]:
        reg=r["registration_number"]
        if reg in seen or r["source"]!=url(reg) or not re.fullmatch(r"[a-f0-9]{64}",r["sha256"]):raise ValueError("Источник")
        validate_values(r["current"]);validate_values(r["prior"])
        if r["current"]["profit"] is None:raise ValueError("Не раскрыта прибыль")
        seen.add(reg)
    cohort=d["cohort"]
    if len(cohort)>5000 or len(set(cohort))!=len(cohort):raise ValueError("Охват")
    for reg in cohort:url(reg)
    if d["cohort_edition"]:date.fromisoformat(d["cohort_edition"])
    if d["checked"]:date.fromisoformat(d["checked"][:10])
    for reg,a in d["attempts"].items():
        url(reg);date.fromisoformat(a["checked"][:10])
        if a["error"] is not None and not isinstance(a["error"],str):raise ValueError("Протокол")
    return {"bank_profit_records":len(seen),"bank_profit_observations":sum(v is not None for r in d["rows"] for v in r["current"].values())}
def publish(out,previous,stamp,refresh,directory,fetcher=fetch):
    d=empty()
    try:
        old=json.loads((previous/FILE).read_text());quality(old);d=old
    except (OSError,ValueError,KeyError,TypeError):pass
    system={r["registration_number"] for r in directory["datasets"]["system"]["rows"]}
    cohort=target_cohort(directory)
    d.update(cohort=cohort,cohort_edition=directory["datasets"]["full"]["edition"])
    if refresh and (not d["checked"] or d["checked"][:10]!=stamp[:10]):
        by={r["registration_number"]:r for r in d["rows"]};today=date.fromisoformat(stamp[:10]);a=d["attempts"]
        candidates=set(cohort)|system
        todo=sorted((r for r in candidates if r not in by and (r not in a or today>=date.fromisoformat(a[r]["checked"][:10])+timedelta(days=14))),key=lambda r:(r not in system,r in a,a.get(r,{}).get("checked",""),int(r)))[:20]
        def one(reg):
            try:
                row=fetcher(reg)
                if row["registration_number"]!=reg or row["source"]!=url(reg):raise ValueError("Другой банк")
                validate_values(row["current"]);validate_values(row["prior"]);return reg,row,None
            except Exception as e:return reg,None,str(e)[:180]
        with ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(one,todo))
        for reg,row,error in results:
            a[reg]=dict(checked=stamp,error=error)
            if row is not None:by[reg]=row
        d.update(rows=sorted(by.values(),key=lambda r:int(r["registration_number"])),checked=stamp)
        print("BANK_PROFIT_807",json.dumps({"attempted":len(todo),"verified":len(by),"target":len(cohort)},ensure_ascii=False),flush=True)
    quality(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8");return d
