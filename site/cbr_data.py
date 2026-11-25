"""Official Bank of Russia observations, separate from annual WDI series."""
import json
import re
from datetime import date, datetime, timedelta
from html import unescape
from urllib.parse import urlencode
from urllib.request import Request,urlopen
from xml.etree import ElementTree as ET

KEY_PAGE="https://www.cbr.ru/hd_base/KeyRate/"
FX_PAGE="https://www.cbr.ru/development/sxml/"
FX_URL="https://www.cbr.ru/scripts/XML_dynamic.asp"
def get(url):
    from source_transport import download
    return download(url,hosts={"www.cbr.ru","cbr.ru"},max_bytes=6_000_000,timeout=15,path_check=lambda p:p.lower() in ("/hd_base/keyrate/","/scripts/xml_dynamic.asp")).raw

def number(s):
    return float(s.replace("\u00a0","").replace(" ","").replace(",","."))

def key_rows(raw):
    text=raw.decode("utf-8",errors="replace")
    out={}
    for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>",text,re.I|re.S):
        cells=[" ".join(unescape(re.sub("<[^>]+>"," ",x)).split()) for x in re.findall(r"<td\b[^>]*>(.*?)</td>",row,re.I|re.S)]
        if len(cells)!=2 or not re.fullmatch(r"\d{2}\.\d{2}\.\d{4}",cells[0]):continue
        try:
            day=datetime.strptime(cells[0],"%d.%m.%Y").date().isoformat()
            val=number(cells[1])
            if 0<=val<=100:out[day]=val
        except ValueError:continue
    return out

def fx_rows(raw,code):
    root=ET.fromstring(raw)
    if root.tag!="ValCurs" or root.get("ID")!=code:raise ValueError("Некорректный ответ XML Банка России")
    out={}
    for r in root.findall("Record"):
        d=datetime.strptime(r.attrib["Date"],"%d.%m.%Y").date().isoformat()
        nominal=number(r.findtext("Nominal") or "")
        val=number(r.findtext("Value") or "")
        if nominal<=0 or val<=0:raise ValueError("Некорректный номинал или курс")
        out[d]=val/nominal
    return out

def publish(db,stamp,out,refresh):
    db.execute("create table if not exists cbr_observations(code text,day text,value real,seen text,primary key(code,day,seen))")
    db.execute("create table if not exists cbr_checks(code text primary key,checked text,success text,status text)")
    today=date.fromisoformat(stamp[:10]); start=today-timedelta(days=365*3)
    def ru(d):return d.strftime("%d.%m.%Y")
    specs=[
        ("KEY","Ключевая ставка","% годовых",KEY_PAGE,KEY_PAGE+"?"+urlencode({"UniDbQuery.Posted":"True","UniDbQuery.From":ru(start),"UniDbQuery.To":ru(today)}),key_rows),
        ("USD","Официальный курс доллара США","₽ за 1 USD",FX_PAGE,FX_URL+"?"+urlencode({"date_req1":start.strftime("%d/%m/%Y"),"date_req2":today.strftime("%d/%m/%Y"),"VAL_NM_RQ":"R01235"}),lambda raw:fx_rows(raw,"R01235")),
    ]
    result={}
    for code,title,unit,page,url,parse in specs:
        if refresh:
            try:
                values=parse(get(url))
                if not values or any(not start.isoformat()<=d<=today.isoformat() for d in values):raise ValueError("Нет данных или неожиданный период")
                old={r[0]:r[1] for r in db.execute("select day,value from (select day,value,row_number() over(partition by day order by seen desc) rn from cbr_observations where code=?) where rn=1",(code,))}
                with db:
                    db.executemany("insert or ignore into cbr_observations values(?,?,?,?)",[(code,d,v,stamp) for d,v in values.items() if old.get(d)!=v])
                    db.execute("insert or replace into cbr_checks values(?,?,?,?)",(code,stamp,stamp,"Получено: "+str(len(values))))
            except Exception as err:
                with db:db.execute("insert into cbr_checks values(?,?,null,?) on conflict(code) do update set checked=excluded.checked,status=excluded.status",(code,stamp,"Ошибка: "+str(err)[:180]))
        c=db.execute("select checked,success,status from cbr_checks where code=?",(code,)).fetchone()
        rows=[{"date":r[0],"value":r[1]} for r in db.execute("select day,value from (select day,value,row_number() over(partition by day order by seen desc) rn from cbr_observations where code=?) where rn=1 order by day",(code,))]
        result[code]={"title":title,"unit":unit,"source":page,"query":url,"checked":c[0] if c else None,"success":c[1] if c else None,"status":c[2] if c else "Ожидается загрузка","values":rows}
    (out/"cbr.json").write_text(json.dumps(result,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
