import json
import re
from datetime import date, datetime, timedelta, timezone
from html import escape
from urllib.request import urlopen
from urllib.parse import urlencode

SOURCE="Официальное опубликование правовых актов"
FIELDS={"Налоги и взносы":"налог|акциз|страхов.{0,4} взнос","Труд и занятость":"трудов|занятост|заработн|оплат.{0,3} труда|работодател","Бюджет и господдержка":"бюджет|субсиди|грант|государственн.{0,4} поддерж","Банки и финансы":"банк|кредит|валют|финанс|страхован","Закупки и конкуренция":"закуп|контракт|конкуренц|антимонопол","Торговля и таможня":"торгов|тамож|экспорт|импорт","Имущество и бизнес":"предприним|имуществ|кадастр|лиценз|аренд|гражданск.{0,4} кодекс","Промышленность и АПК":"промышлен|энергет|сельск.{0,4} хозяйств|агропром|тариф"}
def setup(db):
    db.executescript("""create table if not exists legal(eo text primary key, day text,title text, first_seen text);
    create table if not exists legal_runs(id integer primary key,stamp text, pages integer, added integer, status text);
    create table if not exists legal_cursor(id integer primary key,eo text);""")
def fetch_day(day):
    day_text = day.strftime("%d.%m.%Y")
    docs = {}
    page = 1
    expected = None
    while True:
        params = urlencode(dict(publishDateFrom=day_text, publishDateTo=day_text, pageSize=200, index=page))
        with urlopen("http://publication.pravo.gov.ru/api/Documents?" + params, timeout=30) as response:
            batch = json.load(response)
        total = int(batch["itemsTotalCount"])
        if expected is None:
            expected = total
        if total != expected or (total and batch["currentPage"] != page):
            raise ValueError("Изменился состав выдачи")
        for doc in batch["items"]:
            eo = doc["eoNumber"]
            if not re.fullmatch(r"\d{16}", eo) or doc["publishDateShort"][:10] != day.isoformat() or not doc["complexName"]:
                raise ValueError("Карточка вне проверяемых суток")
            docs[eo] = doc
        if page >= batch["pagesTotalCount"]:
            break
        page += 1
    if len(docs) != expected:
        raise ValueError(f"Получено {len(docs)} из {expected}")
    return docs, page

def sync(db, put):
    today = datetime.now(timezone(timedelta(hours=3))).date()
    day = date(2026, 11, 20)
    db.execute("create table if not exists legal_days(day text primary key, expected integer, checked text, error text)")
    checked = {r[0] for r in db.execute("select day from legal_days where error=''")}
    while day <= today:
        day_iso = day.isoformat()
        if day_iso not in checked or day >= today - timedelta(days=2):
            stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
            try:
                docs, pages = fetch_day(day)
                added = 0
                with db:
                    for eo, doc in docs.items():
                        title = doc["complexName"]
                        added += db.execute("insert or ignore into legal values(?,?,?,?)",(eo,day_iso,title,stamp)).rowcount
                        db.execute("update legal set title=?,day=? where eo=?",(title,day_iso,eo))
                        tags = [k for k,v in FIELDS.items() if re.search(v,title,re.I)]
                        if "тариф" in (doc.get("name") or "").lower():
                            tags.append("Тарифы")
                        for tag in tags or ["Другие правовые акты"]:
                            put(db,title,"https://publication.pravo.gov.ru/document/"+eo,day_iso,SOURCE,tag,stamp)
                    stored = {r[0] for r in db.execute("select eo from legal where day=?",(day_iso,))}
                    error = "" if stored == set(docs) else "Расхождение номеров с порталом"
                    db.execute("insert or replace into legal_days values(?,?,?,?)",(day_iso,len(docs),stamp,error))
                    db.execute("insert into legal_runs(stamp,pages,added,status) values(?,?,?,?)",(stamp,pages,added,day_iso+" · "+(error or "Сверено по номерам")))
            except Exception as err:
                with db:
                    db.execute("insert into legal_days values(?,null,?,?) on conflict(day) do update set checked=excluded.checked,error=excluded.error",(day_iso,stamp,str(err)[:180]))
        day += timedelta(days=1)

def journal(db):
    runs=db.execute("select * from legal_runs order by id desc limit 12").fetchall()
    body='<p class="kicker">Официальные публикации РФ</p><h1>Правовой мониторинг</h1><p><a href="directory.html">Открыть кодексы РФ и сайты ведомств</a></p><p>Сборщик сохраняет карточки федеральных и региональных актов, в том числе без тематической метки. Тема определяется по заголовку. Даты действия отдельных норм требуют проверки по тексту документа.</p>'
    for label in ["Все публикации",*FIELDS,"Тарифы","Другие правовые акты"]:
        args={"publisher":SOURCE}
        if label!="Все публикации":args["sector"]=label
        body+=f'<a class="chip" href="/archive?{escape(urlencode(args))}">{label}</a> '
    body+='<h2>История проверок</h2><table><tr><th>Время UTC</th><th>Страниц</th><th>Новых актов</th><th>Результат</th></tr>'
    for r in runs: body+=f'<tr><td>{escape(r["stamp"])}</td><td>{r["pages"]}</td><td>{r["added"]}</td><td>{escape(r["status"])}</td></tr>'
    return body+'</table><h2>Последние документы</h2>'+''.join(f'<article><small>Опубликован {escape(d)} · № {eo}</small><h2><a href="https://publication.pravo.gov.ru/document/{eo}">{escape(t)}</a></h2><small>Вступление в силу: требуется проверка текста</small></article>' for eo,d,t in db.execute('select eo,day,title from legal order by day desc,eo desc limit 15'))
