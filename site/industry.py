"""Collect national industrial production YoY indices, preserving revisions and source conflicts."""
import re
import ssl
from pathlib import Path
from html import unescape
from urllib.request import Request, urlopen
from urllib.parse import urljoin, urlsplit
from collections import defaultdict

INDEX = "https://rosstat.gov.ru/folder/313"
# Candidate release addresses, not pre-validated numeric observations.
RELEASES = [
    INDEX+"/document/278645", INDEX+"/document/289138",
    INDEX+"/document/290839", INDEX+"/document/293145",
    "https://rosstat.gov.ru/storage/mediabank/58_22-04-2026.html",
    "https://rosstat.gov.ru/storage/mediabank/75_27-05-2026.html",
    "https://rosstat.gov.ru/storage/mediabank/110_22-07-2026.html",
]
ALTERNATIVES = {
    "2026-07": (100.4,"https://www.rosstat.gov.ru/storage/mediabank/127_26-08-2026.html"),
    "2026-08": (99.4,"https://www.rosstat.gov.ru/storage/mediabank/146_23-09-2026.html"),
    "2026-09": (101.8,"https://www.rosstat.gov.ru/storage/mediabank/164_28-10-2026.html"),
}
RELEASES += [url for value,url in ALTERNATIVES.values()]
MONTHS = "январе феврале марте апреле мае июне июле августе сентябре октябре ноябре декабре".split()
PRIOR_MONTHS = "январем февралем мартом апрелем маем июнем июлем августом сентябрем октябрем ноябрем декабрем".split()

def read(url):
    context = ssl.create_default_context()
    cert=Path(__file__).with_name("rosstat-root.pem")
    if cert.exists():context.load_verify_locations(cafile=str(cert))
    with urlopen(Request(url, headers={"User-Agent":"EconomicsMonitor/2.1"}),timeout=15,context=context) as response:
        data=response.read(3_000_001)
        if len(data)>3_000_000:raise ValueError("Превышен лимит размера")
        return data.decode(response.headers.get_content_charset() or "utf-8",errors="replace")

def parse_months(body):
    # Require an explicit aggregate subject and the same month a year earlier.
    # Never infer a YoY number from the title of a source or a generic sentence.
    body=body.lower().replace("ё","е")
    names="|".join(MONTHS)
    prior="|".join(PRIOR_MONTHS)
    patterns=[
        rf"индекс промышленного производства\s+в ({names}) (\d{{4}})\s*(?:года|г\.?)\s+по сравнению с аналогичным периодом (\d{{4}})\s*(?:года|г\.?)\s+составил\s+(\d+(?:[,.]\d+)?)\s*%",
        rf"индекс промышленного производства[^.;]{{0,100}}?\bв ({names}) (\d{{4}})\s*(?:года|г\.?)\s+по сравнению с ({prior}) (\d{{4}})\s*(?:года|г\.?)\s*(?:[-–—]|составил)\s*(\d+(?:[,.]\d+)?)\s*%"
    ]
    values=defaultdict(set)
    for month,year,prev,val in re.findall(patterns[0],body):
        if int(year)==int(prev)+1 and 0<float(val.replace(",","."))<300:
            values[f"{year}-{MONTHS.index(month)+1:02d}"].add(float(val.replace(",",".")))
    for month,year,pm,prev,val in re.findall(patterns[1],body):
        if MONTHS.index(month)==PRIOR_MONTHS.index(pm) and int(year)==int(prev)+1 and 0<float(val.replace(",","."))<300:
            values[f"{year}-{MONTHS.index(month)+1:02d}"].add(float(val.replace(",",".")))
    # Official bulletin format: an aggregate heading followed by a list.
    # The list must begin with the explicit national index heading; limit to its first paragraph/list.
    heading=re.search(r"индекс промышленного производства\s*(?:\*|\d+)?\s*(?:составил|составил:|:)",body)
    if heading:
        block=body[heading.end():heading.end()+650]
        block=re.split(r"индексы промышленного производства|добыча полезных ископаемых|обрабатывающие производства|производство основных",block,maxsplit=1)[0]
        for month,yr,pm,prev,val in re.findall(rf"в ({names}) (\d{{4}})\s*(?:года|г\.?)\s*по сравнению с ({prior}) (\d{{4}})\s*(?:года|г\.?)\s*[-–—]\s*(\d+(?:[,.]\d+)?)\s*%",block):
            if MONTHS.index(month)==PRIOR_MONTHS.index(pm) and int(yr)==int(prev)+1 and 0<float(val.replace(",","."))<300:
                values[f"{yr}-{MONTHS.index(month)+1:02d}"].add(float(val.replace(",",".")))
    return {p:next(iter(v)) for p,v in values.items() if len(v)==1}

def collect(db, stamp):
    db.execute("create table if not exists industry_month(period text,value real,url text,seen text,primary key(period,value,url))")
    db.execute("create table if not exists industry_verified(period text,value real,url text,checked text,primary key(period,value,url))")
    errors=[]; urls=set(RELEASES)
    for listing_url in (INDEX,"https://rosstat.gov.ru/enterprise_industrial","https://www.rosstat.gov.ru/enterprise_industrial","https://rosstat.gov.ru/folder/23458","https://rosstat.gov.ru/compendium/document/50798"):
        try:
            listing=read(listing_url)
            for href,title in re.findall(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',listing,re.I|re.S):
                if not re.search(r'промышленн\w* производств',unescape(re.sub("<[^>]+>"," ",title)),re.I):continue
                url=urljoin(listing_url,unescape(href));p=urlsplit(url)
                if p.scheme!="https" or p.hostname not in ("rosstat.gov.ru","www.rosstat.gov.ru"):continue
                if re.search(r'/document/\d+/?$|/storage/mediabank/[^/]+\.html?$',p.path,re.I):urls.add(url)
        except Exception as err:errors.append(str(err)[:90])
    candidates=defaultdict(dict)
    ordered=list(dict.fromkeys([url for _,url in ALTERNATIVES.values()]+RELEASES+sorted(urls-set(RELEASES),reverse=True)[:15]))
    for url in ordered:
        try:
            body=" ".join(unescape(re.sub("<[^>]+>"," ",read(url))).split())[:15000]
            for period,value in parse_months(body).items():
                candidates[period][url]=value
        except Exception as err:errors.append(str(err)[:90])
    conflicts=[]; accepted=0
    for period,items in sorted(candidates.items()):
        if len(set(items.values()))!=1:
            conflicts.append(period);continue
        for url,value in items.items():
            db.execute("insert or ignore into industry_month values(?,?,?,?)",(period,value,url,stamp))
            db.execute("insert or replace into industry_verified values(?,?,?,?)",(period,value,url,stamp))
            accepted+=1
    problems=[]
    if not accepted:problems.append("Месячный выпуск не подтверждён при текущем обновлении")
    if conflicts:problems.append("Конфликт значений: "+", ".join(conflicts))
    if errors:problems.append("Недоступных страниц: "+str(len(errors))+"; "+errors[0])
    return "; ".join(problems)
