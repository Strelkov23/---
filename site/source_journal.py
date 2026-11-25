"""Bounded transport journal and versioned byte cache for approved sources.
Metadata is durable in monitor.db; raw bytes are opt-in and never automatically
published or committed. Successful transport is NOT successful interpretation.
"""
import hashlib,json,sqlite3,re
from pathlib import Path
from datetime import datetime,timezone
from html import escape
from urllib.parse import urlsplit
from contextlib import closing
from source_transport import url_allowed

FILE="source-journal.json"
MAX_RAW=24_000_000
MAX_EVENTS=2000
MAX_VERSIONS=500
HOSTS={"www.cbr.ru","cbr.ru","data.nalog.ru"}
NOTE="Журнал транспорта: успешная загрузка байтов не означает успешного разбора или проверки экономического содержания. История отпечатков сохраняется в базе. Исходные байты хранятся только в локальном кэше при явном разрешении; не публикуются автоматически."

def utc():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")

def setup(db):
    db.executescript("""
    create table if not exists transport_events(id integer primary key,url text not null,stamp text not null,status text not null,sha text,bytes integer,final_url text,error text);
    create table if not exists transport_versions(url text not null,sha text not null,bytes integer not null,first_seen text not null,last_seen text not null,final_url text not null,primary key(url,sha));
    """)

class Journal:
    def __init__(self,db_path,cache=None,approved=()):
        self.db_path=Path(db_path)
        self.cache=Path(cache) if cache else None
        self.approved=frozenset(approved)
        if self.cache and not self.approved:raise ValueError("Требуется явное разрешение хранения исходных байтов")
        with closing(sqlite3.connect(self.db_path,timeout=10)) as db:setup(db)
    def retain(self,payload):
        if not self.cache or urlsplit(payload.final_url).hostname not in self.approved:return
        if hashlib.sha256(payload.raw).hexdigest()!=payload.sha256:raise ValueError("Не совпал хеш кэша")
        self.cache.mkdir(parents=True,exist_ok=True)
        path=self.cache/payload.sha256
        if path.exists():
            if path.stat().st_size!=len(payload.raw) or hashlib.sha256(path.read_bytes()).hexdigest()!=payload.sha256:raise ValueError("Повреждение кэша")
            return
        total=sum(p.stat().st_size for p in self.cache.iterdir() if p.is_file())
        if total+len(payload.raw)>MAX_RAW:return
        import tempfile,os
        with tempfile.NamedTemporaryFile(dir=self.cache,delete=False) as f:
            name=f.name
            try:f.write(payload.raw);f.flush();os.fsync(f.fileno())
            except Exception:
                Path(name).unlink(missing_ok=True);raise
        try:Path(name).replace(path)
        finally:Path(name).unlink(missing_ok=True)
    def __call__(self,url,payload,error):
        event=event_tuple(url,payload,error)
        if event is not None:self.write([event])
        if payload is not None:self.retain(payload)
    def write(self,events):
        with closing(sqlite3.connect(self.db_path,timeout=10)) as db:
            with db:
                for url,stamp,status,sha,size,final,reason in events:
                    if status=="downloaded":
                        db.execute("insert into transport_versions values(?,?,?,?,?,?) on conflict(url,sha) do update set last_seen=excluded.last_seen,final_url=excluded.final_url",(url,sha,size,stamp,stamp,final))
                    db.execute("insert into transport_events(url,stamp,status,sha,bytes,final_url,error) values(?,?,?,?,?,?,?)",(url,stamp,status,sha,size,final,reason))
                db.execute("delete from transport_events where id not in (select id from transport_events order by id desc limit ?)",(MAX_EVENTS,))
                db.execute("delete from transport_versions where rowid not in (select rowid from transport_versions order by last_seen desc,rowid desc limit ?)",(MAX_VERSIONS,))

def event_tuple(url,payload,error):
    if not url_allowed(url,HOSTS):return None
    reason=type(error).__name__ if error is not None else None
    if error is not None and type(getattr(error,"code",None)) is int:reason+=" "+str(error.code)
    return (url,utc(),"downloaded" if payload is not None else "failed",payload.sha256 if payload is not None else None,len(payload.raw) if payload is not None else None,payload.final_url if payload is not None else None,reason)

class BufferedJournal:
    """Metadata only; defer database writes until importer transactions end."""
    def __init__(self,path):
        from collections import deque
        self.journal=Journal(path);self.events=deque(maxlen=MAX_EVENTS)
    def __call__(self,url,payload,error):
        event=event_tuple(url,payload,error)
        if event is not None:self.events.append(event)
    def flush(self):
        self.journal.write(self.events)
        self.events.clear()

def collect(db_path,stamp):
    with closing(sqlite3.connect(db_path,timeout=10)) as db:
        setup(db);db.row_factory=sqlite3.Row
        events=[dict(r) for r in db.execute("select url,stamp,status,sha,bytes,final_url,error from transport_events order by id desc")]
        versions=[dict(r) for r in db.execute("select * from transport_versions order by last_seen desc,url,sha")]
    return dict(schema=1,built=stamp,note=NOTE,events=events,versions=versions)

def quality(d):
    if set(d)!={"schema","built","note","events","versions"} or d["schema"]!=1 or d["note"]!=NOTE:raise ValueError("Схема журнала")
    if len(d["events"])>MAX_EVENTS or len(d["versions"])>MAX_VERSIONS:raise ValueError("Лимит журнала")
    keys=set()
    def valid_time(v):
        try:return datetime.fromisoformat(v).tzinfo is not None
        except (ValueError,TypeError):return False
    def valid_hash(v):return isinstance(v,str) and re.fullmatch(r"[0-9a-f]{64}",v)
    def valid_size(v):return type(v) is int and 0<v<=100_000_000
    for r in d["versions"]:
        if set(r)!={"url","sha","bytes","first_seen","last_seen","final_url"} or not url_allowed(r["url"],HOSTS) or not url_allowed(r["final_url"],HOSTS) or not valid_hash(r["sha"]) or not valid_size(r["bytes"]) or not valid_time(r["first_seen"]) or not valid_time(r["last_seen"]) or r["first_seen"]>r["last_seen"]:raise ValueError("Некорректная редакция источника")
        key=(r["url"],r["sha"])
        if key in keys:raise ValueError("Дубликат редакции")
        keys.add(key)
    for r in d["events"]:
        if set(r)!={"url","stamp","status","sha","bytes","final_url","error"} or not url_allowed(r["url"],HOSTS) or not valid_time(r["stamp"]):raise ValueError("Некорректное событие")
        if r["status"]=="downloaded":
            if not valid_hash(r["sha"]) or not valid_size(r["bytes"]) or not url_allowed(r["final_url"],HOSTS) or r["error"] is not None:raise ValueError("Некорректная загрузка")
        elif r["status"]=="failed":
            if any(r[k] is not None for k in ("sha","bytes","final_url")) or not isinstance(r["error"],str) or not r["error"]:raise ValueError("Некорректный отказ")
        else:raise ValueError("Статус события")
    return dict(transport_events=len(d["events"]),transport_versions=len(d["versions"]),transport_failed=sum(r["status"]=="failed" for r in d["events"]))

def publish(page,out,db_path,stamp):
    d=collect(db_path,stamp);counts=quality(d)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    e=lambda v:escape(str(v),quote=True)
    body='<section class="mast"><p class="kicker">Источники и качество</p><h1>Журнал загрузок и редакций</h1><p>'+e(NOTE)+'</p><p><a href="'+FILE+'">Полный журнал JSON</a> · <a href="normalized-data.html">Единый формат</a> · <a href="freshness.html">Актуальность данных</a></p></section><section><h2>История транспортных проверок</h2><div class="metrics">'
    for k,label in (("transport_events","Проверок в журнале"),("transport_versions","Редакций источников"),("transport_failed","Неудачных загрузок")):
        body+='<div class="metric"><b>'+str(counts[k])+'</b>'+e(label)+'</div>'
    body+='</div><p>До 2 000 событий и 500 версий. Пустой журнал означает, что новые загрузчики ещё не зафиксировали сетевые проверки.</p><div class="table-scroll"><table><thead><tr><th>Дата UTC</th><th>Источник</th><th>Результат</th><th>Размер, байт</th><th>SHA-256</th></tr></thead><tbody>'
    for r in d["events"][:50]:
        body+='<tr><td>'+e(r["stamp"])+'</td><td><a href="'+e(r["url"])+'">Открыть источник</a></td><td>'+e("Байты получены" if r["status"]=="downloaded" else r["error"])+'</td><td>'+e(r["bytes"] if r["bytes"] is not None else "—")+'</td><td><code>'+e(r["sha"] or "—")+'</code></td></tr>'
    body+='</tbody></table></div></section>'
    page("source-journal.html",body)
    return d
