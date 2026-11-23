import json
import re
from datetime import date, timedelta
from html import unescape
from urllib.parse import urlencode
from urllib.request import Request,urlopen

JOURNALS={"0042-8736":"Вопросы экономики","2221-2264":"Журнал Новой экономической ассоциации","1813-8691":"Экономический журнал ВШЭ","2072-6414":"Экономика региона"}
TOPICS={
 "Макроэкономика и рост":"макроэконом|macroeconom|экономическ.{1,4} рост|economic growth|gross domestic|inflation|инфляц",
 "Деньги и финансы":"банк|bank|кредит|credit|monetary|денежн|финанс|financ",
 "Труд и доходы":"занятост|employment|безработ|labou?r|труда|заработ|wage|неравенств|inequality",
 "Инвестиции и инновации":"инвестиц|invest|инновац|innovat|технолог|technolog",
 "Промышленность и АПК":"промышлен|industr|manufactur|аграр|agricultur|сельск.{1,5} хозяйств",
 "Регионы и пространство":"регион|region|пространствен|spatial|municipal|муницип",
 "Государство и институты":"государств|public policy|институт|institution|налог|tax|бюджет|budget",
 "Международная экономика":"торговл|trade|импорт|import|экспорт|export|международ|international",
 "Модели и методы":"модел|model|econometric|эконометр|input.output|затраты.{1,3}выпуск",
}

def tidy(text):
    return ' '.join(unescape(re.sub('<[^>]*>',' ',text)).split())

def sync(db, stamp, refresh):
    db.execute("create table if not exists literature(doi text primary key,journal text,published text,title text,authors text,topics text)")
    db.execute("create table if not exists journal_checks(issn text primary key,success text,checked text,status text)")
    for issn,journal in JOURNALS.items():
        if not refresh: continue
        last=db.execute("select success from journal_checks where issn=?",(issn,)).fetchone()
        start='1991-01-01'
        filters=['type:journal-article','from-pub-date:'+start]
        if last and last[0]:
            filters.append('from-index-date:'+str(date.fromisoformat(last[0][:10])-timedelta(days=2)))
        cursor='*'
        try:
            while True:
                args=urlencode(dict(filter=','.join(filters),rows=300,cursor=cursor,select='DOI,title,author,published'))
                url=f'https://api.crossref.org/journals/{issn}/works?{args}'
                with urlopen(Request(url,headers={'User-Agent':'EconomicsMonitor/1.0 (https://strelkov23.github.io/---/)'}),timeout=40) as resp:
                    batch=json.load(resp)['message']
                entries=[]
                for item in batch['items']:
                    titles=item.get('title') or []
                    if not titles:continue
                    title=tidy(titles[0])
                    parts=item.get('published',{}).get('date-parts',[[]])[0]
                    if not parts or not title:continue
                    when='-'.join(f'{p:02d}' for p in parts)
                    authors=', '.join(' '.join(filter(None,[a.get('given'),a.get('family')])) or a.get('name','') for a in item.get('author',[]))
                    topics=' · '.join(k for k,pat in TOPICS.items() if re.search(pat,title,re.I)) or 'Прочие экономические исследования'
                    entries.append((item['DOI'].lower(),journal,when,title,authors,topics))
                with db:db.executemany("insert or replace into literature values(?,?,?,?,?,?)",entries)
                if len(batch['items'])<300:break
                cursor=batch['next-cursor']
            with db:db.execute("insert or replace into journal_checks values(?,?,?,?)",(issn,stamp,stamp,'Проверено'))
        except Exception as err:
            with db:db.execute("insert into journal_checks values(?,null,?,?) on conflict(issn) do update set checked=excluded.checked,status=excluded.status",(issn,stamp,str(err)[:180]))
