"""Bounded read-only acceptance probe; never modifies the production archive."""
import argparse,json,re,ssl
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit,quote,unquote
from urllib.request import HTTPSHandler,build_opener
from urllib.error import HTTPError
import historical as h
import rosstat_workbooks as w
import source_transport as t

HOSTS=("rosstat.gov.ru","www.rosstat.gov.ru")
CATALOG_PATHS=frozenset(urlsplit(url).path for url in w.CATALOGS.values())
def workbook_path(path):
    decoded=unquote(path)
    return decoded.startswith("/storage/mediabank/") and not any(part in (".","..") for part in decoded.split("/")) and not any(c in decoded for c in ("\\","?","#")) and decoded.lower().endswith((".xls",".xlsx"))
def encoded_url(url):
    p=urlsplit(url)
    if p.query or p.fragment:raise ValueError("Unexpected URL query or fragment")
    return urlunsplit((p.scheme,p.netloc,quote(p.path,safe="/%:@!()*+,;=-._~"),"",""))
def fetch(url,kind):
    check=(lambda p:p in CATALOG_PATHS) if kind=="catalogue" else workbook_path
    allowed=lambda u:t.url_allowed(u,HOSTS,check) and not urlsplit(u).query
    url=encoded_url(url)
    if not allowed(url):raise ValueError("Outside Rosstat probe policy")
    context=ssl.create_default_context()
    cert=Path(__file__).with_name("rosstat-root.pem")
    if cert.exists():context.load_verify_locations(cafile=str(cert))
    opener=build_opener(HTTPSHandler(context=context),t.GuardedRedirect(allowed))
    return t.download(url,hosts=HOSTS,path_check=check,timeout=18,max_bytes=5000000 if kind=="catalogue" else 12000000,opener=opener)
def select(group,links):
    patterns={
        "capital":r"степень износа основных фондов|коэффициент обновления основных фондов|коэффициент выбытия основных фондов|наличие основных фондов",
        "capacity":r"использовани[ея] среднегодовой производственной мощности",
        "cost":r"затрат[ыа] на производство и (?:реализацию|продажу)",
        "debt":r"финансовое состояние организаций|задолженность организаций"}[group]
    options=[]
    for f in w.candidates(group,links):
        p=urlsplit(f["url"])
        if not workbook_path(p.path) or p.hostname not in HOSTS or p.query or p.fragment:continue
        if f.get("title_origin") not in ("anchor","container"):continue
        title=h.norm(f["title"])
        if not re.search(patterns,title):continue
        if group=="capital" and "видам экономической деятельности" not in title:continue
        options.append(f)
    return sorted(options,key=lambda f:f["url"])[0] if options else None
def probe(fetcher=fetch,year=None,parser=w.parse):
    year=year or datetime.now(timezone.utc).year
    report=[]
    blocked=False
    for group,url in w.CATALOGS.items():
        item={"group":group,"catalogue":url,"status":"skipped_access_restriction" if blocked else "catalogue_failed"}
        report.append(item)
        if blocked:continue
        try:
            cat=fetcher(url,"catalogue")
            links=h.discover(cat.raw.decode(cat.charset,errors="replace"),cat.final_url)
            item.update(catalogue_sha256=cat.sha256,candidates=len(w.candidates(group,links)),status="no_matching_candidate")
            candidate=select(group,links)
            if not candidate:continue
            item.update(workbook=candidate["url"],title=candidate["title"],status="workbook_failed")
            payload=fetcher(candidate["url"],"workbook")
            item.update(workbook_sha256=payload.sha256,final_url=payload.final_url,status="parse_rejected")
            rows=parser(payload.raw,group,candidate["url"],year)
            if not rows:raise ValueError("Empty accepted workbook")
            item.update(status="accepted",observations=len(rows),metrics=sorted(set(r["metric"] for r in rows)))
        except HTTPError as e:
            item.update(http_status=e.code,error=type(e).__name__)
            if e.code in (401,403,429):blocked=True
        except Exception as e:
            item.update(error=type(e).__name__,detail=str(e)[:220])
    return {"schema":1,"scope":"read_only_isolated_network_probe","built":datetime.now(timezone.utc).isoformat(),"results":report}
def main():
    ap=argparse.ArgumentParser();ap.add_argument("--output",type=Path,required=True);args=ap.parse_args()
    report=probe()
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    for item in report["results"]:print("ROSSTAT_PROBE",json.dumps(item,ensure_ascii=False))
    if any(i["status"]!="accepted" for i in report["results"]):raise SystemExit("Full live acceptance not established; see report")
if __name__=="__main__":main()
