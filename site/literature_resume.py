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
    db.commit()
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
