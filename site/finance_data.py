"""FNS annual profitability benchmarks, documentary snapshot. 'отр' is a sign, not a number."""
import csv,json,re
from datetime import datetime,timedelta,timezone
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit
from urllib.request import Request,urlopen
from decimal import Decimal
SOURCE="https://www.nalog.gov.ru/rn77/taxation/reference_work/conception_vnp/"
REPLICAS={2023:"https://www.consultant.ru/document/cons_doc_LAW_55729/295da02404d085de3420ba1b64cace60fbeed002/",2024:"https://www.consultant.ru/document/cons_doc_LAW_55729/0e9f3c6aeb49362ca20996710a02f80c375b0ef4/",2025:"https://www.consultant.ru/document/cons_doc_LAW_55729/46b5b065d9811c15e161f73df1f433342686dda3/"}
# Abbreviated labels, identifiers local to this table. 2023, 2024, 2025: cost profitability, asset profitability.
RAW="""total|Итого|total|13.5 7.5 12.7 6.1 10.9 5
A|Сельское и лесное хозяйство, рыболовство|section|23.9 7.9 22.4 7.3 20.2 5.7
01|Растениеводство и животноводство|detail|22.3 8.2 22.2 7.9 18.9 5.3
02|Лесоводство и лесозаготовки|detail|отр отр 3.9 1.6 отр отр
03|Рыболовство и рыбоводство|detail|40.9 7.4 28.7 4.4 35.3 8.9
B|Добыча полезных ископаемых|section|29.5 12.4 27.7 12.4 21.7 5.8
05|Добыча угля|detail|21.1 11 4.8 отр отр отр
06|Нефть и природный газ|detail|30.2 13.7 27.7 14 21.3 5.1
07|Металлические руды|detail|60.1 11.6 71.1 17.9 65.3 17.6
08|Прочие полезные ископаемые|detail|38 12.4 21 2.2 14.1 5.5
C|Обрабатывающие производства|section|17.1 8.7 14.7 7.7 13.4 7.2
10|Пищевые продукты|detail|12.2 13.4 9.7 9.8 9.4 8.8
11|Напитки|detail|15.5 11.3 14.9 10.6 17.6 12.2
12|Табачные изделия|detail|57.7 28.1 42.3 24.5 43.3 24.6
13|Текстильные изделия|detail|15.6 8.3 13.9 9.9 11.9 8.3
14|Одежда|detail|16.3 14.1 13 14.5 16 15.2
15|Кожа и изделия из кожи|detail|15.8 8 9.6 4.4 12.5 7.4
16|Обработка древесины и изделия из дерева|detail|4.9 отр 7.6 2 2.6 отр
17|Бумага и бумажные изделия|detail|19.6 9.8 19.6 11 12.6 4.2
18|Полиграфия и копирование носителей|detail|19.5 16.4 18.1 18.3 11.9 11.5
19|Кокс и нефтепродукты|detail|16.9 10.5 12.8 8.7 14.1 6.6
20|Химические вещества и продукты|detail|31.2 8.4 27.6 6.8 25.9 8.1
21|Лекарственные средства|detail|31.9 11.4 35.3 13.2 38.8 15.3
22|Резиновые и пластмассовые изделия|detail|14.7 14.3 12.1 11.8 10.3 7.5
23|Неметаллическая минеральная продукция|detail|18.5 10.4 17.2 10.8 13.4 6.8
24|Металлургия|detail|20.8 11.6 16.2 9.4 10.4 12.2
25|Готовые металлические изделия|detail|16.9 6.3 13.6 5.5 12.5 4.6
28|Машины и оборудование, прочие|detail|15.5 7.3 14.2 7.4 16.5 8.7
26|Компьютеры, электронные и оптические изделия|detail|19.4 6.9 19.3 6.7 16.3 5.7
27|Электрическое оборудование|detail|16.2 12 16 12.1 18 12.1
29|Автотранспортные средства, прицепы|detail|6.3 4.1 9.7 6.1 2.9 1.4
30|Прочие транспортные средства|detail|5.1 отр 10 1.8 7.4 .6
32|Прочие готовые изделия|detail|14.4 9.9 16.4 8.3 15.7 7.5
D|Электроэнергия, газ и пар|section|10.7 8.2 10.2 4.9 10.6 7.4
35.1|Электроэнергия|detail|15.1 9.9 14.7 5.9 15.3 9.2
35.2|Газообразное топливо|detail|2.4 3.2 2.4 3.1 2.3 3.3
35.3|Пар и горячая вода|detail|отр .7 отр .1 отр отр
E|Водоснабжение и отходы|section|4.1 3.2 2.6 3 1.5 2.3
F|Строительство|section|10.8 4.5 9.8 3.9 9.3 3.4
G|Торговля и ремонт транспорта|section|5.6 6.7 4.9 3.4 4.6 2.7
45|Торговля транспортом и ремонт|detail|7.5 11.2 4.8 4.5 1.1 3.2
46|Оптовая торговля, кроме транспорта|detail|5.1 6.5 4.5 2.8 4.5 2.2
47|Розничная торговля, кроме транспорта|detail|6.4 6.2 6 5.4 5.8 4.4
I|Гостиницы и общепит|section|10.7 4.6 11.6 4.4 10.5 5.3
H|Транспортировка и хранение|section|15.1 5.7 13 4.5 11.2 4.2
49.1|Междугородний и международный пассажирский ж/д транспорт|detail|11.2 7.5 12.5 8.7 12.6 6.8
49.2|Грузовой ж/д транспорт|detail|20 3.5 18.3 2.1 15.8 .5
49.3|Прочий наземный пассажирский транспорт|detail|отр отр отр отр отр отр
49.4|Автомобильный грузовой транспорт|detail|7.6 6.8 7.7 5 14.9 5.6
49.5|Трубопроводный транспорт|detail|12.2 7.9 12.5 7.5 12.5 8.7
50|Водный транспорт|detail|34.4 12.4 15.1 7.1 10 3.8
51|Воздушный и космический транспорт|detail|0 .5 4 2.1 2.1 13.2
53|Почта и курьерская деятельность|detail|45 отр отр отр отр отр
J|Информация и связь|section|14 6.5 14.5 7.1 15.4 6.6
K|Финансовая и страховая деятельность|section|30 6.1 45.8 4.1 69.4 4.2
L|Недвижимость|section|32 2.6 34.8 3.9 36.5 2.4
72|Научные исследования и разработки|detail|4.5 1.1 9.2 1.7 8.6 1.9
O|Государственное управление и безопасность|section|отр 2.5 отр 3.9 4.2 1.9
P|Образование|section|9.1 3.7 5 5.1 7.1 12
Q|Здравоохранение и социальные услуги|section|12.6 7.3 13.3 10.5 13.1 10.7
R|Культура, спорт и досуг|section|13.7 6 8.2 9.8 10.4 7.8"""
METRICS={"sales":("Рентабельность продаж по затратам","100 × результат от продаж / себестоимость с коммерческими и управленческими расходами","Не прибыль / выручка; не чистая маржа и не доля убыточных организаций."),"assets":("Рентабельность активов","100 × сальдированный финансовый результат / стоимость активов","Не рентабельность продаж, не доходность инвестиций; не выводить стоимость капитала из этого коэффициента.")}
def records():
    out=[]
    for line in RAW.splitlines():
        code,title,level,values=line.split("|");tokens=values.split()
        if len(tokens)!=6:raise ValueError("Incorrect row "+code)
        for i,year in enumerate((2023,2024,2025)):
            for j,metric in enumerate(METRICS):
                raw=tokens[i*2+j];value=None if raw=="отр" else float(Decimal(raw))
                out.append(dict(code=code,title=title,level=level,year=year,metric=metric,value=value,sign="negative_unspecified" if raw=="отр" else "numeric",raw=raw,source=SOURCE,replica=REPLICAS[year]))
    if len({(r["code"],r["year"],r["metric"]) for r in out})!=len(out):raise ValueError("Duplicate financial observation")
    return out
class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.current=None;self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag=="a":self.current=[dict(attrs).get("href",""),[]]
    def handle_data(self,text):
        if self.current is not None:self.current[1].append(text)
    def handle_endtag(self,tag):
        if tag=="a" and self.current is not None:self.links.append((self.current[0]," ".join(self.current[1])));self.current=None
def discover(html):
    p=Links();p.feed(html);found={}
    for url,title in p.links:
        title=" ".join(title.split()).lower()
        if "рентабельност" not in title and "среднеотраслевые показатели" not in title:continue
        m=re.search(r"за\s+(20\d{2})\s+год",title)
        if not m:continue
        url=urljoin(SOURCE,url);u=urlsplit(url)
        if u.scheme!="https" or u.hostname!="data.nalog.ru" or not u.path.lower().endswith((".xls",".xlsx")):continue
        year=int(m[1])
        if year in found and found[year]!=url:raise ValueError("Несколько файлов для "+str(year))
        found[year]=url
    if not found:raise ValueError("Годовые файлы не обнаружены")
    return found
def stamp_date(s):
    t=datetime.fromisoformat(s)
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)
def check_files(db,stamp,refresh):
    db.execute("create table if not exists finance_files(id integer primary key check(id=1),checked text,success text,status text,files text)")
    prev=db.execute("select checked,success,status,files from finance_files where id=1").fetchone()
    if refresh and (not prev or stamp_date(stamp)-stamp_date(prev[0])>=timedelta(days=7)):
        try:
            with urlopen(Request(SOURCE,headers={"User-Agent":"EconomicsMonitor/2.0"}),timeout=20) as f:
                raw=f.read(3000001)
                encoding=f.headers.get_content_charset() or "utf-8"
            if len(raw)>3000000:raise ValueError("Ответ слишком велик")
            found=discover(raw.decode(encoding))
            with db:db.execute("insert or replace into finance_files values(1,?,?,?,?)",(stamp,stamp,"Обнаружено годовых ссылок: "+str(len(found)),json.dumps(found)))
        except Exception as e:
            with db:db.execute("insert into finance_files values(1,?,null,?,?) on conflict(id) do update set checked=excluded.checked,status=excluded.status",(stamp,"Ошибка проверки: "+str(e)[:160],"{}"))
    row=db.execute("select checked,success,status,files from finance_files where id=1").fetchone()
    return dict(checked=row[0] if row else None,success=row[1] if row else None,status=row[2] if row else "Ожидается первая проверка",files=json.loads(row[3]) if row else {})
def publish(page,out,file_check=None):
    rows=records()
    data=dict(file_check=file_check or {},source=SOURCE,replicas=REPLICAS,rows=rows,metrics={k:dict(title=v[0],formula=v[1],caution=v[2]) for k,v in METRICS.items()},transcribed="2026-11-24",status="Ручная сверка опубликованных таблиц приложения 4 в КонсультантПлюс; оригинальный XLSX не прочитан. Охват организаций уточняется по первоисточнику.")
    (out/"finance-data.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    with (out/"finance-profitability.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    page("finance.html",'<section class="mast"><h1>Финансы организаций: рентабельность</h1><p>Среднеотраслевые ориентиры ФНС, приложение 4, 2023–2025. Ручной документальный снимок, не текущая оперативная статистика. Названия сокращены, идентификаторы локальные; разделы и детализация пересекаются. Не суммировать коэффициенты. <a href="'+SOURCE+'">Первоисточник ФНС</a> · <a href="finance-profitability.csv">CSV</a> · <a href="finance-data.json">JSON</a> · <a href="methodology.html#finance-method">Методика</a>.</p><p><a href="finance-workbooks.html">Автоматический импорт оригинальных таблиц и его результаты</a></p><p id="finance-source-check" role="status"></p><div id="finance-source-files"></div><p>Автоматически проверяется наличие ссылок на годовые файлы (не чаще раза в семь дней), но числовые данные пока требуют отдельной сверки и обновления.</p><p>Оригинальный XLSX не прочитан; использованы опубликованные таблицы приложения 4 в КонсультантПлюс. «Отр» означает отрицательный результат без числовой величины; не ноль и не отсутствие отрицательного результата.</p></section><section><h2>Сопоставление по видам деятельности</h2><label class="builder-control">Год<select id="finance-year"><option>2025</option><option>2024</option><option>2023</option></select></label><label class="builder-control">Уровень<select id="finance-level"><option value="">Все</option><option value="section">Разделы</option><option value="detail">Детализация</option></select></label><label class="builder-control">Поиск<input id="finance-query" type="search"></label><p id="finance-status" role="status">Загрузка…</p><div id="finance-table" class="table-scroll" tabindex="0" role="region" aria-label="Рентабельность"></div><h2>Динамика выбранного вида деятельности</h2><label class="builder-control">Вид деятельности<select id="finance-trend"></select></label><div id="finance-chart"></div><p>Финансовые ориентиры не измеряют физические мощности, технологическую эффективность, задолженность или фактическую себестоимость. Не использовать для автоматического назначения цен.</p></section><script defer src="finance-data.js"></script>')
