"""Monthly industrial production, Russia, corresponding month of previous year = 100."""
import re
import ssl
from pathlib import Path
from html import unescape
from urllib.request import Request, urlopen
from urllib.parse import urljoin, urlsplit

INDEX = "https://rosstat.gov.ru/folder/313"
SEED = [("2026-07",100.4,289138),("2026-08",99.4,290839),("2026-09",101.8,293145)]
BACKFILL = [("2026-03",102.3,"https://rosstat.gov.ru/storage/mediabank/58_22-04-2026.html"),("2026-04",101.9,"https://rosstat.gov.ru/storage/mediabank/75_27-05-2026.html"),("2026-06",100.6,"https://rosstat.gov.ru/storage/mediabank/110_22-07-2026.html")]
MONTHS = "январе феврале марте апреле мае июне июле августе сентябре октябре ноябре декабре".split()

def read(url):
    context = ssl.create_default_context()
    context.load_verify_locations(cafile=str(Path(__file__).with_name("rosstat-root.pem")))
    with urlopen(Request(url, headers={"User-Agent":"EconomicsMonitor/1.0"}),timeout=15,context=context) as response:
        return response.read(3000000).decode(response.headers.get_content_charset() or "utf-8",errors="replace")

def parse_months(body):
    # Both the old release formulation and the current month-to-month bulletin wording.
    month_names = "|".join(MONTHS)
    patterns=[
        rf"Индекс промышленного производства в ({month_names}) (\d{{4}})\s*(?:года|г\.?) по сравнению с аналогичным периодом (\d{{4}})\s*(?:года|г\.?) составил (\d+(?:[,.]\d+)?)\s*%",
        rf"в ({month_names}) (\d{{4}})\s*(?:года|г\.?)\s*по сравнению с \w+ (\d{{4}})\s*(?:года|г\.?)\s*[-–—]\s*(\d+(?:[,.]\d+)?)\s*%"
    ]
    out={}
    for pat in patterns:
        for month,year,prior,value in re.findall(pat,body,re.I):
            if int(year)==int(prior)+1 and 0<float(value.replace(",","."))<300:
                out[f"{year}-{MONTHS.index(month.lower())+1:02d}"]=float(value.replace(",","."))
    return out

def collect(db, stamp):
    db.execute("create table if not exists industry_month(period text,value real,url text,seen text,primary key(period,value,url))")
    db.executemany("insert or ignore into industry_month values(?,?,?,?)",
        [(p,v,INDEX+"/document/"+str(i),"2026-11-23T00:00:00+00:00") for p,v,i in SEED])
    db.executemany("insert or ignore into industry_month values(?,?,?,?)",
        [(p,v,u,"2026-11-24T00:00:00+00:00") for p,v,u in BACKFILL])
    found=0
    errors=[]
    urls=set()
    for listing_url in (INDEX,"https://rosstat.gov.ru/central-news","https://rosstat.gov.ru/enterprise_industrial"):
        try:
            listing=read(listing_url)
            for href,title in re.findall(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',listing,re.I|re.S):
                if not re.search(r'промышленн\w* производств',unescape(re.sub("<[^>]+>"," ",title)),re.I):continue
                url=urljoin(listing_url,unescape(href))
                p=urlsplit(url)
                if p.hostname not in ("rosstat.gov.ru","www.rosstat.gov.ru"):continue
                if re.search(r'/document/\d+/?$|/storage/mediabank/[^/]+\.html?$',p.path,re.I):urls.add(url)
        except Exception as err:errors.append(str(err)[:90])
    for url in sorted(urls)[:35]:
        try:
            body=" ".join(unescape(re.sub("<[^>]+>"," ",read(url))).split())
            # Restrict extraction to the aggregate introduction, not sub-industry tables.
            body=body[:10000]
            for period,value in parse_months(body).items():
                db.execute("insert or ignore into industry_month values(?,?,?,?)",(period,value,url,stamp))
                found+=1
        except Exception as err:errors.append(str(err)[:90])
    if found:return ""
    return "Месячный выпуск не распознан; сохранены прежние наблюдения"+(" · "+errors[0] if errors else "")
