import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from html import escape

SECTORS = {
    "Сельское хозяйство": ("АПК", 1), "Машиностроение и автомобили": ("Автопром", 9),
    "Энергетика": ("Энергетика", 11), "Транспорт": ("Транспорт", 14),
    "Торговля": ("Торговля", 13), "Информация и связь": ("Телекоммуникации", 16),
    "Финансы": ("Банки", 17), "Строительство и жильё": ("Жилищный рынок", 12),
}

def publish(page,out):
    def read(folder,name):
        return json.loads((folder/(name+'.json')).read_text())
    current=read(out,'archive')
    today=datetime.now(ZoneInfo('Europe/Moscow')).date()
    start=today-timedelta(days=6)
    body=f'<h1>Обзор отраслей за неделю</h1><p>{start:%d.%m.%Y} – {today:%d.%m.%Y}. Подборка обновляется при каждой сборке. Отрасль определяется по рубрике источника. В каждой рубрике показаны до трёх последних разных заголовков.</p><p><a href="updates.html">Что изменилось при обновлении</a> · <a href="machinery.html">Цифры по сельхозтехнике</a></p>'
    for title,(topic,group) in SECTORS.items():
        items={}
        for r in current:
            day=(r['published'] or '')[:10]
            if start.isoformat()<=day<=today.isoformat() and topic in (r['topics'] or '').split(' · '):
                items.setdefault(r['title'].strip().casefold(),r)
        body+=f'<section><h2>{title}</h2>'
        for r in sorted(items.values(),key=lambda r:r['published'],reverse=True)[:3]:
            body+=f'<p><small>{escape(r["published"][:10])} · {escape(r["source"])}</small><br><a href="{escape(r["url"],quote=True)}">{escape(r["title"])}</a></p>'
        if not items:body+='<p>За эти семь дней в рубрике нет публикаций.</p>'
        body+=f'<p><a href="sector-{group}.html">Структура отрасли по балансу 2021 года</a> · <a href="index.html?sector={topic}&amp;start={start}&amp;end={today}#archive">Все материалы рубрики за период</a></p></section>'
    page('week.html',body)
    prev=Path('../history/published')
    journal=read(prev,'changes') if (prev/'changes.json').exists() else []
    stamp=read(out,'status')['built']
    lines=[]
    if (prev/'compare.json').exists():
        oldurls={r['url'] for r in read(prev,'archive')}
        lines.append(f'Новых публикаций и документов: {len({r["url"] for r in current}-oldurls)}')
        previous=read(prev,'compare')
        for code,series in read(out,'compare').items():
            old=previous.get(code,{}).get('values',{})
            for year,val in series['values'].items():
                if old.get(year)!=val:
                    lines.append(f'{series["title"]}, {year}: {old.get(year,"нет значения")} → {val} {series["unit"]}')
        old={r['period']:r['value'] for r in read(prev,'industry')}
        for r in read(out,'industry'):
            if old.get(r['period'])!=r['value']:
                lines.append(f'Индекс промышленного производства, {r["period"]}: {old.get(r["period"],"нет значения")} → {r["value"]}% к тому же месяцу годом ранее')
    else:lines.append('Первый снимок. Он станет базой следующего сравнения.')
    lines.append(f'Источники со сбоем: {len(read(out,"status")["failures"])}')
    journal=([{'time':stamp,'lines':lines}]+journal)[:90]
    (out/'changes.json').write_text(json.dumps(journal,ensure_ascii=False))
    page('updates.html','<h1>Журнал обновлений</h1><p>Последние 90 сборок. Сравниваются адреса публикаций и числовые значения статистики с предыдущей сохранённой версией.</p><a href="sources.html">Состояние источников</a>'+''.join('<section><h2>'+datetime.fromisoformat(entry['time']).astimezone(ZoneInfo('Europe/Moscow')).strftime('%d.%m.%Y %H:%M МСК')+'</h2><ul>'+''.join('<li>'+escape(line)+'</li>' for line in entry['lines'])+'</ul></section>' for entry in journal))
