"""Archive annual World Bank observations, including later revisions."""
import json
from urllib.request import Request, urlopen
SERIES = {
    "NV.AGR.TOTL.ZS":"Сельское, лесное хозяйство и рыболовство",
    "NV.IND.TOTL.ZS":"Промышленность и строительство",
    "NV.IND.MANF.ZS":"Обрабатывающая промышленность",
    "NV.SRV.TOTL.ZS":"Услуги",
}
def refresh(db,stamp):
    from indicators import META
    for code in META:
        url=f"https://api.worldbank.org/v2/country/RUS/indicator/{code}?format=json&per_page=200"
        last=db.execute("select success from checks where url=?",(url,)).fetchone()
        if last and (last[0] or "")[:10]==stamp[:10]:
            continue
        try:
            with urlopen(Request(url,headers={"User-Agent":"EconomicsMonitor/1.0"}),timeout=12) as resp:
                rows=json.load(resp)[1]
            points=[(code,r["date"],float(r["value"]),stamp) for r in rows if r["value"] is not None]
            if not points: raise ValueError("Пустой ряд")
            with db:
                db.executemany("insert or ignore into annual values(?,?,?,?)",points)
                db.execute("insert or replace into checks values(?,?,?,?)",(url,stamp,stamp,"Получено наблюдений: "+str(len(points))))
        except Exception as err:
            with db:
                db.execute("insert into checks values(?,?,null,?) on conflict(url) do update set checked=excluded.checked,status=excluded.status",(url,stamp,"Ошибка: "+str(err)[:180]))
