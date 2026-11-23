from html import escape
from pathlib import Path
from urllib.parse import quote
import csv

AGENCIES = {
    "Минэкономразвития России": "https://economy.gov.ru/",
    "Росстат": "https://rosstat.gov.ru/",
    "Банк России": "https://www.cbr.ru/statistics/",
    "Минфин России": "https://minfin.gov.ru/",
    "ФНС России": "https://www.nalog.gov.ru/",
    "Минтруд России": "https://mintrud.gov.ru/",
    "Правительство России": "http://government.ru/",
}
CODES = {
    "Налоговый кодекс, часть I": 19671, "Налоговый кодекс, часть II": 28165,
    "Трудовой кодекс": 34683, "Бюджетный кодекс": 19702,
    "Гражданский кодекс, часть I": 5142, "Гражданский кодекс, часть II": 9027,
    "Земельный кодекс": 33773,
}
# Theme, name, units, relevant Russian agency (WDI is the data provider).
META = {
    "NY.GDP.MKTP.KD.ZG": ("Выпуск и инвестиции","Реальный прирост ВВП","% за год","Минэкономразвития России"),
    "NY.GDP.PCAP.KD": ("Выпуск и инвестиции","Реальный ВВП на душу населения","долл. США в ценах 2015 года","Росстат"),
    "NE.GDI.FTOT.ZS": ("Выпуск и инвестиции","Валовое накопление основного капитала","% ВВП","Минэкономразвития России"),
    "NE.CON.PRVT.ZS": ("Выпуск и инвестиции","Потребление домашних хозяйств и НКООДХ","% ВВП","Росстат"),
    "FP.CPI.TOTL.ZG": ("Цены и деньги","Инфляция потребительских цен","% за год","Банк России"),
    "PA.NUS.FCRF": ("Цены и деньги","Официальный курс, средний за год","руб. за доллар США","Банк России"),
    "FM.LBL.BMNY.GD.ZS": ("Цены и деньги","Широкая денежная масса","% ВВП","Банк России"),
    "FS.AST.PRVT.GD.ZS": ("Цены и деньги","Внутренний кредит частному сектору","% ВВП","Банк России"),
    "NE.EXP.GNFS.ZS": ("Внешняя экономика","Экспорт товаров и услуг","% ВВП","Минэкономразвития России"),
    "NE.IMP.GNFS.ZS": ("Внешняя экономика","Импорт товаров и услуг","% ВВП","Минэкономразвития России"),
    "BN.CAB.XOKA.GD.ZS": ("Внешняя экономика","Сальдо текущего счёта","% ВВП","Банк России"),
    "BX.KLT.DINV.WD.GD.ZS": ("Внешняя экономика","Прямые иностранные инвестиции, чистый приток","% ВВП","Банк России"),
    "SL.UEM.TOTL.ZS": ("Труд и население","Безработица, модельная оценка МОТ","% рабочей силы","Минтруд России"),
    "SP.POP.TOTL": ("Труд и население","Численность населения","человек","Росстат"),
    "SP.DYN.LE00.IN": ("Труд и население","Ожидаемая продолжительность жизни при рождении","лет","Росстат"),
    "GB.XPD.RSDV.GD.ZS": ("Технологии","Расходы на исследования и разработки","% ВВП","Росстат"),
    "IT.NET.USER.ZS": ("Технологии","Население, использующее интернет","% населения","Росстат"),
}
for code,title in [("NV.AGR.TOTL.ZS","Сельское, лесное хозяйство и рыболовство"),("NV.IND.TOTL.ZS","Промышленность и строительство"),("NV.IND.MANF.ZS","Обрабатывающая промышленность"),("NV.SRV.TOTL.ZS","Услуги")]:
    META[code]=("Отраслевая структура",title+" — добавленная стоимость","% ВВП","Росстат")

def link(url,label):
    return f'<a href="{escape(url,quote=True)}">{escape(label)}</a>'

def chart(points,unit):
    vals=list(points.values())
    low,high=min(vals),max(vals)
    if low==high: high=low+1
    first,last=min(points),max(points)
    def xy(year,value):
        return 95+535*(year-first)/max(1,last-first),155-135*(value-low)/(high-low)
    body=[]
    for i in range(4):
        value=low+(high-low)*i/3
        _,y=xy(first,value)
        body.append(f'<line x1="95" x2="630" y1="{y}" y2="{y}" stroke="#d3dfda"/><text x="90" y="{y+4}" text-anchor="end">{value:,.3g}</text>')
    previous=None
    for year,value in sorted(points.items()):
        x,y=xy(year,value)
        if previous and previous[0]==year-1:
            body.append(f'<line x1="{previous[1]}" y1="{previous[2]}" x2="{x}" y2="{y}" stroke="#006c69" stroke-width="2"/>')
        body.append(f'<circle cx="{x}" cy="{y}" r="2.6" fill="#006c69"><title>{year} · {value:g}</title></circle>')
        previous=year,x,y
    return '<svg viewBox="0 0 655 188" width="100%" role="img" aria-label="Годовая динамика. Значения приведены в таблице ниже.">'+''.join(body)+f'<text x="95" y="180">{first}</text><text x="630" y="180" text-anchor="end">{last}</text></svg>'

def publish(page,out,rows,checks):
    sections={}
    for code,(theme,title,unit,agency) in META.items():
        data={int(r['year']):r['value'] for r in rows if r['code']==code and int(r['year'])>=1991}
        filename='indicator-'+code+'.html'
        coverage=f'{min(data)}–{max(data)} · {len(data)} годовых значений' if data else 'Нет наблюдений'
        sections.setdefault(theme,[]).append('<li>'+link(filename,title)+' · '+coverage+'</li>')
        api=f'https://api.worldbank.org/v2/country/RUS/indicator/{code}?format=json&per_page=200'
        status=next((r for r in checks if r['url']==api),{})
        body=f'<p>{theme} · Россия</p><h1>{title}</h1><p>{unit} · {coverage}</p>'
        body+=f'<p>Поставщик данных: {link("https://data.worldbank.org/indicator/"+code+"?locations=RU","Всемирный банк, WDI")}. {link(api,"Данные API")}. Профильное ведомство: {link(AGENCIES[agency],agency)}.</p>'
        body+=f'<p>Последняя успешная проверка UTC: {escape(status.get("success") or "нет")}. Состояние: {escape(status.get("status","нет сведений"))}.</p>'
        body+=f'<h2>Как получено значение</h2><p>Сайт берёт готовое годовое наблюдение для России (RUS), код {code}. Для каждого года выбирается последняя сохранённая версия. Пропуски остаются пустыми. {link("https://databank.worldbank.org/metadataglossary/world-development-indicators/series/"+code,"Определение, исходные источники и методика WDI")}.</p>'
        if unit == "% ВВП":
            body+='<p>Единица показывает величину показателя в процентах от ВВП. Разность двух таких долей выражается в процентных пунктах. При интерпретации учитывайте изменения как числителя, так и ВВП.</p>'
        if data:
            end=max(data)
            if end-1 in data:
                delta_unit = "п. п." if unit.startswith("%") else unit
                body+=f'<p>Пример по опубликованным значениям: {end} минус {end-1} год. {data[end]:.5g} − ({data[end-1]:.5g}) ≈ {data[end]-data[end-1]:.5g} {delta_unit}. Для расчёта использованы значения до округления.</p>'
            body+=chart(data,unit)
            end=max(data)
            with (out/(code+'.csv')).open('w',encoding='utf-8-sig',newline='') as f:
                w=csv.writer(f,delimiter=';');w.writerow(['Год','Значение','Единица','Код WDI','Страна','Источник','Проверено UTC'])
                for y in range(1991,end+1): w.writerow([y,data.get(y,''),unit,code,'RUS',api,status.get('success')])
            body+=f'<p>{link(code+".csv","Скачать ряд с 1991 года в CSV")} · {link("index.html?q="+quote(title.split()[0])+"#archive","Найти материалы в архиве")}</p><details><summary>Таблица по годам</summary><p>Прочерк означает отсутствие наблюдения.</p><table><tr><th>Год</th><th>{unit}</th></tr>'+''.join(f'<tr><td>{y}</td><td>{format(data[y],",.6g") if y in data else "—"}</td></tr>' for y in range(end,1990,-1))+'</table></details>'
        page(filename,body)
    page('indicators.html','<h1>Показатели экономики России</h1><p>Годовые наблюдения с 1991 года там, где они доступны. У каждого графика есть постоянный адрес, таблица и источник.</p>'+''.join('<section><h2>'+k+'</h2><ul>'+''.join(v)+'</ul></section>' for k,v in sections.items()))
    page('directory.html','<h1>Ведомства и кодексы</h1><h2>Официальные сайты</h2><ul>'+''.join('<li>'+link(v,k)+'</li>' for k,v in AGENCIES.items())+'</ul><h2>Кодексы РФ</h2><p>Тексты в КонсультантПлюс. Перед цитированием выберите редакцию на нужную дату.</p><ul>'+''.join('<li>'+link(f'https://www.consultant.ru/document/cons_doc_LAW_{v}/',k)+'</li>' for k,v in CODES.items())+'</ul><p>'+link('https://publication.pravo.gov.ru/','Официальное опубликование актов')+' · '+link('laws.html','Архив публикаций и сверка')+'</p>')
