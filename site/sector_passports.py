"""Sector research directory built from the exact published data, not invented observations.
Thematic profiles are not a new statistical classification and do not form a partition.
"""
import json
from urllib.parse import urlencode
from pathlib import Path

PROFILES=[
 ("agriculture","Сельское, лесное хозяйство и рыболовство","Сектор WDI включает лесное хозяйство и рыболовство. Индексы растениеводства и животноводства имеют собственную базу.",["NV.AGR.TOTL.KD.ZG","NV.AGR.TOTL.CD","NV.AGR.EMPL.KD","SL.AGR.EMPL.ZS","AG.LND.AGRI.ZS","AG.LND.ARBL.ZS","AG.YLD.CREL.KG","AG.PRD.CROP.XD","AG.PRD.LVSK.XD","AG.PRD.FOOD.XD","AG.CON.FERT.ZS","AG.CON.FERT.PT.ZS"],[],["Сельск","Лесн","Рыболов"],["https://rosstat.gov.ru/","https://mcx.gov.ru/"]),
 ("food","Пищевая промышленность","Классы 10–12 ОКВЭД2: пищевые продукты, напитки и табачные изделия; не равны всему АПК.",[],["10","11","12"],["Пищев"],["https://www.rosstat.gov.ru/enterprise_industrial"]),
 ("mining","Добыча полезных ископаемых","Раздел B ОКВЭД2; отдельные классы не следует складывать с разделом.",[],["B","05","06","07","08","09"],["Добыч"],["https://www.rosstat.gov.ru/enterprise_industrial"]),
 ("manufacturing","Обрабатывающая промышленность","Раздел C ОКВЭД2. Производительность промышленности WDI относится также к добыче, энергетике и строительству, поэтому здесь не используется.",["NV.IND.MANF.KD.ZG","NV.IND.MANF.CD"],["C","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33"],["Обрабатывающ","Машиностро"],["https://www.rosstat.gov.ru/enterprise_industrial"]),
 ("machinery","Машиностроение и электроника","Классы 26–30 ОКВЭД2. Патенты и высокотехнологичный экспорт всей экономики не являются показателями только этих отраслей.",[],["26","27","28","29","30"],["Машин","Электрон","Транспортн"],["https://www.rosstat.gov.ru/enterprise_industrial"]),
 ("energy","Энергетика","Раздел D ОКВЭД2 включает электроэнергию, газ, пар и кондиционирование. Доли выработки WDI относятся только к электрогенерации.",["EG.ELC.ACCS.ZS","EG.USE.ELEC.KH.PC","EG.USE.PCAP.KG.OE","EG.FEC.RNEW.ZS","EG.ELC.NUCL.ZS","EG.ELC.HYRO.ZS","EG.ELC.COAL.ZS","EG.ELC.NGAS.ZS"],["D","35"],["Электроэнерг","Энерг"],["https://www.rosstat.gov.ru/enterprise_industrial"]),
 ("utilities","Водоснабжение и отходы","Раздел E ОКВЭД2; обеспеченность водой населения и выпуск коммунальных организаций — разные понятия.",[],["E","36","37","38","39"],["Водоснаб","Отход"],["https://www.rosstat.gov.ru/enterprise_industrial"]),
 ("construction","Промышленность и строительство (широкий агрегат)","Агрегат WDI включает промышленность и строительство. Валовое накопление капитала относится ко всей экономике, не к строительству отдельно.",["NV.IND.TOTL.KD.ZG","NV.IND.EMPL.KD","SL.IND.EMPL.ZS"],[],["Строитель"],["https://rosstat.gov.ru/"]),
 ("transport","Транспорт","Железнодорожный и авиационный оборот измеряются отдельно. Пассажиры и пассажиро-километры не взаимозаменяемы.",["IS.RRS.GOOD.MT.K6","IS.RRS.PASG.KM","IS.AIR.PSGR","IS.AIR.GOOD.MT.K1"],[],["Транспорт","Складир"],["https://rosstat.gov.ru/","https://mintrans.gov.ru/"]),
 ("digital","Связь и цифровая инфраструктура","Подключения связи не равны числу уникальных пользователей. Показатели относятся к стране, а не к выручке отрасли.",["IT.NET.USER.ZS","IT.NET.BBND.P2","IT.CEL.SETS.P2"],[],["Связ","Информац"],["https://rosstat.gov.ru/"]),
 ("services","Сфера услуг (широкий агрегат)","Агрегат WDI не выделяет торговлю, образование или государственное управление отдельно.",["NV.SRV.TOTL.KD.ZG","NV.SRV.TOTL.CD","NV.SRV.EMPL.KD","SL.SRV.EMPL.ZS"],[],["Торгов","Услуг"],["https://rosstat.gov.ru/"]),
 ("finance","Финансы и денежная система","Макроэкономические денежные показатели не являются выручкой или рентабельностью финансового сектора.",["FM.LBL.BMNY.GD.ZS","FS.AST.PRVT.GD.ZS","FR.INR.LEND","FR.INR.DPST","FR.INR.RINR","FM.LBL.BMNY.ZG","FS.AST.DOMS.GD.ZS"],[],["Финансов"],["https://www.cbr.ru/statistics/"]),
 ("social","Образование и здравоохранение","Расходы в процентах ВВП и ресурсы здравоохранения на душу — показатели разных типов.",["SH.XPD.CHEX.GD.ZS","SE.XPD.TOTL.GD.ZS","SH.MED.PHYS.ZS","SH.MED.BEDS.ZS"],[],["Образован","Здравоохран"],["https://rosstat.gov.ru/"]),
 ("technology","Наука и технологии","Расходы на НИОКР, патенты и исследователи относятся к экономике в целом; не отражают исключительно государственное финансирование.",["GB.XPD.RSDV.GD.ZS","IP.PAT.RESD","IP.PAT.NRES","SP.POP.SCIE.RD.P6","TX.VAL.TECH.MF.ZS"],[],["Научн","Исследован"],["https://rosstat.gov.ru/"]),
]
def summary(values):
    pairs=sorted((str(k),v) for k,v in values.items() if v is not None)
    return dict(count=len(pairs),first=pairs[0][0] if pairs else None,last=pairs[-1][0] if pairs else None,value=pairs[-1][1] if pairs else None)
def query(page,**params):
    return page+"?"+urlencode(params)
def create(compare,catalog,industrial,national):
    result=[]
    for ident,title,note,codes,okved,terms,sources in PROFILES:
        rows=[]
        for code in codes:
            if code not in compare or code not in catalog:raise ValueError("Неизвестный код WDI "+code)
            s=compare[code];m=catalog[code]
            rows.append(dict(id=code,title=s["title"],unit=s["unit"],frequency="годовая",provider="Всемирный банк, WDI",source=m["source"],checked=m.get("success"),status=m.get("status"),href=query("compare.html",left=code,right=code),**summary(s["values"])))
        for s in industrial["series"]:
            if s["classification"]!="ОКВЭД2" or s["code"] not in okved:continue
            check=next((c for c in industrial["sources"] if c["url"]==s["source"]),{})
            rows.append(dict(id=s["id"],title=s["code"]+" · "+s["title"]+" · "+s["kind"],unit=s["unit"],frequency=s["frequency"],provider="Росстат",source=s["source"],checked=check.get("success"),status=check.get("status"),href=query("industrial.html",**{"ind-series":s["id"]}),**summary({r["period"]:r["value"] for r in s["values"]})))
        if ident=="finance":
            for code,s in national.items():
                rows.append(dict(id=code,title=s["title"],unit=s["unit"],frequency="месячная",provider="Банк России",source=s["source"],checked=s.get("success"),status=s.get("status"),href=query("national.html",**{"national-code":code}),**summary({r["period"]:r["value"] for r in s["values"]})))
        result.append(dict(id=ident,title=title,note=note,terms=terms,sources=sources,rows=rows))
    return result
def publish(out):
    def read(name):return json.loads((out/name).read_text(encoding="utf-8"))
    profiles=create(read("compare.json"),read("catalog.json"),read("industrial.json"),read("national.json"))
    (out/"sector-passports.json").write_text(json.dumps({"profiles":profiles},ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
