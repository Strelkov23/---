"""Partner-reported US goods trade. Never label it total Russian trade."""
import json,re,math,calendar
from html.parser import HTMLParser
from datetime import date
from pathlib import Path
from source_transport import download
URL="https://www.census.gov/foreign-trade/balance/c4621.html"
MONTHS={name:i for i,name in enumerate(calendar.month_name) if i}
# Hand-transcribed published observations: US exports, US imports, million nominal USD.
SEED={
2024:[(30.2,244.0),(36.2,287.9),(44.9,426.9),(34.1,297.5),(47.6,438.5),(42.8,187.0),(45.8,295.7),(54.5,84.5),(53.1,168.1),(52.0,314.5),(49.4,137.4),(37.9,125.9)],
2025:[(35.2,196.0),(45.1,344.3),(46.2,523.2),(46.5,492.1),(48.8,539.5),(52.5,405.2),(52.5,338.7),(49.3,201.9),(55.4,158.5),(52.3,226.6),(51.6,190.4),(47.1,160.2)],
2026:[(41.3,212.9),(37.8,299.6),(58.3,366.2),(50.5,413.8),(46.8,299.6),(45.0,160.0),(66.4,204.0),(47.5,259.6),(57.2,196.0)]}
def seed():
    return [{"period":f"{yr}-{i:02}","us_exports":a,"us_imports":b} for yr,values in SEED.items() for i,(a,b) in enumerate(values,1)]
class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.rows=[];self.row=None;self.cell=None;self.depth=0;self.text=[]
    def handle_starttag(self,tag,attrs):
        if tag=="table":self.depth+=1
        elif self.depth==1 and tag=="tr":self.row=[]
        elif self.depth==1 and tag in ("td","th") and self.row is not None:self.cell=[]
    def handle_data(self,data):
        self.text.append(data)
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self,tag):
        if self.depth==1 and tag in ("td","th") and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()));self.cell=None
        elif self.depth==1 and tag=="tr" and self.row is not None:
            self.rows.append(self.row);self.row=None
        elif tag=="table":self.depth=max(0,self.depth-1)
def parse(raw,year_limit):
    p=Tables();p.feed(raw)
    text=" ".join(" ".join(p.text).split()).lower()
    if "trade in goods with russia" not in text or "millions of u.s. dollars" not in text or "not seasonally adjusted" not in text:raise ValueError("Country or unit not confirmed")
    results={}; header=False
    for row in p.rows:
        if [v.lower() for v in row]==["month","exports","imports","balance"]:
            header=True;continue
        if not header or not row:continue
        if row[0].startswith("TOTAL"):header=False;continue
        match=re.fullmatch(r"([A-Za-z]+) (\d{4})",row[0])
        if not match:continue
        month,yr=match.group(1),int(match.group(2))
        if month not in MONTHS or not 1992<=yr<=year_limit or len(row)!=4:raise ValueError("Unexpected monthly row")
        vals=[]
        for val in row[1:]:
            if not re.fullmatch(r"-?(?:\d+|\d{1,3}(?:,\d{3})+)\.\d",val):raise ValueError("Invalid numeric field")
            vals.append(float(val.replace(",","")))
        a,b,c=vals
        if a<0 or b<0 or abs(a-b-c)>0.151:raise ValueError("Trade identity mismatch")
        period=f"{yr}-{MONTHS[month]:02}"
        if period in results:raise ValueError("Duplicate month")
        results[period]={"period":period,"us_exports":a,"us_imports":b}
    if len(results)<100 or min(results)[:4]!="1992":raise ValueError("Historical coverage incomplete")
    return [results[k] for k in sorted(results)]
def validate(rows):
    if not rows or len({r["period"] for r in rows})!=len(rows):raise ValueError("Empty or duplicate data")
    for r in rows:
        if not re.fullmatch(r"(?:19[9][2-9]|20\d\d)-(?:0[1-9]|1[0-2])",r["period"]):raise ValueError("Invalid period")
        if any(type(r[k]) not in (int,float) or not math.isfinite(r[k]) or r[k]<0 for k in ("us_exports","us_imports")):raise ValueError("Invalid trade value")
def revisions(old,new):
    previous={r["period"]:r for r in old}
    result=[]
    for r in new:
        before=previous.get(r["period"])
        if before is None:continue
        for k in ("us_exports","us_imports"):
            if r[k]!=before[k]:
                result.append({"period":r["period"],"metric":k,"before":before[k],"after":r[k],"delta":round(r[k]-before[k],8)})
    return result
def publish(db,out,stamp,refresh,fetch=download):
    db.execute("create table if not exists iv_trade_cache (id integer primary key check(id=1), payload text not null, fetched text not null, sha text not null)")
    db.execute("create table if not exists iv_trade_revisions (seq integer primary key, observed text not null, period text not null, metric text not null, before real not null, after real not null, old_sha text, new_sha text not null)")
    db.execute("create table if not exists iv_trade_attempt (id integer primary key check(id=1), stamp text not null, error text, added integer not null, revised integer not null)")
    cache=db.execute("select payload,fetched,sha from iv_trade_cache where id=1").fetchone()
    rows=seed();fetched=None;sha=None;status="manual_seed";error=None
    if cache:
        rows=json.loads(cache[0]);validate(rows);fetched=cache[1];sha=cache[2];status="cached"
    attempt=db.execute("select stamp,error,added,revised from iv_trade_attempt where id=1").fetchone()
    if not refresh and attempt and attempt[1]:
        error=attempt[1];status="cached_after_error" if cache else "seed_after_error"
    if refresh:
        try:
            response=fetch(URL,hosts={"www.census.gov"},max_bytes=5_000_000,timeout=25,path_check=lambda p:p=="/foreign-trade/balance/c4621.html")
            new=parse(response.raw.decode(response.charset),int(stamp[:4]));validate(new)
            if not {r["period"] for r in rows}<={r["period"] for r in new}:raise ValueError("Source lost previously published periods")
            if any(r["period"]>stamp[:7] for r in new):raise ValueError("Future observation")
            changes=revisions(rows,new);added=len(new)-len(rows)
            db.execute('SAVEPOINT iv_trade_update')
            try:
                db.executemany("insert into iv_trade_revisions(observed,period,metric,before,after,old_sha,new_sha) values(?,?,?,?,?,?,?)",[(stamp,r["period"],r["metric"],r["before"],r["after"],sha,response.sha256) for r in changes])
                db.execute("insert or replace into iv_trade_cache values(1,?,?,?)",(json.dumps(new,allow_nan=False),stamp,response.sha256))
                db.execute("insert or replace into iv_trade_attempt values(1,?,?,?,?)",(stamp,None,added,len(changes)))
            except Exception:
                db.execute('ROLLBACK TO iv_trade_update');db.execute('RELEASE iv_trade_update');raise
            else:
                db.execute('RELEASE iv_trade_update')
            rows=new;fetched=stamp;sha=response.sha256;status="downloaded"
        except Exception as e:
            error=type(e).__name__+": "+str(e)[:240];status="cached_after_error" if cache else "seed_after_error"
            db.execute("insert or replace into iv_trade_attempt values(1,?,?,0,0)",(stamp,error))
    validate(rows)
    attempt=db.execute("select stamp,error,added,revised from iv_trade_attempt where id=1").fetchone()
    history=[dict(zip(("observed","period","metric","before","after","old_sha","new_sha"),r)) for r in db.execute("select observed,period,metric,before,after,old_sha,new_sha from iv_trade_revisions order by seq desc limit 1000")]
    total=db.execute("select count(*) from iv_trade_revisions").fetchone()[0]
    payload={"schema":"iv-trade-v1","publisher":"U.S. Census Bureau","source":URL,"scope":"Торговля товарами США с Россией; направление по классификации США","unit":"млн долл. США, текущие цены, без сезонной корректировки","origin":"partner_customs","status":status,"last_success":fetched,"source_sha256":sha,"error":error,"seed_verification":"pending","last_attempt":dict(zip(("stamp","error","added","revised"),attempt)) if attempt else None,"revision_count":total,"revisions":history,"rows":rows,"limitations":"Не вся внешняя торговля России; услуги не включены. Страна происхождения/назначения, правила оценки, посредники и сроки регистрации могут отличаться от российских данных. Изменение стоимости не равно изменению физического объёма."}
    (out/"independent-trade.json").write_text(json.dumps(payload,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    return payload
