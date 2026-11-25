"""Import-stage diagnostics, separate from transport and publication.
Metadata-only quarantine records identify failed candidate batches; the
existing source-specific archives remain authoritative. No rejected raw bytes
are published. Accepted = validated parser output or committed batch, as labeled.
"""
import json,sqlite3,re
from collections import deque
from contextlib import closing
from datetime import datetime,timezone
from html import escape
from source_registry import identify,passports,SOURCES

FILE="source-pipeline.json"
LIMIT=1000
NOTE="Карантин фиксирует отклонённую попытку разбора или проверки, а не число отбракованных строк. Архивы сохраняются специализированными загрузчиками. Успешный разбор не равен успешной публикации; проверенные пакеты и записанные в базу различаются."

def setup(db):
    db.execute("""create table if not exists import_diagnostics(
        id integer primary key,source text not null,url text not null,stamp text not null,
        scope text not null,stage text not null,result text not null,count integer,reason text)""")
    db.commit()

class Buffer:
    def __init__(self,db_path):
        self.path=db_path;self.events=deque(maxlen=LIMIT)
        with closing(sqlite3.connect(db_path,timeout=10)) as db:setup(db)
    def record(self,url,scope,stage,count=None,error=None):
        source=identify(url)
        if stage not in ("parse","commit") or not isinstance(scope,str) or not 0<len(scope)<=80:raise ValueError("Неизвестный этап импорта")
        if error is None and (type(count) is not int or count<=0):raise ValueError("Пустой пакет")
        if error is not None and count is not None:raise ValueError("Отклонённый пакет не имеет подтверждённого числа")
        self.events.append((source.id,url,datetime.now(timezone.utc).isoformat(timespec="microseconds"),scope,stage,"rejected" if error else "accepted",count,type(error).__name__ if error else None))
    def flush(self):
        with closing(sqlite3.connect(self.path,timeout=10)) as db:
            with db:
                db.executemany("insert into import_diagnostics(source,url,stamp,scope,stage,result,count,reason) values(?,?,?,?,?,?,?,?)",self.events)
                db.execute("delete from import_diagnostics where id not in (select id from import_diagnostics order by id desc limit ?)",(LIMIT,))
        self.events.clear()

_active=None
def configure(buffer):
    global _active
    _active=buffer

def record(url,scope,stage,count=None,error=None):
    if _active is not None:_active.record(url,scope,stage,count,error)

def parsed(url,scope,action):
    try:
        data=action()
        if not data:raise ValueError("Пустой результат разбора")
    except Exception as error:
        record(url,scope,"parse",error=error)
        raise
    record(url,scope,"parse",len(data))
    return data

def collect(path,stamp):
    with closing(sqlite3.connect(path,timeout=10)) as db:
        setup(db);db.row_factory=sqlite3.Row
        events=[dict(r) for r in db.execute("select source,url,stamp,scope,stage,result,count,reason from import_diagnostics order by id desc")]
    return dict(schema=1,built=stamp,note=NOTE,sources=passports(),events=events)

def quality(data):
    if set(data)!={"schema","built","note","sources","events"} or data["schema"]!=1 or data["note"]!=NOTE or data["sources"]!=passports() or len(data["events"])>LIMIT:raise ValueError("Схема реестра импорта")
    for e in data["events"]:
        if set(e)!={"source","url","stamp","scope","stage","result","count","reason"} or identify(e["url"]).id!=e["source"] or e["stage"] not in ("parse","commit") or not isinstance(e["scope"],str) or not 0<len(e["scope"])<=80:raise ValueError("Неверное событие импорта")
        if datetime.fromisoformat(e["stamp"]).tzinfo is None:raise ValueError("Дата события без часового пояса")
        if e["result"]=="accepted":
            if type(e["count"]) is not int or e["count"]<=0 or e["reason"] is not None:raise ValueError("Неверный принятый пакет")
        elif e["result"]=="rejected":
            if e["count"] is not None or not isinstance(e["reason"],str) or not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*",e["reason"]):raise ValueError("Неверный карантин")
        else:raise ValueError("Статус импорта")
    return dict(pipeline_sources=len(data["sources"]),pipeline_events=len(data["events"]),pipeline_rejected=sum(e["result"]=="rejected" for e in data["events"]))

def publish(page,out,path,stamp):
    data=collect(path,stamp);quality(data)
    (out/FILE).write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
    e=lambda v:escape(str(v),quote=True)
    rows="".join("<tr><td>"+e(s["title"])+"</td><td>"+e(s["format"])+"</td><td>"+e(s["adapter"])+"</td><td>"+e(s["schedule"])+"</td><td>"+e(s["max_bytes"])+"</td></tr>" for s in data["sources"])
    results="".join("<tr><td>"+e(r["stamp"])+"</td><td>"+e(SOURCES[r["source"]].title)+" · "+e(r["scope"])+"</td><td>"+e("Разбор" if r["stage"]=="parse" else "Запись в базу")+"</td><td>"+e("Принято" if r["result"]=="accepted" else "Карантин: "+r["reason"])+"</td><td>"+e(r["count"] if r["count"] is not None else "—")+"</td></tr>" for r in data["events"][:100])
    body='<section class="mast"><p class="kicker">Источники и качество</p><h1>Реестр загрузчиков и карантин</h1><p>'+e(NOTE)+'</p><p><a href="'+FILE+'">Скачать JSON</a> · <a href="source-journal.html">Транспортный журнал</a> · <a href="normalized-data.html">Единый формат</a></p></section><section><h2>Паспорта подключённых загрузчиков</h2><p>Пилот на действующих источниках. Подключение не означает полное покрытие. Исходные файлы не сохраняются автоматически.</p><div class="table-scroll"><table><thead><tr><th>Источник</th><th>Формат</th><th>Адаптер</th><th>Периодичность</th><th>Лимит байт</th></tr></thead><tbody>'+rows+'</tbody></table></div></section><section><h2>Результаты обработки и карантин</h2><p>'+("События пока не зарегистрированы." if not results else "Последние 100 событий. Полный ограниченный журнал — в JSON.")+'</p><div class="table-scroll"><table><thead><tr><th>Дата UTC</th><th>Источник и пакет</th><th>Этап</th><th>Результат</th><th>Позиций</th></tr></thead><tbody>'+results+'</tbody></table></div></section>'
    page("source-pipeline.html",body)
    return data
