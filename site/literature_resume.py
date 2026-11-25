"""Resumable Crossref intervals, bounded normal traffic; no rate-limit bypass."""
from datetime import date,timedelta
import time
LIMIT=12
SECONDS=90
class BudgetExhausted(Exception):pass
class Budget:
    def __init__(self,fetch,limit=LIMIT,seconds=SECONDS):
        self.fetch=fetch;self.limit=limit;self.seconds=seconds;self.calls=0;self.start=time.monotonic()
    def available(self):return self.calls<self.limit and time.monotonic()-self.start<self.seconds
    def __call__(self,*args,**kwargs):
        if not self.available():raise BudgetExhausted()
        self.calls+=1
        return self.fetch(*args,**kwargs)
def setup(db):
    db.execute("create table if not exists literature_progress(issn text primary key,full integer not null,start text not null,finish text not null,watermark text not null)")
    db.execute("create table if not exists literature_watermark(issn text primary key,stamp text not null)")
    db.execute("create table if not exists literature_window(issn text primary key,days integer not null check(days>=1))")
    db.commit()
def window_days(db,issn,full):
    row=db.execute("select days from literature_window where issn=?",(issn,)).fetchone()
    return min(row[0],366*5 if full else 7) if row else (366*5 if full else 7)
def shrink_window(db,issn,full):
    db.execute("insert or replace into literature_window values(?,?)",(issn,max(1,window_days(db,issn,full)//2)))
def clear_window(db,issn):
    db.execute("delete from literature_window where issn=?",(issn,))
def plan(db,issn,full,last,stamp):
    r=db.execute("select full,start,finish,watermark from literature_progress where issn=?",(issn,)).fetchone()
    if r:
        start,finish=date.fromisoformat(r[1]),date.fromisoformat(r[2])
        if start>finish or r[0] not in (0,1):raise ValueError("Некорректный курсор Crossref")
        return bool(r[0]),start,finish,r[3]
    today=date.fromisoformat(stamp[:10])
    prior=db.execute("select stamp from literature_watermark where issn=?",(issn,)).fetchone()
    watermark=prior[0] if prior else last
    start=date(1991,1,1) if full else max(date(1991,1,1),date.fromisoformat(watermark[:10])-timedelta(days=2))
    finish=date(today.year,12,31) if full else today
    if start>finish:raise ValueError("Некорректный период Crossref")
    with db:db.execute("insert into literature_progress values(?,?,?,?,?)",(issn,int(full),start.isoformat(),finish.isoformat(),stamp))
    return full,start,finish,stamp
def advance(db,issn,hi,finish,watermark):
    r=db.execute("select start,finish,watermark from literature_progress where issn=?",(issn,)).fetchone()
    if not r or r[1]!=finish.isoformat() or r[2]!=watermark or not date.fromisoformat(r[0])<=hi<=finish:raise ValueError("Курсор Crossref изменился")
    if hi==finish:
        db.execute("delete from literature_progress where issn=?",(issn,))
        db.execute("insert or replace into literature_watermark values(?,?)",(issn,watermark))
        return True
    db.execute("update literature_progress set start=? where issn=?",((hi+timedelta(days=1)).isoformat(),issn))
    return False

def passport(db,journals):
    progress={r[0]:r[1:] for r in db.execute("select issn,full,start,finish,watermark from literature_progress")}
    watermarks=dict(db.execute("select issn,stamp from literature_watermark"))
    rows=[]
    for issn,name in sorted(journals.items()):
        p=progress.get(issn)
        rows.append(dict(issn=issn,journal=name,mode=("history" if p[0] else "index") if p else None,next_start=p[1] if p else None,finish=p[2] if p else None,started=p[3] if p else None,watermark=watermarks.get(issn),window_days=window_days(db,issn,bool(p[0])) if p else None))
    result=dict(schema=1,request_limit=LIMIT,seconds_before_next_request=SECONDS,rows=rows)
    quality(result,{name:dict(issn=issn) for issn,name in journals.items()})
    return result
def quality(d,registry):
    from datetime import datetime
    if d.get("schema")!=1 or d.get("request_limit")!=LIMIT or d.get("seconds_before_next_request")!=SECONDS:raise ValueError("Паспорт очереди")
    rows=d["rows"]
    if len(rows)!=len(registry) or {r["journal"] for r in rows}!=set(registry):raise ValueError("Охват очереди")
    def timestamp(s):
        v=datetime.fromisoformat(s)
        if v.tzinfo is None:raise ValueError("Часовой пояс")
        return v
    for r in rows:
        if r["issn"]!=registry[r["journal"]]["issn"] or r["mode"] not in (None,"history","index"):raise ValueError("Журнал")
        if r["watermark"] is not None:timestamp(r["watermark"])
        if r["mode"] is None:
            if any(r[k] is not None for k in ("next_start","finish","started","window_days")):raise ValueError("Пустой курсор")
        else:
            lo,hi=date.fromisoformat(r["next_start"]),date.fromisoformat(r["finish"])
            timestamp(r["started"])
            if lo>hi or lo<date(1991,1,1) or type(r["window_days"]) is not int or not 1<=r["window_days"]<=(366*5 if r["mode"]=="history" else 7):raise ValueError("Период очереди")
    return dict(active=sum(r["mode"] is not None for r in rows),watermarks=sum(r["watermark"] is not None for r in rows))
