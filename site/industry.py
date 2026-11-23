"""Monthly industrial production, Russia, corresponding month of previous year = 100."""
import re
import ssl
from pathlib import Path
from html import unescape
from urllib.request import Request, urlopen

INDEX = "https://rosstat.gov.ru/folder/313"
SEED = [("2026-07",100.4,289138),("2026-08",99.4,290839),("2026-09",101.8,293145)]
MONTHS = "январе феврале марте апреле мае июне июле августе сентябре октябре ноябре декабре".split()

def read(url):
    context = ssl.create_default_context()
    context.load_verify_locations(cafile=str(Path(__file__).with_name("rosstat-root.pem")))
    with urlopen(Request(url, headers={"User-Agent":"EconomicsMonitor/1.0"}),timeout=15,context=context) as response:
        return response.read(3000000).decode("utf-8")

def collect(db, stamp):
    db.execute("create table if not exists industry_month(period text,value real,url text,seen text,primary key(period,value,url))")
    db.executemany("insert or ignore into industry_month values(?,?,?,?)",
        [(p,v,INDEX+"/document/"+str(i),"2026-11-23T00:00:00+00:00") for p,v,i in SEED])
    try:
        listing=read(INDEX)
        found=0
        for href,title in re.findall(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',listing,re.I|re.S):
            if not re.search(r'промышленн\w* производств',unescape(re.sub("<[^>]+>"," ",title)),re.I):
                continue
            doc=re.search(r'/folder/313/document/(\d+)',href)
            if not doc:continue
            url=INDEX+"/document/"+doc[1]
            body=" ".join(unescape(re.sub("<[^>]+>"," ",read(url))).split())
            match=re.search(r"Индекс промышленного производства в (\w+) (\d{4}) года по сравнению с аналогичным периодом (\d{4}) года составил (\d+(?:[,.]\d+)?)\s*%",body,re.I)
            if match and match[1].lower() in MONTHS and int(match[2])==int(match[3])+1:
                period=f"{match[2]}-{MONTHS.index(match[1].lower())+1:02d}"
                db.execute("insert or ignore into industry_month values(?,?,?,?)",(period,float(match[4].replace(",",".")),url,stamp))
                found+=1
        if not found:raise ValueError("В ленте Росстата не распознан месячный выпуск")
        return ""
    except Exception as err:
        return str(err)[:160]
