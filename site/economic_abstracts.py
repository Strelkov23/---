"""Conservative abstract ingestion from already retrieved Crossref records.
No new requests. Only explicitly active, unambiguous CC BY 4.0 version-of-record
license declarations; no TDM-only licenses, no inferred rights from OA status.
"""
import re
from datetime import date
from html.parser import HTMLParser
LICENSE="https://creativecommons.org/licenses/by/4.0/"
class Plain(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ("script","style"):self.skip+=1
        elif not self.skip:self.parts.append(" ")
    def handle_endtag(self,tag):
        if tag in ("script","style"):self.skip=max(0,self.skip-1)
        elif not self.skip:self.parts.append(" ")
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)
def accepted(licenses,stamp):
    try:day=date.fromisoformat(stamp[:10])
    except (ValueError,TypeError):return False
    vor=[r for r in licenses if isinstance(r,dict) and str(r.get("version","")).lower()=="vor"]
    if not vor:return False
    active=[]
    for r in vor:
        try:start=date.fromisoformat(r["start"])
        except (ValueError,TypeError,KeyError):return False
        if start<=day:active.append(r)
    return bool(active) and all(r.get("url") in (LICENSE,LICENSE.rstrip("/"),LICENSE.replace("https:","http:"),LICENSE.replace("https:","http:").rstrip("/")) for r in active)
def extract(item,access,stamp):
    raw=item.get("abstract")
    if not isinstance(raw,str) or not 0<len(raw)<=24000 or not accepted(access.get("licenses",[]),stamp):return None
    authors=item.get("author")
    if not isinstance(authors,list) or not any(isinstance(a,dict) and (a.get("family") or a.get("name")) for a in authors):return None
    p=Plain();p.feed(raw);p.close()
    s=" ".join("".join(p.parts).split())
    if not s or len(s)>4000:return None
    return dict(text=s,license=LICENSE,checked=stamp,source="Crossref",scope="publisher-declared version of record; formatting normalized")
def eligible(paper,stamp):
    a=paper.get("licensed_abstract")
    return isinstance(a,dict) and a.get("license")==LICENSE and isinstance(a.get("text"),str) and 0<len(a["text"])<=4000 and bool(str(paper.get("authors") or "").strip()) and accepted((paper.get("access") or {}).get("licenses",[]),stamp)
