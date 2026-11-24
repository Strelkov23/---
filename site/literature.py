import json
import re
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from urllib.parse import urlencode, quote, urlsplit
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from concurrent.futures import ThreadPoolExecutor

JOURNALS={"0042-8736":"Вопросы экономики","2221-2264":"Журнал Новой экономической ассоциации","1813-8691":"Экономический журнал ВШЭ","2072-6414":"Экономика региона","2222-0372":"Вопросы инновационной экономики","2587-7666":"Вопросы теоретической экономики","2712-9306":"Информатизация в цифровой экономике","0235-2494":"Экономика сельскохозяйственных и перерабатывающих предприятий","2542-0593":"Экономика высокотехнологичных производств"}
REGISTRY = {
 "0042-8736": {
  "tags": [
   "РИНЦ",
   "ВАК",
   "ВАК К1",
   "Scopus",
   "Web of Science",
   "Белый список 1"
  ],
  "site": "https://www.vopreco.ru/",
  "sources": [
   "https://asnap.ru/journals/fa042126b549",
   "https://journalrank.rcsi.science/ru/record-sources/levels/21450/"
  ]
 },
 "2221-2264": {
  "tags": [
   "РИНЦ",
   "ВАК",
   "ВАК К1",
   "Scopus",
   "Web of Science",
   "EconLit",
   "RePEc",
   "Белый список 2"
  ],
  "site": "https://www.journal.econorus.org/",
  "sources": [
   "https://www.journal.econorus.org/",
   "https://asnap.ru/journals/f9723b4b9be3"
  ]
 },
 "1813-8691": {
  "tags": [
   "РИНЦ",
   "ВАК",
   "ВАК К1",
   "Scopus",
   "RSCI"
  ],
  "site": "https://ej.hse.ru/ru/about",
  "sources": [
   "https://ej.hse.ru/ru/about",
   "https://journals.rcsi.science/1813-8691/index/index/ru_RU",
   "https://asnap.ru/journals/419fb1566ee0"
  ],
  "note": "Источники расходятся по уровню Белого списка; уровень не присвоен."
 },
 "2072-6414": {
  "tags": [
   "РИНЦ",
   "ВАК",
   "ВАК К1",
   "Scopus",
   "Web of Science",
   "DOAJ",
   "Белый список 1"
  ],
  "site": "https://economyofregion.ru/indeksirovanie/",
  "sources": [
   "https://economyofregion.ru/indeksirovanie/",
   "https://conf.hse.ru/2026/journals",
   "https://asnap.ru/journals/0a0c697b5914"
  ]
 },
 "2222-0372": {
  "tags": [
   "РИНЦ",
   "ВАК",
   "ВАК К2",
   "Белый список 2"
  ],
  "site": "https://1economic.ru/journals/vinec/archive",
  "sources": [
   "https://1economic.ru/journals/vinec",
   "https://journalrank.rcsi.science/ru/record-sources/details/31581/"
  ]
 },
 "2587-7666": {
  "tags": [
   "РИНЦ",
   "ВАК",
   "ВАК К1",
   "RSCI"
  ],
  "site": "https://questionset.ru/",
  "sources": [
   "https://questionset.ru/",
   "https://journals.rcsi.science/2587-7666/index/index/ru_RU"
  ]
 },

 "2712-9306": {
  "tags": [
   "РИНЦ",
   "ВАК",
   "ВАК К3"
  ],
  "site": "https://1economic.ru/journals/ide",
  "sources": [
   "https://1economic.ru/journals/ide"
  ]
 },
 "0235-2494": {
  "tags": [
   "РИНЦ",
   "ВАК",
   "ВАК К1",
   "RSCI",
   "Белый список 2"
  ],
  "site": "https://1economic.ru/journals/espp",
  "sources": [
   "https://1economic.ru/journals/espp"
  ]
 },
 "2542-0593": {
  "tags": [
   "РИНЦ",
   "ВАК"
  ],
  "site": "https://1economic.ru/journals/evp",
  "sources": [
   "https://1economic.ru/journals/evp"
  ]
 }
}

JOURNALS.update({"1994-5124":"Экономическая политика","0868-6351":"Проблемы прогнозирования","1815-9834":"Пространственная экономика","2949-320X":"Пространственная и региональная экономика"})
REGISTRY.update({
 "1994-5124":{"tags":["РИНЦ","ВАК","Scopus","Web of Science","Белый список 1"],"site":"https://journalrank.rcsi.science/ru/record-sources/details/5902/","sources":["https://journalrank.rcsi.science/ru/record-sources/details/5902/","https://journalrank.rcsi.science/ru/record-sources/levels/5902/","https://asnap.ru/journals/ab62935bb8e0"],"white_history":{"2023":2,"2025":1},"note":"Категория ВАК К1–К3 не присваивается без отдельного подтверждения."},
 "0868-6351":{"tags":["РИНЦ","ВАК","ВАК К1","Белый список 1"],"site":"https://ecfor.ru/nauchnye-izdaniya/problemy-prognozirovaniya/o-zhurnale/","sources":["https://ecfor.ru/nauchnye-izdaniya/problemy-prognozirovaniya/o-zhurnale/","https://journalrank.rcsi.science/ru/record-sources/levels/29867/","https://asnap.ru/journals/b21145eaa78d"],"white_history":{"2023":2,"2025":1},"note":"Русское издание не отождествляется с англоязычной переводной версией."},
 "1815-9834":{"tags":["РИНЦ","ВАК","ВАК К1","Scopus","DOAJ","Белый список 1"],"site":"https://journalrank.rcsi.science/ru/record-sources/details/28619/","sources":["https://journalrank.rcsi.science/ru/record-sources/details/28619/","https://journalrank.rcsi.science/ru/record-sources/levels/28619/","https://asnap.ru/journals/6d42a078ef7a"],"white_history":{"2023":1,"2025":1}},
 "2949-320X":{"tags":["РИНЦ"],"site":"https://1economic.ru/journals/pre","sources":["https://1economic.ru/journals/pre","https://1economic.ru/journals/pre/publication"],"note":"Другие категории не подтверждены."}
})

def registry():
    return {JOURNALS[issn]:dict(meta,issn=issn,verified='2026-11-24') for issn,meta in REGISTRY.items()}

TOPICS={
 "Макроэкономика и рост":"макроэконом|macroeconom|экономическ.{1,4} рост|economic growth|gross domestic|inflation|инфляц",
 "Деньги и финансы":"банк|bank|кредит|credit|monetary|денежн|финанс|financ",
 "Труд и доходы":"занятост|employment|безработ|labou?r|труда|заработ|wage|неравенств|inequality",
 "Инвестиции и инновации":"инвестиц|invest|инновац|innovat|технолог|technolog",
 "Промышленность и АПК":"промышлен|industr|manufactur|аграр|agricultur|сельск.{1,5} хозяйств",
 "Регионы и пространство":"регион|region|пространствен|spatial|municipal|муницип",
 "Стратегическое планирование":"планирован|planning|прогноз|forecast|межотрасл|input.output",
 "Энергетика":"энергет|energy|электроэнерг|electricity|нефт|oil|газов",
 "АПК и продовольствие":"аграр|agricultur|сельск|продовольств|food|фермер",
 "Транспорт и логистика":"транспорт|transport|логист|logistic|перевоз",
 "Цифровая экономика":"цифров|digital|искусственн.{1,5} интеллект|artificial intelligence|автоматизац",
 "Экономическая теория и история":"политэконом|political economy|экономическ.{1,5} теори|economic theory|экономическ.{1,5} истори|economic history",
 "Государство и институты":"государств|public policy|институт|institution|налог|tax|бюджет|budget",
 "Международная экономика":"торговл|trade|импорт|import|экспорт|export|международ|international",
 "Модели и методы":"модел|model|econometric|эконометр|input.output|затраты.{1,3}выпуск",
}

def tidy(text):
    return ' '.join(unescape(re.sub('<[^>]*>',' ',text)).split())

def metadata(item):
    def string(key):
        v=item.get(key)
        return tidy(v) if isinstance(v,str) else ""
    count=item.get("is-referenced-by-count")
    return dict(volume=string("volume"),issue=string("issue"),pages=string("page"),article_number=string("article-number"),language=string("language"),cited_by=count if type(count) is int and count>=0 else None)

class CrossrefRateLimited(Exception):
    def __init__(self,retry_after=None):
        super().__init__("Crossref HTTP 429")
        self.retry_after=retry_after

def stamp_dt(stamp):
    d=datetime.fromisoformat(stamp)
    return d.astimezone(timezone.utc) if d.tzinfo else d.replace(tzinfo=timezone.utc)

def retry_deadline(stamp,header):
    now=stamp_dt(stamp)
    fallback=now+timedelta(hours=1)
    if header is None:return fallback.isoformat(timespec="seconds")
    value=str(header).strip()
    try:
        if value.isdigit():
            # A minimum one-minute cooldown avoids immediate retries on Retry-After: 0.
            return (now+timedelta(seconds=max(60,int(value)))).isoformat(timespec="seconds")
        d=parsedate_to_datetime(value)
        if d.tzinfo is None:d=d.replace(tzinfo=timezone.utc)
        return max(now+timedelta(seconds=60),d.astimezone(timezone.utc)).isoformat(timespec="seconds")
    except (ValueError,TypeError,OverflowError):return fallback.isoformat(timespec="seconds")

def service_status(db,stamp):
    db.execute("create table if not exists literature_service(id integer primary key check(id=1),limited_at text,retry_at text)")
    old=db.execute("select limited_at,retry_at from literature_service where id=1").fetchone()
    if not old:return dict(cooldown=False,limited_at=None,retry_at=None)
    return dict(cooldown=stamp_dt(old[1])>stamp_dt(stamp),limited_at=old[0],retry_at=old[1])

def defer_journal(db,issn,deadline):
    # Do not claim a network check occurred. Preserve the last successful and actual check dates.
    db.execute("insert into journal_checks values(?,null,null,?) on conflict(issn) do update set status=excluded.status",
        (issn,"Отложено: Crossref HTTP 429, до "+deadline))

SELECT_FIELDS="DOI,title,author,published,volume,issue,page,is-referenced-by-count"
def fetch_batch(issn,filters,offset=0,select=False):
    # A bounded, ordinary /works query avoids cursor restrictions introduced in 2026.
    params=dict(filter=",".join(["issn:"+issn,*filters]),rows=1000,offset=offset)
    if select:params["select"]=SELECT_FIELDS
    url=f"https://api.crossref.org/works?{urlencode(params)}"
    try:
        with urlopen(Request(url,headers={"User-Agent":"EconomicsMonitor/1.0 (https://strelkov23.github.io/---/)"}),timeout=40) as resp:
            data=json.load(resp)["message"]
    except HTTPError as err:
        if err.code==429:
            raise CrossrefRateLimited(err.headers.get('Retry-After') if err.headers is not None else None) from err
        if err.code==400:
            try:detail=err.read(700).decode("utf-8","replace")
            except Exception:detail=""
            raise ValueError("Crossref HTTP 400: "+detail[:350]) from err
        raise
    if not isinstance(data.get("items"),list):raise ValueError("Invalid Crossref response")
    return data

def windows(start,end,days):
    while start<=end:
        finish=min(start+timedelta(days=days-1),end)
        yield start,finish
        start=finish+timedelta(days=1)

def period_items(issn,filters,date_key,start,end):
    # Split dense intervals before using offsets; no silent truncation at 1000 records.
    interval=filters+["from-"+date_key+":"+str(start),"until-"+date_key+":"+str(end)]
    batch=fetch_batch(issn,interval)
    total=batch.get("total-results")
    if type(total) is not int or total<0:raise ValueError("Crossref total-results missing")
    items=batch["items"]
    if total>1000 and start<end:
        mid=start+(end-start)//2
        yield from period_items(issn,filters,date_key,start,mid)
        yield from period_items(issn,filters,date_key,mid+timedelta(days=1),end)
        return
    if total>10000:raise ValueError("Crossref: more than 10000 works in a single day")
    seen=set();offset=0
    while True:
        if batch.get("total-results")!=total:raise ValueError("Crossref: result count changed during pagination")
        for item in items:
            doi=str(item.get("DOI") or "").lower()
            if not doi or doi in seen:raise ValueError("Crossref: duplicate or missing DOI during pagination")
            seen.add(doi)
        yield items
        offset+=len(items)
        if offset>=total:break
        if not items:raise ValueError("Crossref: incomplete page")
        batch=fetch_batch(issn,interval,offset)
        items=batch["items"]
    if len(seen)!=total:raise ValueError("Crossref: incomplete result set")

def sync(db, stamp, refresh):
    db.execute("create table if not exists literature(doi text primary key,journal text,published text,title text,authors text,topics text)")
    db.execute("create table if not exists journal_checks(issn text primary key,success text,checked text,status text)")
    db.execute("create table if not exists literature_meta(doi text primary key,payload text,checked text)")
    db.execute("create table if not exists literature_meta_checks(issn text primary key,success text)")
    service=service_status(db,stamp)
    if not refresh:return
    if service["cooldown"]:
        with db:
            for issn in JOURNALS:defer_journal(db,issn,service["retry_at"])
        return
    # Least recently contacted first: after a rate limit, uncontacted journals get priority.
    checked={r[0]:r[1] or "" for r in db.execute("select issn,checked from journal_checks")}
    ordered=sorted(JOURNALS,key=lambda issn:checked.get(issn,""))
    # Backfill one previously imported journal per refresh; existing DOI records are not erased.
    backfill=next((issn for issn in JOURNALS if db.execute("select success from journal_checks where issn=? and success is not null",(issn,)).fetchone() and not db.execute("select 1 from literature_meta_checks where issn=?",(issn,)).fetchone()),None) if refresh else None
    for position,issn in enumerate(ordered):
        journal=JOURNALS[issn]
        last=db.execute("select success from journal_checks where issn=?",(issn,)).fetchone()
        full=not(last and last[0]) or issn==backfill
        today=date.fromisoformat(stamp[:10])
        # Include forthcoming records within the current calendar year in a full backfill.
        filters=['type:journal-article']
        key="pub-date" if full else "index-date"
        start=date(1991,1,1) if full else date.fromisoformat(last[0][:10])-timedelta(days=2)
        finish=date(today.year,12,31) if full else today
        if not full:filters.append("from-pub-date:1991-01-01")
        try:
            for lo,hi in windows(start,finish,366*5 if full else 7):
              for items in period_items(issn,filters,key,lo,hi):
                entries=[]
                details=[]
                for item in items:
                    titles=item.get('title') or []
                    if not titles:continue
                    title=tidy(titles[0])
                    parts=item.get('published',{}).get('date-parts',[[]])[0]
                    if not parts or not title:continue
                    when='-'.join(f'{p:02d}' for p in parts)
                    authors=', '.join(' '.join(filter(None,[a.get('given'),a.get('family')])) or a.get('name','') for a in item.get('author',[]))
                    topics=' · '.join(k for k,pat in TOPICS.items() if re.search(pat,title,re.I)) or 'Прочие экономические исследования'
                    doi=(item.get('DOI') or '').strip().lower()
                    if not re.fullmatch(r'10\.\d{4,9}/\S+',doi):continue
                    entries.append((doi,journal,when,title,authors,topics))
                    details.append((doi,json.dumps(metadata(item),ensure_ascii=False),stamp))
                with db:
                    db.executemany("insert or replace into literature values(?,?,?,?,?,?)",entries)
                    db.executemany("insert or replace into literature_meta values(?,?,?)",details)
            with db:
                db.execute("insert or replace into journal_checks values(?,?,?,?)",(issn,stamp,stamp,'Проверено'))
                if full:db.execute("insert or replace into literature_meta_checks values(?,?)",(issn,stamp))
        except CrossrefRateLimited as err:
            deadline=retry_deadline(stamp,err.retry_after)
            with db:
                db.execute("insert or replace into literature_service values(1,?,?)",(stamp,deadline))
                db.execute("insert into journal_checks values(?,null,?,?) on conflict(issn) do update set checked=excluded.checked,status=excluded.status",
                    (issn,stamp,"Crossref HTTP 429; повтор не ранее "+deadline))
                for pending in ordered[position+1:]:defer_journal(db,pending,deadline)
            break
        except Exception as err:
            with db:db.execute("insert into journal_checks values(?,null,?,?) on conflict(issn) do update set checked=excluded.checked,status=excluded.status",(issn,stamp,str(err)[:180]))

def enrich(db, papers):
    lookup={r[0]:dict(json.loads(r[1]),metadata_checked=r[2]) for r in db.execute("select doi,payload,checked from literature_meta")}
    for paper in papers:
        paper.update(lookup.get(paper["doi"],{}))
    return papers

def reclassify(db):
    rows = db.execute("select doi,title,topics from literature").fetchall()
    updates=[]
    for doi,title,old in rows:
        new=' · '.join(k for k,pat in TOPICS.items() if re.search(pat,title or '',re.I)) or 'Прочие экономические исследования'
        if new!=old:updates.append((new,doi))
    with db:db.executemany("update literature set topics=? where doi=?",updates)

def doi_url(doi):
    return "https://doi.org/" + quote(doi, safe="/")

def check_link(doi):
    try:
        req=Request(doi_url(doi),headers={"User-Agent":"EconomicsMonitor/1.0","Accept":"text/html,application/pdf,*/*"})
        with urlopen(req,timeout=8) as resp:
            return (doi,"ok",resp.geturl(),str(resp.status))
    except HTTPError as e:
        final=e.geturl()
        status="missing" if e.code in (404,410) and urlsplit(final).hostname=="doi.org" else "restricted" if e.code in (401,403,429,451) else "error"
        return (doi,status,final,str(e.code))
    except Exception as e:
        return (doi,"error","",type(e).__name__)

def audit_links(db, stamp, refresh):
    db.execute("create table if not exists literature_links(doi text primary key,status text,final text,detail text,checked text)")
    if refresh:
        pending=[r[0] for r in db.execute("""select l.doi from literature l left join literature_links c on l.doi=c.doi
            order by (c.checked is not null),c.checked,l.published desc,l.doi limit 100""")]
        with ThreadPoolExecutor(max_workers=8) as pool:
            results=[(*r,stamp) for r in pool.map(check_link,pending)]
        with db:
            db.executemany("insert or replace into literature_links values(?,?,?,?,?)",results)
    return {r["doi"]:{k:r[k] for k in ("status","final","detail","checked")} for r in db.execute("select * from literature_links")}
