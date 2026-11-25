"""Shared bounded HTTPS transport for explicitly configured public data sources.
Does not retry access denials, infer schemas, disable TLS, or authenticate.
Parsers and their economic definitions remain source-specific.
"""
from dataclasses import dataclass
from urllib.parse import urlsplit
from urllib.request import Request,build_opener,HTTPRedirectHandler
import hashlib

@dataclass(frozen=True)
class Payload:
    raw:bytes
    requested_url:str
    final_url:str
    sha256:str
    charset:str
    media_type:str

def url_allowed(url,hosts,path_check=None):
    try:
        if not isinstance(url,str) or len(url)>4096 or any(ord(c)<32 or c==" " for c in url):return False
        p=urlsplit(url)
        return (p.scheme=="https" and p.hostname in hosts and p.port in (None,443)
                and p.username is None and p.password is None and not p.fragment
                and (path_check is None or bool(path_check(p.path))))
    except (ValueError,TypeError):return False

class GuardedRedirect(HTTPRedirectHandler):
    def __init__(self,allowed):
        super().__init__();self.allowed=allowed
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if not self.allowed(newurl):raise ValueError("Перенаправление за пределы разрешённого источника")
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def download(url,*,hosts,max_bytes,timeout=20,path_check=None,opener=None):
    if type(max_bytes) is not int or not 0<max_bytes<=100_000_000 or not 0<timeout<=60:
        raise ValueError("Некорректный лимит загрузки")
    allowed=lambda value:url_allowed(value,hosts,path_check)
    if not allowed(url):raise ValueError("URL не входит в паспорт источника")
    request=Request(url,headers={"User-Agent":"EconomicsMonitor/3.0","Accept-Encoding":"identity"})
    client=opener or build_opener(GuardedRedirect(allowed))
    with client.open(request,timeout=timeout) as response:
        final=response.geturl()
        if not allowed(final):raise ValueError("Конечный URL вне паспорта источника")
        if response.status!=200:raise ValueError("Неполный HTTP ответ")
        if response.headers.get("Content-Encoding","identity").lower()!="identity":raise ValueError("Неожиданное кодирование HTTP")
        size=response.headers.get("Content-Length")
        if size is not None and (not size.isdigit() or not 0<int(size)<=max_bytes):raise ValueError("Недопустимый размер источника")
        raw=response.read(max_bytes+1)
        if not 0<len(raw)<=max_bytes or size is not None and len(raw)!=int(size):raise ValueError("Пустой, неполный или слишком большой источник")
        return Payload(raw,url,final,hashlib.sha256(raw).hexdigest(),response.headers.get_content_charset() or "utf-8",response.headers.get_content_type())
