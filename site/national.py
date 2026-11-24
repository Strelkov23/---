"""Russian primary-source monthly series: Bank of Russia official tables.
Only accept rows from tables with the expected column headers and period.
"""
import json, re, math
from datetime import datetime,date
from html import unescape
from urllib.parse import urlencode
from urllib.request import Request,urlopen
from collections import defaultdict
INFL="https://www.cbr.ru/hd_base/infl/"
RES="https://www.cbr.ru/hd_base/mrrf/mrrf_m/"
MONEY="https://www.cbr.ru/statistics/macro_itm/dkfs/monetary_agg/"
META={
 "CPI_YOY":("Инфляция потребительских цен","% г/г","Месяц; изменение цен к тому же месяцу прошлого года",INFL),
 "KEY_END":("Ключевая ставка на конец месяца","% годовых","Последний день месяца",INFL),
 "CPI_TARGET":("Цель по инфляции","%","Целевой показатель, не фактическая инфляция",INFL),
 "RES_TOTAL":("Международные резервы","млн долл. США","На начало месяца",RES),
 "RES_FX":("Валютные резервы","млн долл. США","На начало месяца",RES),
 "RES_CURRENCY":("Иностранная валюта в резервах","млн долл. США","На начало месяца",RES),
 "RES_SDR":("Счёт в СДР","млн долл. США","На начало месяца",RES),
 "RES_IMF":("Резервная позиция в МВФ","млн долл. США","На начало месяца",RES),
 "RES_GOLD":("Монетарное золото","млн долл. США","На начало месяца; стоимостная оценка",RES),
 "M0":("Денежный агрегат М0","трлн руб.","Наличные деньги в обращении; на начало месяца",MONEY),
 "M1":("Денежный агрегат М1","трлн руб.","М0 и переводные депозиты в рублях; на начало месяца",MONEY),
 "M2":("Денежный агрегат М2","трлн руб.","Денежная масса в национальном определении; на начало месяца",MONEY),
 "M2X":("Широкая денежная масса М2Х","трлн руб.","М2 и валютные депозиты и долговые бумаги; на начало месяца",MONEY)
}
def clean(s):
    return " ".join(unescape(re.sub(r"<[^>]+>"," ",s)).split())
def tables(raw):
    for t in re.findall(r"<table\b[^>]*>(.*?)</table>",raw,re.I|re.S):
        rows=[]
        for r in re.findall(r"<tr\b[^>]*>(.*?)</tr>",t,re.I|re.S):
            rows.append([clean(c) for c in re.findall(r"<t[dh]\b[^>]*>(.*?)</t[dh]>",r,re.I|re.S)])
        yield clean(t).lower(),rows
def num(s):
    s=s.replace(" ","").replace(",",".").replace("−","-").replace("–","-")
    if not re.fullmatch(r"-?\d+(?:\.\d+)?",s):raise ValueError("Не число")
    n=float(s)
    if not math.isfinite(n):raise ValueError("Не число")
    return n
def month(s,fmt):
    return datetime.strptime(s,fmt).strftime("%Y-%m")
def parse_infl(raw):
    result={}
    for text,rows in tables(raw):
        if not all(x in text for x in ("ключевая ставка","инфляция","цель по инфляции")):continue
        for r in rows:
            if len(r)!=4 or not re.fullmatch(r"\d{2}\.\d{4}",r[0]):continue
            try:
                p=month(r[0],"%m.%Y")
                vals=[num(x) for x in r[1:]]
                if not 0<=vals[0]<=100 or not -50<=vals[1]<=200 or not 0<=vals[2]<=100:continue
                for k,v in zip(("KEY_END","CPI_YOY","CPI_TARGET"),vals):result[(k,p)]=v
            except ValueError:continue
    return result
def parse_res(raw):
    result={}
    if "млн долл" not in clean(raw).lower():return result
    for text,rows in tables(raw):
        if not all(x in text for x in ("международные резервы","валютные резервы","монетарное золото","резервная позиция")):continue
        for r in rows:
            if len(r)!=7 or not re.fullmatch(r"01\.\d{2}\.\d{4}",r[0]):continue
            try:
                p=month(r[0],"%d.%m.%Y");v=[num(x) for x in r[1:]]
                if min(v)<0 or abs(v[0]-v[1]-v[5])>3 or abs(v[1]-sum(v[2:5]))>3:continue
                for k,n in zip(("RES_TOTAL","RES_FX","RES_CURRENCY","RES_SDR","RES_IMF","RES_GOLD"),v):result[(k,p)]=n
            except ValueError:continue
    return result
def parse_money(raw):
    result={}
    for text,rows in tables(raw):
        if not all(x in text for x in ("денежный агрегат","трлн руб","темп прироста")):continue
        # First column of numeric data is the level, not a growth rate.
        # The date in its header must be immediately followed by the unit.
        m=re.search(r"(01\.\d{2}\.\d{4})\s+трлн руб",text)
        if not m:continue
        p=month(m[1],"%d.%m.%Y")
        for r in rows:
            if len(r)!=8:continue
            label=" ".join(r[0].upper().split())
            # Normalise the code only; replacing every Cyrillic М breaks the word МАССА.
            match=re.fullmatch(r"(?:ДЕНЕЖНЫЙ АГРЕГАТ )?([МM][012][ХX]?)(?: \(ШИРОКАЯ ДЕНЕЖНАЯ МАССА\))?",label)
            if not match:continue
            try:
                v=num(r[1])
                if v>0:result[(match[1].replace("М","M").replace("Х","X"),p)]=v
            except ValueError:continue
        if result:break
    return result
def get(url):
    with urlopen(Request(url,headers={"User-Agent":"EconomicsMonitor/2.2"}),timeout=20) as r:
        raw=r.read(8_000_001)
        if len(raw)>8_000_000:raise ValueError("Превышен лимит")
        return raw.decode(r.headers.get_content_charset() or "utf-8",errors="replace")
def publish(db,stamp,out,refresh):
    db.execute("create table if not exists national_obs(code text,period text,value real,seen text,source text,primary key(code,period,seen))")
    db.execute("create table if not exists national_checks(code text primary key,checked text,success text,status text)")
    today=date.fromisoformat(stamp[:10])
    queries=[
      (INFL+"?"+urlencode({"UniDbQuery.From":"17.09.2013","UniDbQuery.To":today.strftime("%d.%m.%Y"),"UniDbQuery.Posted":"True"}),parse_infl,("KEY_END","CPI_YOY","CPI_TARGET")),
      (RES+"?"+urlencode({"UniDbQuery.From":"01.1993","UniDbQuery.To":today.strftime("%m.%Y"),"UniDbQuery.Posted":"True"}),parse_res,("RES_TOTAL","RES_FX","RES_CURRENCY","RES_SDR","RES_IMF","RES_GOLD")),
      (MONEY,parse_money,("M0","M1","M2","M2X"))
    ]
    if refresh:
        for url,parser,codes in queries:
            try:
                vals=parser(get(url))
                if not vals:raise ValueError("Не распознана таблица")
                for code in codes:
                    rows={p:v for (k,p),v in vals.items() if k==code and p<=today.strftime("%Y-%m")}
                    if not rows:
                        with db:db.execute("insert into national_checks values(?,?,null,?) on conflict(code) do update set checked=excluded.checked,status=excluded.status",(code,stamp,"Ошибка: нет наблюдений"))
                        continue
                    old={r[0]:r[1] for r in db.execute("select period,value from (select period,value,row_number() over(partition by period order by seen desc) rn from national_obs where code=?) where rn=1",(code,))}
                    with db:
                        db.executemany("insert or ignore into national_obs values(?,?,?,?,?)",[(code,p,v,stamp,url) for p,v in rows.items() if old.get(p)!=v])
                        db.execute("insert or replace into national_checks values(?,?,?,?)",(code,stamp,stamp,"Получено: "+str(len(rows))))
            except Exception as err:
                with db:
                    for code in codes:db.execute("insert into national_checks values(?,?,null,?) on conflict(code) do update set checked=excluded.checked,status=excluded.status",(code,stamp,"Ошибка: "+str(err)[:150]))
    result={}
    for code,(title,unit,definition,source) in META.items():
        c=db.execute("select checked,success,status from national_checks where code=?",(code,)).fetchone()
        vals=[dict(period=r[0],value=r[1],seen=r[2],source=r[3]) for r in db.execute("select period,value,seen,source from (select *,row_number() over(partition by period order by seen desc) rn from national_obs where code=?) where rn=1 order by period",(code,))]
        result[code]=dict(title=title,unit=unit,definition=definition,source=source,checked=c[0] if c else None,success=c[1] if c else None,status=c[2] if c else "Ожидается загрузка",values=vals)
    (out/"national.json").write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    return [v["title"]+" · "+v["status"] for v in result.values() if v["status"].startswith("Ошибка")]
