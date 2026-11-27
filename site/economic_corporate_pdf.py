"""Exact, page-specific PDF table adapter. No OCR, no arbitrary PDF links.
The source is the 2024 electricity division report, printed p.10 / PDF page 7.
Output is candidate numeric evidence, never automatic replacement of statistics.
"""
import json,re,math,hashlib,subprocess,tempfile,resource
from pathlib import Path
from datetime import timedelta
from xml.etree import ElementTree as ET
from source_transport import download
from economic_corporate_monitor import check_robots,clock,Blocked
import provenance
FILE="economic-corporate-pdf.json"
URL="https://www.report.rosatom.ru/go/2024/rea_2024.pdf"
PAGE=7
YEARS=(2021,2022,2023,2024)
NOTE="Пилот: таблица выработки АЭС из отчёта электроэнергетического дивизиона Росатома за 2024 год, печатная стр. 10 (страница PDF 7). Извлечение только текстового слоя. Сравнение с ручным архивом — проверка переноса, не независимый аудит. Подтверждённый архив не изменяется."
LABEL="выработка электроэнергии на аэс, млрд квт·ч"
def normalize(s):
    return " ".join(s.casefold().replace("ё","е").replace("•","·").replace("⋅","·").replace("∙","·").split())
def parse_lines(lines):
    clean=[normalize(x) for x in lines]
    headers=[i for i,x in enumerate(clean) if re.fullmatch(r"операционные показатели деятельности дивизиона\s+2021\s+2022\s+2023\s+2024",x)]
    if len(headers)!=1:raise ValueError("Exact year header not found")
    h=headers[0]
    matches=[]
    for i,x in enumerate(clean):
        if not x.startswith(LABEL):continue
        m=re.fullmatch(re.escape(LABEL)+r"\s+(\d{1,4}[,.]\d{3})\s+(\d{1,4}[,.]\d{3})\s+(\d{1,4}[,.]\d{3})\s+(\d{1,4}[,.]\d{3})",x)
        if not m or not h<i<=h+3:raise ValueError("Ambiguous table row")
        matches.append([float(v.replace(",",".")) for v in m.groups()])
    if len(matches)!=1 or not all(0<=v<=1000 for v in matches[0]):raise ValueError("Unexpected generation table")
    return [dict(year=y,value=v) for y,v in zip(YEARS,matches[0])]
def parse_bbox(raw):
    if len(raw)>2_000_000:raise ValueError("Oversized extraction")
    doc=ET.fromstring(raw);pages=doc.findall(".//{*}page")
    if len(pages)!=1:raise ValueError("Wrong page count")
    page=pages[0];width=float(page.attrib["width"]);height=float(page.attrib["height"])
    if not all(math.isfinite(x) and 100<x<5000 for x in (width,height)):raise ValueError("Invalid page dimensions")
    words=[]
    for e in page.findall(".//{*}word"):
        x,y,X,Y=[float(e.attrib[k]) for k in ("xMin","yMin","xMax","yMax")]
        if not all(math.isfinite(v) for v in (x,y,X,Y)) or x>X or y>Y:raise ValueError("Invalid geometry")
        if 0<=x<X<=width/2 and 0<=y<Y<=height*.64 and e.text:words.append(((y+Y)/2,x,e.text))
    if len(words)>5000:raise ValueError("Too many words")
    # Merge spatially aligned text runs across individual table cells.
    rows=[];tolerance=max(1.0,height*.003)
    for y,x,t in sorted(words):
        if not rows or abs(y-rows[-1][0])>tolerance:rows.append((y,[]))
        rows[-1][1].append((x,t))
    lines=[" ".join(t for _,t in sorted(cells)) for _,cells in rows]
    return parse_lines(lines)
def limits():
    resource.setrlimit(resource.RLIMIT_AS,(768*1024*1024,768*1024*1024))
    resource.setrlimit(resource.RLIMIT_CPU,(20,20))
    resource.setrlimit(resource.RLIMIT_FSIZE,(2_000_000,2_000_000))
def extract(raw):
    if not 0<len(raw)<=40_000_000 or not raw.startswith(b"%PDF-"):raise ValueError("Invalid PDF")
    with tempfile.TemporaryDirectory() as tmp:
        source=Path(tmp)/"source.pdf";target=Path(tmp)/"page.xml";source.write_bytes(raw)
        subprocess.run(["pdftotext","-f",str(PAGE),"-l",str(PAGE),"-bbox-layout","-enc","UTF-8",str(source),str(target)],check=True,timeout=30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,preexec_fn=limits)
        return parse_bbox(target.read_bytes())
def fetch():
    check_robots(URL)
    p=download(URL,hosts=("www.report.rosatom.ru",),path_check=lambda p:p=="/go/2024/rea_2024.pdf",max_bytes=40_000_000,timeout=35)
    if p.final_url!=URL or p.media_type not in ("application/pdf","application/octet-stream"):raise ValueError("Unexpected document")
    return p.sha256,extract(p.raw)
def compare(rows,physical):
    if physical["schema"]!="iv-physical-v1":raise ValueError("Wrong archive")
    c=next(x for x in physical["companies"] if x["id"]=="rosenergoatom")
    if not any(m["id"]=="nuclear_generation" and m["unit"]=="млрд кВт·ч" for m in c["metrics"]):raise ValueError("Wrong metric")
    old={x["year"]:x for x in c["rows"]}
    result=[]
    for r in rows:
        prior=old.get(r["year"]);v=prior.get("nuclear_generation") if prior and (c["verification"]=="source_rechecked" or prior.get("verification")=="source_rechecked") else None
        if type(v) not in (int,float) or not math.isfinite(v):v=None
        residual=r["value"]-v if v is not None else None
        result.append(dict(r,archived=v,residual=residual,status="missing" if residual is None else "match" if abs(residual)<0.0005 else "review"))
    return result
def blank():
    return dict(schema=1,built=None,note=NOTE,url=URL,pdf_page=PAGE,printed_page=10,unit="млрд кВт·ч",checked=None,success=None,status="waiting",sha256=None,rows=[],comparison=[],error=None)
def validate(d):
    if d["schema"]!=1 or d["url"]!=URL or d["note"]!=NOTE or d["pdf_page"]!=PAGE or d["status"] not in ("waiting","extracted","error","blocked"):raise ValueError("Invalid PDF state")
    for f in ("checked","success"):
        if d[f] is not None:clock(d[f])
    if d["rows"]:
        if tuple(r["year"] for r in d["rows"])!=YEARS or not all(type(r["value"]) in (int,float) and math.isfinite(r["value"]) and 0<=r["value"]<=1000 for r in d["rows"]) or not re.fullmatch(r"[a-f0-9]{64}",d["sha256"] or "") or d["success"] is None:raise ValueError("Invalid extraction")
    elif d["success"] is not None:raise ValueError("Missing extraction")
    return True
def advance(d,physical,stamp,refresh,loader=fetch):
    validate(d);now=clock(stamp);d["built"]=stamp
    if refresh and (d["checked"] is None or now-clock(d["checked"])>=timedelta(days=30)):
        d["checked"]=stamp
        try:
            sha,rows=loader()
            proposed=dict(d,sha256=sha,rows=rows,success=stamp,status="extracted",error=None)
            validate(proposed);d=proposed
        except Exception as e:d.update(status="blocked" if isinstance(e,Blocked) else "error",error=type(e).__name__)
    d["comparison"]=compare(d["rows"],physical) if d["rows"] else []
    validate(d);return d
def publish(out,previous,stamp,refresh):
    d=blank();p=previous/FILE
    if p.exists():
        manifest=json.loads((previous/"data-manifest.json").read_text(encoding="utf-8"))
        if provenance.file_info(p)!=manifest["files"].get(FILE):raise ValueError("PDF evidence checksum mismatch")
        d=json.loads(p.read_text(encoding="utf-8"))
    physical=json.loads((out/"independent-physical.json").read_text(encoding="utf-8"))
    d=advance(d,physical,stamp,refresh)
    (out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
