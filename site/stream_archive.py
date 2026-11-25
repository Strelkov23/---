"""Shared bounded disk-streaming transport for existing official ZIP imports.
Raw archives are temporary inputs, not public output. No extraction of member paths.
Existing source-specific document parsing and reconciliation remain authoritative.
"""
import hashlib,os,re,tempfile,zipfile
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request,build_opener
from source_transport import GuardedRedirect,url_allowed

HOSTS=("file.nalog.ru","data.nalog.ru")
CHUNK=1024*1024
PATH=r"/opendata/7707329152-(?:revexp|sshr2019|rsmp)/data-\d{8}-structure-\d{8}\.zip"

def approved(url):
    if not url_allowed(url,HOSTS,lambda p:bool(re.fullmatch(PATH,p))):return False
    return not urlsplit(url).query

def download_zip(url,destination,*,max_bytes,timeout=90,opener=None):
    """Read in bounded chunks; atomically replace destination only after validation."""
    if not approved(url) or type(max_bytes) is not int or not 0<max_bytes<=4*1024**3 or not 0<timeout<=120:
        raise ValueError("Неподтверждённый источник или лимит ZIP")
    original=urlsplit(url).path
    allowed=lambda u:approved(u) and urlsplit(u).path==original
    client=opener or build_opener(GuardedRedirect(allowed)).open
    dest=Path(destination);tmp=None
    digest=hashlib.sha256();total=0
    try:
        with client(Request(url,headers={"User-Agent":"EconomicMonitor/1.0","Accept-Encoding":"identity"}),timeout=timeout) as response:
            if not allowed(response.geturl()) or response.status!=200:
                raise ValueError("Неожиданный ответ ZIP")
            if response.headers.get("Content-Encoding","identity").lower()!="identity":
                raise ValueError("Неожиданное кодирование ZIP")
            expected=response.headers.get("Content-Length")
            if expected is not None:
                if not expected.isdigit() or not 0<int(expected)<=max_bytes:raise ValueError("Размер архива")
                expected=int(expected)
            with tempfile.NamedTemporaryFile(dir=dest.parent,prefix=".archive-",delete=False) as f:
                tmp=Path(f.name)
                while True:
                    raw=response.read(CHUNK)
                    if not raw:break
                    total+=len(raw)
                    if total>max_bytes:raise ValueError("Превышен лимит ZIP")
                    digest.update(raw);f.write(raw)
                if not total or expected is not None and total!=expected:raise ValueError("Неполный ZIP")
                f.flush();os.fsync(f.fileno())
        if not zipfile.is_zipfile(tmp):raise ValueError("Ответ не является ZIP")
        tmp.replace(dest)
        return digest.hexdigest(),total
    finally:
        if tmp is not None:tmp.unlink(missing_ok=True)

def inventory_xml(z,*,max_members,max_member_bytes,max_unpacked,strict):
    """Inspect central directory before reading one bounded XML member at a time."""
    entries=[m for m in z.infolist() if not m.is_dir()]
    xml=[m for m in entries if m.filename.lower().endswith(".xml")]
    if not xml or len(xml)>max_members or len({m.filename for m in xml})!=len(xml):
        raise ValueError("Состав XML архива")
    if strict and len(xml)!=len(entries):raise ValueError("Посторонний файл в архиве")
    if any(not 0<m.file_size<=max_member_bytes or m.flag_bits&1 for m in xml) or sum(m.file_size for m in xml)>max_unpacked:
        raise ValueError("Превышен лимит XML или закрытый файл")
    return xml,len(xml)==len(entries)

def read_member(z,m,limit):
    """Read a bounded member and check full length; ZipExtFile verifies CRC."""
    if not 0<m.file_size<=limit:raise ValueError("Размер XML")
    with z.open(m) as f:
        raw=f.read(m.file_size+1)
        if len(raw)!=m.file_size or f.read(1):raise ValueError("Неполный XML")
    return raw
