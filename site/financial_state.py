"""Dated Rosstat operational snapshots; no reconstruction of earlier stocks from rounded growth indices."""
import csv,json
from decimal import Decimal as D
DEBT_SOURCE="https://rosstat.gov.ru/storage/mediabank/osn-02-2026.pdf"
RESULT_SOURCE="https://rosstat.gov.ru/storage/mediabank/167_28-10-2026.html"
ANNUAL_SOURCE="https://rosstat.gov.ru/storage/mediabank/32_11-03-2026.html"
CATALOG="https://rosstat.gov.ru/statistics/finance"
FIELDS=("total","payable","loans","overdue_total","overdue_payable","overdue_loans","receivable","overdue_receivable")
LABELS=("Суммарные обязательства","Кредиторская задолженность","Кредиты и займы","Просроченные обязательства","Просроченная кредиторская","Просроченные кредиты и займы","Дебиторская задолженность","Просроченная дебиторская")
RAW=[
 ("2025-12","276168.3 130127.0 146041.3 6964.1 6584.0 380.1 123758.8 7703.5","5"),
 ("2026-01","283310.5 133777.5 149533.0 6810.4 6457.5 352.9 127849.6 8178.9","12"),
]
# Selected rows explicitly present in the indexed HTML, not a complete partition.
RESULTS=[
 ("total","Всего","15677.4 23581.1 7903.7 89.0"),
 ("A","Сельское, лесное хозяйство, рыболовство","309.3 471.7 162.4 67.3"),
 ("01","Растениеводство и животноводство, охота","241.7 371.1 129.4 65.5"),
 ("02","Лесоводство и лесозаготовки","-6.5 3.1 9.6 -"),
 ("03","Рыболовство и рыбоводство","74.1 97.5 23.4 82.4"),
 ("B","Добыча полезных ископаемых","4138.3 5170.3 1032.0 157.2"),
 ("05","Добыча угля","-178.6 69.7 248.3 -"),
 ("06","Добыча нефти и газа","3108.2 3631.3 523.1 174.2"),
 ("I","Гостиницы и общепит","52.7 102.3 49.6 75.5"),
 ("J","Информация и связь","692.2 1062.0 369.8 121.7"),
 ("K","Финансовая и страховая деятельность (в охвате обследования)","-248.7 1168.5 1417.2 -"),
 ("L","Недвижимость","238.6 472.8 234.2 63.0"),
 ("M","Профессиональная, научная и техническая деятельность","546.0 1251.2 705.2 63.7"),
 ("72","Научные исследования и разработки","91.7 184.7 93.0 128.5"),
]
COVERAGE="Оперативные данные организаций без малого предпринимательства, кредитных организаций, государственных (муниципальных) учреждений и некредитных финансовых организаций; точный охват платежей уточнять по бюллетеню."
def ratio(n,d):return float(100*n/d) if d>0 else None
def debt():
    rows=[]
    for period,raw,table in RAW:
        v=dict(zip(FIELDS,map(D,raw.split())))
        assert len(v)==len(FIELDS) and all(x>=0 for x in v.values())
        assert v["total"]==v["payable"]+v["loans"]
        assert v["overdue_total"]==v["overdue_payable"]+v["overdue_loans"]
        for k in ("total","payable","loans","receivable"):assert v["overdue_"+k]<=v[k]
        rows.append(dict(period=period,**{k:float(x) for k,x in v.items()},overdue_total_pct=ratio(v["overdue_total"],v["total"]),overdue_payable_pct=ratio(v["overdue_payable"],v["payable"]),overdue_loans_pct=ratio(v["overdue_loans"],v["loans"]),overdue_receivable_pct=ratio(v["overdue_receivable"],v["receivable"]),payable_minus_receivable=float(v["payable"]-v["receivable"]),source=DEBT_SOURCE,table=table))
    return rows
def results():
    rows=[]
    for code,title,raw in RESULTS:
        bal,profit,loss,index=raw.split();b,p,l=map(D,(bal,profit,loss))
        discrepancy=b-(p-l)
        if abs(discrepancy)>D(".1") or p<0 or l<0:raise ValueError("Profit balance "+code)
        rows.append(dict(code=code,title=title,period="2026-01—2026-08",balance=float(b),profit=float(p),loss=float(l),published_yoy_index=None if index=="-" else float(D(index)),rounding_difference=float(discrepancy),source=RESULT_SOURCE))
    return rows
def publish(page,out):
    data=dict(debt=debt(),results=results(),annual=dict(period="2025",balance=27072.9,profit=35968.5,loss=8895.6,profitable_thousand=46.4,loss_thousand=17.2,source=ANNUAL_SOURCE),current=dict(period="2026-01—2026-08",profitable_thousand=43.4,loss_thousand=21.3,profitable_pct=67.1,loss_pct=32.9,prior_profitable_pct=70.0,prior_loss_pct=30.0,source=RESULT_SOURCE),labels=dict(zip(FIELDS,LABELS)),coverage=COVERAGE,catalog=CATALOG,verification="Ручной снимок индексированного текста официальных публикаций. PDF: визуальная сверка не удалась (тайм-аут). HTML: выбранные строки; не полный набор. Не оперативное обновление.")
    (out/"financial-state.json").write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    for key,name in (("debt","organization-debt.csv"),("results","organization-results.csv")):
        rows=data[key]
        with (out/name).open("w",encoding="utf-8-sig",newline="") as f:
            w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    page("financial-state.html",'<section class="mast"><h1>Финансовые результаты и задолженность организаций</h1><p>Отдельные документальные срезы Росстата, не полный оперативный мониторинг. <a href="'+CATALOG+'">Текущие публикации Росстата</a> · <a href="finance.html">Рентабельность ФНС</a> · <a href="methodology.html#financial-state-method">Методика</a> · <a href="financial-state.json">JSON</a></p><p>Ручная транскрипция индексированного текста. Визуальная сверка PDF не удалась. Не распространять охват обследования на все предприятия России.</p></section><section><h2>Запасы задолженности на конец месяца</h2><p>Не поток за месяц. Суммарные обязательства = кредиторская задолженность + кредиты и займы. Дебиторская — отдельная категория, не прибавляется к обязательствам. Отношение просроченной задолженности к соответствующему итогу — показатель структуры, не вероятность дефолта.</p><p><a href="'+DEBT_SOURCE+'">Бюллетень Росстата, таблицы 5 и 12</a> · <a href="organization-debt.csv">CSV</a></p><div id="debt-table" class="table-scroll" tabindex="0" role="region" aria-label="Задолженность"></div><div id="debt-ratios" class="table-scroll" tabindex="0" role="region" aria-label="Доля просроченной задолженности"></div></section><section><h2>Финансовые результаты до налогообложения</h2><p>Накопленный поток за указанный период, текущие цены. Не сравнивать полный 2025 год с восемью месяцами 2026 как годовые значения. Опубликованные индексы г/г рассчитаны Росстатом по сопоставимому кругу; не восстанавливать из них точные суммы предыдущего года. Выборочные отраслевые строки пересекаются.</p><p><a href="'+ANNUAL_SOURCE+'">2025 год</a> · <a href="'+RESULT_SOURCE+'">Январь–август 2026</a> · <a href="organization-results.csv">CSV отраслей</a></p><div id="results-totals"></div><label class="builder-control">Поиск по отраслям<input id="results-query" type="search"></label><div id="results-table" class="table-scroll" tabindex="0" role="region" aria-label="Финансовые результаты"></div><p id="state-status" role="status">Загрузка…</p></section><script defer src="financial-state.js"></script>')
