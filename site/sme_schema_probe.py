"""Check the official SME catalogue and XSD. No personal records downloaded."""
import argparse,json,re,hashlib
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlsplit
from bank_registry import Tables
from company_sources import fetch,inspect_schema
SOURCE="https://www.nalog.gov.ru/opendata/7707329152-rsmp/"
PREFIX="/opendata/7707329152-rsmp/"
def parse(raw,enc):
    p=Tables();p.feed(raw.decode(enc));p.close()
    tables=[t for t in p.tables if any(len(r)>=3 and r[1]=="Идентификационный номер" and r[2]=="7707329152-rsmp" for r in t)]
    if len(tables)!=1:raise ValueError("Паспорт МСП")
    fields={}
    for r in tables[0]:
        if len(r)>=3:
            if r[1] in fields:raise ValueError("Повтор поля")
            fields[r[1]]=r[2]
    def link(k,pattern):
        u=fields[k];v=urlsplit(u)
        if v.scheme!="https" or v.hostname not in ("file.nalog.ru","data.nalog.ru") or v.query or v.fragment or not re.fullmatch(PREFIX+pattern,v.path):raise ValueError("Ссылка выпуска")
        return u
    archive=link("Гиперссылка (URL) на набор",r"data-\d{8}-structure-\d{8}\.zip")
    schema=link("Описание структуры набора данных",r"structure-\d{8}\.xsd")
    release=datetime.strptime(fields["Дата последнего внесения изменений"],"%d.%m.%Y").date()
    if fields["Формат данных"].lower()!="xml" or release.strftime("%d%m%Y")!=re.search(r"data-(\d{8})",archive)[1] or re.search(r"structure-(\d{8})",archive)[1]!=re.search(r"structure-(\d{8})",schema)[1]:raise ValueError("Редакция")
    return dict(source=SOURCE,archive=archive,schema=schema,release=release.isoformat(),catalog_sha256=hashlib.sha256(raw).hexdigest())
def main():
    a=argparse.ArgumentParser();a.add_argument("--output",type=Path,required=True);p=a.parse_args()
    raw,enc=fetch(SOURCE,4_000_000);d=parse(raw,enc)
    raw,_=fetch(d["schema"],2_000_000);d.update(inspect_schema(raw));d["checked"]=datetime.now(timezone.utc).isoformat()
    p.output.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(d,ensure_ascii=False))
if __name__=="__main__":main()
