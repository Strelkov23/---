"""Official Bank of Russia systemically important institutions: directory only."""
import re,hashlib
from html.parser import HTMLParser
from urllib.request import Request,urlopen
from datetime import datetime
SOURCE="https://www.cbr.ru/banking_sector/credit/SystemBanks.html/"
MAX=4_000_000
def clean(s):return re.sub(r"\s+"," ",s).strip()
class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.tables=[];self.depth=0;self.row=None;self.cell=None;self.text=[]
    def handle_starttag(self,tag,attrs):
        if tag=="table":
            self.depth+=1
            if self.depth==1:self.tables.append([])
        if self.depth==1:
            if tag=="tr":self.row=[]
            if tag in ("td","th") and self.row is not None:self.cell=[]
    def handle_endtag(self,tag):
        if self.depth==1:
            if tag in ("td","th") and self.cell is not None and self.row is not None:self.row.append(clean(" ".join(self.cell)));self.cell=None
            if tag=="tr" and self.row is not None:self.tables[-1].append(self.row);self.row=None
        if tag=="table":self.depth=max(0,self.depth-1)
    def handle_data(self,s):
        self.text.append(s)
        if self.cell is not None:self.cell.append(s)
def parse(raw,encoding="utf-8"):
    if not 0<len(raw)<=MAX:raise ValueError("Размер HTML")
    p=Tables();p.feed(raw.decode(encoding));p.close()
    text=clean(" ".join(p.text))
    dates=set(re.findall(r"Перечень системно значимых кредитных организаций на\s+(\d{2}\.\d{2}\.\d{4})",text,re.I))
    if len(dates)!=1:raise ValueError("Неоднозначная дата перечня")
    edition=datetime.strptime(dates.pop(),"%d.%m.%Y").date().isoformat()
    matches=[]
    for table in p.tables:
        if table and len(table[0])==3 and "наименование кредитной организации" in table[0][1].lower() and re.fullmatch(r"рег\.\s*№",table[0][2],re.I):matches.append(table[1:])
    if len(matches)!=1:raise ValueError("Таблица перечня не уникальна")
    rows=[];ids=set()
    for i,row in enumerate(matches[0],1):
        if len(row)!=3 or row[0]!=str(i) or not row[1] or not re.fullmatch(r"\d{1,6}",row[2]) or row[2] in ids:raise ValueError("Некорректная строка перечня")
        ids.add(row[2]);rows.append(dict(registration_number=row[2],name=row[1],source_row=i))
    if not 5<=len(rows)<=50:raise ValueError("Неожиданное число организаций")
    return dict(schema=1,source=SOURCE,edition=edition,sha256=hashlib.sha256(raw).hexdigest(),rows=rows,note="Статус системной значимости на дату перечня; не финансовая отчётность и не рейтинг.")
def fetch():
    with urlopen(Request(SOURCE,headers={"User-Agent":"Mozilla/5.0"}),timeout=25) as r:
        from urllib.parse import urlsplit
        u=urlsplit(r.geturl())
        if u.scheme!="https" or u.hostname not in ("www.cbr.ru","cbr.ru") or u.path.rstrip("/").lower()!=urlsplit(SOURCE).path.rstrip("/").lower():raise ValueError("Неожиданный источник")
        return r.read(MAX+1),r.headers.get_content_charset() or "utf-8"
