"""Inspect actual official report XML and archive metadata before mapping numbers."""
import argparse,hashlib,json,re,zipfile,io,subprocess,tempfile
from collections import Counter
from datetime import date,datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin,urlsplit
from urllib.request import Request,urlopen
import bank_disclosure as d
import bank_registry as registry
CATALOG="https://www.cbr.ru/banking_sector/otchetnost-kreditnykh-organizaciy/"
METHOD="Data123FormFullXML"
METHODS={METHOD,"Data135FormFullXML","Data135MetaFullXML"}
MAX_PAGE=4*1024*1024
MAX_ARCHIVE=30*1024*1024
def allowed(url):
    p=urlsplit(url)
    return p.scheme=="https" and p.hostname in ("cbr.ru","www.cbr.ru") and p.port in (None,443) and not p.username and not p.password and not p.fragment
def get(url,limit,body=None,headers=None):
    if not allowed(url):raise ValueError("Неофициальный источник")
    req=Request(url,data=body,headers={"User-Agent":"EconomicMonitor/1.0",**(headers or {})})
    with urlopen(req,timeout=20) as r:
        if not allowed(r.geturl()):raise ValueError("Неофициальный адрес ответа")
        raw=r.read(limit+1)
    if not 0<len(raw)<=limit:raise ValueError("Размер ответа")
    return raw
def request(code,on_date,method=METHOD):
    if method not in METHODS:raise ValueError("Метод")
    if type(code) is not int or code<=0:raise ValueError("Внутренний код")
    if date.fromisoformat(on_date).isoformat()!=on_date:raise ValueError("Дата")
    return (f'<soap:Envelope xmlns:soap="{d.SOAP}"><soap:Body><{method} xmlns="{d.NS}"><CredorgNumber>{code}</CredorgNumber><OnDate>{on_date}T00:00:00</OnDate></{method}></soap:Body></soap:Envelope>').encode()
def inspect_xml(raw,method=METHOD):
    if method not in METHODS:raise ValueError("Метод")
    root=d.result(raw,method)
    if not len(root) and not (root.text or "").strip():raise ValueError("Пустой результат формы")
    # Treat escaped XML and nested XML equally, but never interpret an unknown field as capital.
    if not len(root) and root.text and root.text.strip():
        import xml.etree.ElementTree as ET
        payload=root.text.strip()
        if re.search(r"<!\s*(?:DOCTYPE|ENTITY)",payload,re.I):raise ValueError("Недопустимый XML")
        root=ET.fromstring(payload)
    tags=Counter();structures=Counter();stack=[(root,0)]
    while stack:
        n,depth=stack.pop()
        if depth>40:raise ValueError("Глубина XML")
        tags[n.tag]+=1
        signature=json.dumps([n.tag,sorted(n.attrib),sorted(set(ch.tag for ch in n))],ensure_ascii=False)
        structures[signature]+=1
        if len(tags)>500 or len(structures)>1000:raise ValueError("Слишком много структур")
        stack.extend((ch,depth+1) for ch in n)
    return dict(sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),root=root.tag,tags=dict(sorted(tags.items())),structures=[{"shape":json.loads(k),"count":v} for k,v in sorted(structures.items())])
class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.links=set()
    def handle_starttag(self,tag,attrs):
        for key,val in attrs:
            if key not in ("href","data-href","data-url","data-link","value") or not val:continue
            url=urljoin(CATALOG,val)
            if allowed(url) and re.search(r"\.(zip|rar|7z|dbf)$",urlsplit(url).path,re.I):self.links.add(url)
def archive_links(raw):
    p=Links();p.feed(raw.decode("utf-8"));p.close()
    return sorted(p.links)
def inspect_dbf(raw):
    import struct
    if len(raw)<33:raise ValueError("Короткий DBF")
    rows,head,record=struct.unpack_from("<IHH",raw,4)
    if head<33 or head>len(raw) or record<1 or raw[head-1]!=13 or (head-33)%32 or head+rows*record>len(raw):raise ValueError("Структура DBF")
    fields=[]
    for pos in range(32,head-1,32):
        name=raw[pos:pos+11].split(b"\0",1)[0].decode("ascii")
        if not re.fullmatch(r"[A-Za-z0-9_]+",name):raise ValueError("Имя поля")
        fields.append(dict(name=name,type=chr(raw[pos+11]),length=raw[pos+16],decimals=raw[pos+17]))
    if len({f["name"] for f in fields})!=len(fields) or sum(f["length"] for f in fields)+1!=record:raise ValueError("Длина записи DBF")
    return dict(rows=rows,fields=fields,sha256=hashlib.sha256(raw).hexdigest())
# Exact source columns; these are deliberately not interpreted as financial measures.
TABLES={
    "123":{"123B":("REGN",),"123D":("REGN","C1","C3"),"123N":("C0","C1","C2_1","C2_2","C2_3")},
    "135":{"135B":("REGN","DT","REGN_S","OGRN"),"135_3":("REGN","C1_3","C2_3","C3_3","C4_3")},
}
def selected_rows(raw,fields):
    import struct
    meta=inspect_dbf(raw)
    count,head,width=struct.unpack_from("<IHH",raw,4)
    wanted=set(fields)
    offsets={};pos=1
    for f in meta["fields"]:
        if f["name"] in wanted:offsets[f["name"]]=(pos,f)
        pos+=f["length"]
    if set(offsets)!=wanted or count>100000:raise ValueError("Неожиданная структура исходных полей")
    rows=[];deleted=0;non_numeric=0
    for i in range(count):
        record=raw[head+i*width:head+(i+1)*width]
        if record[:1]==b"*":deleted+=1;continue
        if record[:1]!=b" ":raise ValueError("Маркер записи DBF")
        row={"source_row":i+1}
        for key in fields:
            offset,f=offsets[key]
            cell=record[offset:offset+f["length"]].strip(b" \x00")
            if not cell:row[key]=None;continue
            try:value=cell.decode("ascii")
            except UnicodeDecodeError:
                # Preserve original text bytes until encoding is confirmed.
                value={"hex":cell.hex()}
            if f["type"]=="N" and (not isinstance(value,str) or not re.fullmatch(r"[+-]?\d+(?:\.\d+)?",value)):
                non_numeric+=1
            row[key]=value
        rows.append(row)
    if len(rows)+deleted!=count:raise ValueError("Баланс строк DBF")
    return dict(sha256=meta["sha256"],language_driver=raw[29],source_rows=count,deleted=deleted,non_numeric_cells=non_numeric,fields=[f for f in meta["fields"] if f["name"] in wanted],rows=rows)

def raw_table(form,member,raw,tables):
    match=re.fullmatch(r"\d{6}_([A-Za-z0-9_]+)\.dbf",Path(member).name,re.I)
    if not match:return
    key=match.group(1).upper()
    if key not in TABLES[form]:return
    if key in tables:raise ValueError("Дублирующая исходная таблица")
    tables[key]=dict(member=member,**selected_rows(raw,TABLES[form][key]))

def raw_report(form,entry,info,tables):
    if set(tables)!=set(TABLES[form]):raise ValueError("Неполный комплект таблиц формы")
    source_hashes={m["member"]:m["sha256"] for m in info["members"]}
    if any(source_hashes.get(t["member"])!=t["sha256"] for t in tables.values()):raise ValueError("Разные отпечатки таблиц")
    def reg(row):
        v=row["REGN"]
        if not isinstance(v,str) or not re.fullmatch(r"\d{1,6}",v):return None
        return str(int(v))
    bank=tables[form+"B"]["rows"]
    values=tables["123D" if form=="123" else "135_3"]["rows"]
    bank_ids={reg(r) for r in bank}-{None}
    value_ids={reg(r) for r in values}-{None}
    code="C1" if form=="123" else "C1_3"
    codes=sorted({r[code] for r in values if isinstance(r[code],str)})
    return dict(schema=1,status="raw_unmapped",note="Исходные поля DBF без установленных единиц и экономической интерпретации; число строк не число банков. Не использовать для расчёта нормативов.",**entry,archive_sha256=info["sha256"],tables=tables,coverage=dict(directory_unique_regn=len(bank_ids),values_unique_regn=len(value_ids),matched_unique_regn=len(bank_ids&value_ids),unmatched_regn=sorted(value_ids-bank_ids,key=int),invalid_directory_regn=sum(reg(r) is None for r in bank),invalid_values_regn=sum(reg(r) is None for r in values),source_codes=codes))

FORM135_FORMAT="https://www.cbr.ru/Content/Document/File/149491/135-20230601.pdf"
def mapped135(diagnostic):
    """Documented section 3 values, no regulatory compliance inference."""
    if diagnostic["form"]!="135" or diagnostic["status"]!="raw_unmapped":raise ValueError("Не форма 135")
    table=diagnostic["tables"]["135_3"]
    directory=diagnostic["tables"]["135B"]
    expected={"REGN":("N",4,0),"C1_3":("C",6,0),"C2_3":("N",19,3),"C3_3":("N",19,3),"C4_3":("C",12,0)}
    if {f["name"]:(f["type"],f["length"],f["decimals"]) for f in table["fields"]}!=expected:raise ValueError("Формат 135 изменился")
    def reg(v):
        return str(int(v)) if isinstance(v,str) and re.fullmatch(r"\d{1,6}",v) and int(v)>0 else None
    def percent(v):
        if v is None:return None
        if not isinstance(v,str) or not re.fullmatch(r"[+-]?\d+(?:\.\d{1,3})?",v):raise ValueError("Некорректное процентное поле")
        return v
    def code(v):
        if isinstance(v,str) and v:return v
        if isinstance(v,dict) and set(v)=={"hex"} and re.fullmatch(r"(?:[0-9a-f]{2}){1,6}",v["hex"]):return "hex:"+v["hex"]
        raise ValueError("Код норматива отсутствует")
    banks={}
    for r in directory["rows"]:
        key=reg(r["REGN"])
        if key is None:continue
        banks.setdefault(key,[]).append(r)
    candidates=[];excluded=Counter()
    for r in table["rows"]:
        try:
            key=reg(r["REGN"])
            if key is None or len(banks.get(key,[]))!=1:raise ValueError("Неоднозначный номер")
            bank=banks[key][0]
            dt=bank["DT"]
            if not isinstance(dt,str) or not re.fullmatch(r"\d{8}",dt):raise ValueError("Нет отчётной даты")
            period=datetime.strptime(dt,"%Y%m%d").date().isoformat()
            if period!=diagnostic["date"]:raise ValueError("Дата отличается от архива")
            c=code(r["C1_3"]);actual=percent(r["C2_3"]);control=percent(r["C3_3"])
            if actual is None and control is None:raise ValueError("Оба значения отсутствуют")
            candidates.append(dict(registration_number=key,registration_number_source=bank["REGN_S"],ogrn=bank["OGRN"],date=period,code=c,actual_percent=actual,control_percent=control,note_code=r["C4_3"],source_row=r["source_row"],directory_row=bank["source_row"]))
        except (ValueError,KeyError,TypeError) as e:excluded[str(e)]+=1
    counts=Counter((r["registration_number"],r["code"]) for r in candidates)
    rows=[r for r in candidates if counts[(r["registration_number"],r["code"])]==1]
    duplicates=len(candidates)-len(rows)
    if duplicates:excluded["Неоднозначная пара банк–код"]+=duplicates
    if len(rows)+sum(excluded.values())!=len(table["rows"]):raise ValueError("Баланс нормализованных строк")
    return dict(schema=1,status="documented_fields",form="0409135",section=3,date=diagnostic["date"],source=diagnostic["url"],format_source=FORM135_FORMAT,archive_sha256=diagnostic["archive_sha256"],table_sha256=table["sha256"],directory_sha256=directory["sha256"],language_driver=table["language_driver"],note="Фактическое и контрольное значения в процентах; направление ограничения и расшифровка кодов не установлены. hex: сохраняет исходные байты кода. Не рейтинг и не вывод о нарушении.",counts=dict(source_active_rows=len(table["rows"]),observations=len(rows),organizations=len({r["registration_number"] for r in rows}),codes=len({r["code"] for r in rows}),raw_byte_codes=sum(r["code"].startswith("hex:") for r in rows),excluded=dict(excluded)),rows=rows)

def inspect_zip(raw,on_member=None):
    out=[]
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        members=z.infolist()
        if len(members)>100 or sum(x.file_size for x in members)>100*1024*1024:raise ValueError("Размер распаковки")
        for member in members:
            if member.filename.lower().endswith(".dbf"):
                data=z.read(member)
                out.append(dict(member=member.filename,**inspect_dbf(data)))
                if on_member is not None:on_member(member.filename,data)
    if not out:raise ValueError("Нет DBF")
    return dict(sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),members=out)
def archive_candidates(links):
    """Use only exact dated official archive links observed in the catalogue."""
    result=[]
    for form in ("123","135"):
        candidates=[]
        for url in links:
            if not allowed(url):continue
            u=urlsplit(url)
            if u.query:continue
            m=re.fullmatch(r"/vfs/credit/forms/"+form+r"-(\d{8})\.(zip|rar)",u.path,re.I)
            if not m:continue
            try:day=datetime.strptime(m.group(1),"%Y%m%d").date()
            except ValueError:continue
            if day>date.today():continue
            candidates.append((day,url))
        if candidates:
            day,url=max(candidates)
            result.append(dict(form=form,date=day.isoformat(),url=url))
    return result

MAX_RAR_OUTPUT=100*1024*1024
def bounded_tar(args,limit):
    """Read libarchive stdout with a hard file-size limit; never extract paths to disk."""
    import resource
    def restrict():
        resource.setrlimit(resource.RLIMIT_FSIZE,(limit,limit))
    with tempfile.TemporaryFile() as output:
        subprocess.run(["bsdtar",*args],stdout=output,stderr=subprocess.DEVNULL,stdin=subprocess.DEVNULL,timeout=25,check=True,preexec_fn=restrict)
        output.seek(0)
        raw=output.read(limit+1)
    if len(raw)>limit:raise ValueError("Размер распаковки RAR")
    return raw

def inspect_rar(raw,reader=bounded_tar,on_member=None):
    if not raw.startswith((b"Rar!\x1a\x07\x00",b"Rar!\x1a\x07\x01\x00")):raise ValueError("Сигнатура RAR")
    if not 0<len(raw)<=MAX_ARCHIVE:raise ValueError("Размер RAR")
    with tempfile.TemporaryDirectory() as folder:
        archive=Path(folder)/"report.rar";archive.write_bytes(raw)
        names=reader(["-tf",str(archive)],256*1024).decode("utf-8",errors="strict").splitlines()
        if not names or len(names)>100 or len(names)!=len(set(names)):raise ValueError("Список RAR")
        out=[];total=0
        for name in names:
            if not re.fullmatch(r"[A-Za-z0-9_./-]{1,200}",name) or name.startswith(("/","-")) or any(p in ("",".","..") for p in name.rstrip("/").split("/")):raise ValueError("Недопустимое имя RAR")
            if not name.lower().endswith(".dbf"):continue
            remain=MAX_RAR_OUTPUT-total
            if remain<=0:raise ValueError("Размер распаковки RAR")
            data=reader(["-xOf",str(archive),"--",name],remain)
            total+=len(data)
            if total>MAX_RAR_OUTPUT:raise ValueError("Размер распаковки RAR")
            out.append(dict(member=name,**inspect_dbf(data)))
            if on_member is not None:on_member(name,data)
        if not out:raise ValueError("Нет DBF")
    return dict(sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),members=out)

def main():
    p=argparse.ArgumentParser();p.add_argument("--output",type=Path,required=True);args=p.parse_args()
    out=args.output;out.mkdir(parents=True,exist_ok=True)
    stamp=datetime.now(timezone.utc).isoformat()
    report=dict(checked=stamp,catalog=CATALOG,archives=[],soap=[],errors=[])
    try:
        raw=get(CATALOG,MAX_PAGE);report["catalog_sha256"]=hashlib.sha256(raw).hexdigest()
        links=archive_links(raw);report["archive_links"]=links
        # One latest explicitly listed archive per form; no guessed addresses.
        for entry in archive_candidates(links):
            url=entry["url"]
            try:
                data=get(url,MAX_ARCHIVE)
                tables={}
                def capture(member,raw):raw_table(entry["form"],member,raw,tables)
                info=inspect_rar(data,on_member=capture) if urlsplit(url).path.lower().endswith(".rar") else inspect_zip(data,on_member=capture)
                diagnostic=raw_report(entry["form"],entry,info,tables)
                filename="form-"+entry["form"]+"-raw.json"
                (out/filename).write_text(json.dumps(diagnostic,ensure_ascii=False,indent=2),encoding="utf-8")
                details=dict(entry,**info,raw_file=filename,raw_coverage=diagnostic["coverage"])
                if entry["form"]=="135":
                    try:
                        mapped=mapped135(diagnostic)
                        (out/"form-135-documented.json").write_text(json.dumps(mapped,ensure_ascii=False,indent=2),encoding="utf-8")
                        details.update(mapped_file="form-135-documented.json",mapped_counts=mapped["counts"],language_driver=mapped["language_driver"])
                    except (ValueError,KeyError,TypeError) as e:details["mapping_error"]=str(e)[:300]
                report["archives"].append(details)
            except Exception as e:report["archives"].append(dict(entry,error=str(e)[:300]))
    except Exception as e:report["errors"].append("catalog: "+str(e)[:300])
    try:
        raw,enc=registry.fetch();system=registry.parse(raw,enc)
        for bank in sorted(system["rows"],key=lambda r:int(r["registration_number"]))[:2]:
            reg=bank["registration_number"];entry=dict(registration_number=reg,name=bank["name"])
            try:
                mapping_raw=d.fetch("RegNumToIntCode","RegNumber",reg);code=d.mapping(mapping_raw)
                reverse=d.fetch("IntCodeToRegNum","IntNumber",code)
                if d.reverse_mapping(reverse)!=int(reg):raise ValueError("Обратное сопоставление не совпало")
                entry.update(internal_code=code,mapping_sha256=d.hash_raw(mapping_raw),reverse_sha256=d.hash_raw(reverse))
                entry["forms"]={}
                for form,methods in [("123",[METHOD]),("135",["Data135FormFullXML","Data135MetaFullXML"])]:
                    item={};entry["forms"][form]=item
                    try:
                        dates_raw=d.fetch("GetDatesForF"+form,"CredprgNumber",code);dates=d.dates(dates_raw,form,stamp)
                        item["dates_sha256"]=d.hash_raw(dates_raw);item["date_count"]=len(dates)
                        if not dates:continue
                        item["report_date"]=dates[0];item["methods"]={}
                        for method in methods:
                            try:
                                data=get(d.SOURCE,d.MAX,request(code,dates[0],method),{"Content-Type":"text/xml; charset=utf-8","SOAPAction":'"'+d.NS+method+'"'})
                                structure=inspect_xml(data,method)
                                item["methods"][method]=structure
                                (out/(method+"-"+reg+".xml")).write_bytes(data)
                                if form=="123":
                                    entry["structure"]=structure
                                    (out/("form123-"+reg+".xml")).write_bytes(data)
                            except Exception as e:item["methods"][method]={"error":str(e)[:300]}
                    except Exception as e:item["error"]=str(e)[:300]
            except Exception as e:entry["error"]=str(e)[:300]
            report["soap"].append(entry)
    except Exception as e:report["errors"].append("soap: "+str(e)[:300])
    (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False),flush=True)
    if not any("members" in x for x in report["archives"]) and not any("structure" in x for x in report["soap"]) and not any("sha256" in m for x in report["soap"] for v in x.get("forms",{}).values() for m in v.get("methods",{}).values()):raise SystemExit("Не получена структура форм 123 или 135")
if __name__=="__main__":main()
