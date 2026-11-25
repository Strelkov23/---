"""Bounded pilot of the official SME register; legal entities only.
No individual entrepreneurs, contact information, names or street addresses retained.
"""
import argparse,hashlib,io,json,re,sqlite3,zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlsplit
import company_import as ci
from sme_schema_probe import SOURCE,parse
from company_sources import fetch,inspect_schema

MAX_NETWORK=96*1024*1024
MAX_RANGE=16*1024*1024
MAX_XML=16*1024*1024
MAX_MEMBERS=24

class RemoteZip(io.RawIOBase):
    """Range-only ZIP reader: never accepts a full archive in response to a range."""
    def __init__(self,url,opener=urlopen,budget=MAX_NETWORK):
        u=urlsplit(url)
        if u.scheme!="https" or u.hostname not in ("file.nalog.ru","data.nalog.ru") or u.query or u.fragment:raise ValueError("Источник ZIP")
        self.url=url;self.opener=opener;self.budget=budget;self.transferred=0;self.pos=0;self.size=None;self.etag=None
        self._range(0,0)
    def _range(self,start,end):
        length=end-start+1
        if length<1 or length>MAX_RANGE or self.transferred+length>self.budget:raise ValueError("Бюджет сетевой проверки")
        headers={"Range":f"bytes={start}-{end}","Accept-Encoding":"identity","User-Agent":"EconomicMonitor/1.0"}
        if self.etag:headers["If-Match"]=self.etag
        with self.opener(Request(self.url,headers=headers),timeout=35) as r:
            u=urlsplit(r.geturl())
            if u.scheme!="https" or u.hostname not in ("file.nalog.ru","data.nalog.ru") or u.path!=urlsplit(self.url).path:raise ValueError("Другой архив")
            if r.status!=206:raise ValueError("Сервер не поддерживает безопасное чтение диапазонов")
            match=re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)",r.headers.get("Content-Range",""))
            if not match or (int(match[1]),int(match[2]))!=(start,end):raise ValueError("Content-Range")
            size=int(match[3]);etag=r.headers.get("ETag")
            if self.size is None:
                self.size=size;self.etag=etag if etag and not etag.startswith("W/") else None
                if not self.etag:raise ValueError("Нет сильного ETag для неизменяемой проверки диапазонов")
            elif size!=self.size or etag!=self.etag:raise ValueError("Архив изменился")
            raw=r.read(length+1)
        if len(raw)!=length:raise ValueError("Неполный диапазон")
        self.transferred+=len(raw);return raw
    def readable(self):return True
    def seekable(self):return True
    def tell(self):return self.pos
    def seek(self,offset,whence=0):
        pos=offset if whence==0 else self.pos+offset if whence==1 else self.size+offset if whence==2 else -1
        if pos<0:raise ValueError("Смещение")
        self.pos=pos;return pos
    def read(self,n=-1):
        n=self.size-self.pos if n<0 else min(n,self.size-self.pos)
        if n<=0:return b""
        raw=self._range(self.pos,self.pos+n-1);self.pos+=n;return raw

def unique(parent,tag):
    a=parent.findall(tag)
    if len(a)>1:raise ValueError("Повтор "+tag)
    return a[0] if a else None

def code(doc,tag):
    container=unique(doc,tag)
    if container is None:return None,None
    primary=unique(container,"СвОКВЭДОсн")
    if primary is None:return None,None
    v=primary.get("КодОКВЭД");version=primary.get("ВерсОКВЭД")
    if not v or not re.fullmatch(r"\d{2}(?:\.\d{1,2}){0,2}",v) or version not in ("2001","2014"):raise ValueError("ОКВЭД")
    return v,version

def parse_member(raw,edition):
    if not 0<len(raw)<=MAX_XML or re.search(br"<!\s*(?:DOCTYPE|ENTITY)",raw,re.I):raise ValueError("XML")
    root=ET.fromstring(raw)
    if root.tag!="Файл":raise ValueError("Корень XML")
    counts=Counter();rows=[]
    for doc in root.findall("Документ"):
        counts["documents"]+=1
        if datetime.strptime(doc.get("ДатаСост",""),"%d.%m.%Y").date().isoformat()!=edition:raise ValueError("Другая дата среза")
        org=unique(doc,"ОргВклМСП");ip=unique(doc,"ИПВклМСП")
        if (org is None)==(ip is None):raise ValueError("Неоднозначный вид субъекта")
        if org is None:counts["individual_excluded"]+=1;continue
        counts["legal"]+=1
        inn=org.get("ИННЮЛ","");ogrn=org.get("ОГРН","")
        if not ci.inn_valid(inn) or not re.fullmatch(r"\d{13}",ogrn) or int(ogrn[:12])%11%10!=int(ogrn[-1]):raise ValueError("ИНН/ОГРН")
        location=unique(doc,"СведМН");region=location.get("КодРегион") if location is not None else None
        if region is not None and not re.fullmatch(r"\d{2}",region):raise ValueError("Регион")
        declared,dver=code(doc,"СвОКВЭД");reported,rver=code(doc,"СвОКВЭДотч")
        category=doc.get("КатСубМСП")
        rows.append((inn,ogrn,region,declared,dver,reported,rver,category))
    if not counts["documents"]:raise ValueError("Нет документов")
    return rows,counts

def sample(z,edition,limit):
    members=sorted((m for m in z.infolist() if not m.is_dir() and m.filename.lower().endswith(".xml")),key=lambda m:m.filename)
    if not members or len({m.filename for m in members})!=len(members):raise ValueError("Состав XML")
    if not 1<=limit<=MAX_MEMBERS:raise ValueError("Лимит пилота")
    count=min(limit,len(members))
    chosen=[members[(i*len(members))//count] for i in range(count)]
    totals=Counter();regions=Counter();classes=Counter();seen={};provenance=[]
    for m in chosen:
        if not 0<m.file_size<=MAX_XML or m.compress_size>MAX_RANGE:raise ValueError("Размер XML")
        raw=z.read(m);rows,counts=parse_member(raw,edition);totals.update(counts)
        provenance.append(dict(member=m.filename,sha256=hashlib.sha256(raw).hexdigest(),documents=counts["documents"]))
        for row in rows:
            if row[0] in seen:
                if seen[row[0]]!=row:raise ValueError("Конфликт ИНН в пилоте")
                totals["exact_duplicates"]+=1;continue
            seen[row[0]]=row
            regions[row[2] or "missing"]+=1
            classes[row[3][:2] if row[3] and row[4]=="2014" else "missing_or_other_version"]+=1
    if sum(regions.values())!=len(seen) or sum(classes.values())!=len(seen):raise ValueError("Баланс")
    return dict(mode="pilot",edition=edition,xml_total=len(members),xml_processed=len(chosen),counts=dict(totals),unique_legal=len(seen),region_counts=dict(sorted(regions.items())),declared_okved2_class_counts=dict(sorted(classes.items())),members=provenance,note="Выборка XML, не репрезентативна. Регион регистрации, не место производства. Отчётный и заявительный ОКВЭД не смешиваются. ИП исключены. Не общероссийские оценки.")

def main():
    p=argparse.ArgumentParser();p.add_argument("--output",required=True,type=Path);p.add_argument("--members",type=int,default=12);a=p.parse_args()
    raw,enc=fetch(SOURCE,4_000_000);meta=parse(raw,enc);raw,_=fetch(meta["schema"],2_000_000);schema=inspect_schema(raw)
    if not {"ИННЮЛ","ОГРН","КодРегион","КодОКВЭД","ВерсОКВЭД","ДатаСост"}<=set(schema["attributes"]):raise ValueError("Необходимые поля XSD")
    with RemoteZip(meta["archive"]) as source,zipfile.ZipFile(source) as z:
        result=sample(z,meta["release"],a.members)
        result.update(meta,**schema,archive_bytes=source.size,archive_etag=source.etag,transferred=source.transferred,checked=datetime.now(timezone.utc).isoformat())
    a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(result,ensure_ascii=False))
if __name__=="__main__":main()
