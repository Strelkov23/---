"""Read-only diagnostics of the three already configured regional archives."""
import argparse,csv,io,json,zipfile,collections,re
from pathlib import Path
from urllib.parse import urlsplit
from urllib.error import HTTPError
import historical as h
import source_transport as t

SECTIONS=("agriculture","ict","foreign_trade")
def fetch(section):
    if section not in SECTIONS:raise ValueError("Unknown section")
    url=h.mirror_url(section);p=urlsplit(url)
    return t.download(url,hosts=(p.hostname,),path_check=lambda path:path==p.path,max_bytes=35_000_000,timeout=30)
def inspect(raw,section):
    if section not in SECTIONS:raise ValueError("Unknown section")
    report=[];scanned=0
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        members=[m for m in z.infolist() if not m.is_dir() and m.filename.lower().endswith(".csv")]
        if not members or len(members)>40 or sum(m.file_size for m in members)>200_000_000:raise ValueError("CSV archive outside bounds")
        for m in members:
            with z.open(m) as stream:
                reader=csv.DictReader(io.TextIOWrapper(stream,encoding="utf-8-sig"),delimiter=";")
                header=reader.fieldnames or [];fields={h.norm(k):k for k in header}
                if len(fields)!=len(header):raise ValueError("Duplicate header")
                # Inspect labels only: do not guess or export numeric values.
                def field(*names):return next((fields[n] for n in names if n in fields),None)
                title=field("indicator","indicator_name","indicator_title","показатель","название показателя","name_indicator")
                unit=field("unit","units","единица измерения","единица","measure","indicator_unit")
                year=field("year","год")
                region=field("region","region_name","territory","территория","регион","name_region","object_name")
                counts=collections.Counter();years=set();regions=set();n=0
                for r in reader:
                    scanned+=1;n+=1
                    if scanned>1_500_000:raise ValueError("Row limit")
                    if None in r or any(v is None for v in r.values()):raise ValueError("Invalid row width")
                    if title and r[title].strip():
                        key=(r[title].strip(),r[unit].strip() if unit else "")
                        counts[key]+=1
                        if len(counts)>10000:raise ValueError("Too many distinct labels")
                    if year and h.year(r[year]):years.add(h.year(r[year]))
                    if region and r[region].strip():regions.add(r[region].strip())
                matches=[(k,v) for k,v in counts.items() if any(re.search(p,h.norm(k[0])) for p in h.MIRROR_PRIORITY[section])]
                report.append(dict(member=m.filename,headers=header,rows=n,periods=sorted(years),territory_labels=len(regions),distinct_labels=len(counts),matching_labels=len(matches),labels=[dict(title=k[0],unit=k[1],rows=v) for k,v in sorted(counts.items())[:500]],labels_truncated=len(counts)>500))
    return report
def probe(fetcher=fetch):
    items=[];blocked=False
    for section in SECTIONS:
        item=dict(section=section,url=h.mirror_url(section),status="skipped_access_restriction" if blocked else "failed");items.append(item)
        if blocked:continue
        try:
            payload=fetcher(section)
            item.update(sha256=payload.sha256,members=inspect(payload.raw,section),status="inspected")
        except HTTPError as e:
            item.update(http_status=e.code)
            if e.code in (401,403,429):blocked=True
        except Exception as e:item.update(error=type(e).__name__,detail=str(e)[:250])
    return dict(schema=1,scope="metadata_only_no_import",results=items)
def main():
    p=argparse.ArgumentParser();p.add_argument("--output",required=True,type=Path);args=p.parse_args()
    report=probe()
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    for item in report["results"]:
        print("REGIONAL_SCHEMA",json.dumps({**item,"members":[{k:v for k,v in m.items() if k!="labels"} for m in item.get("members",[])]},ensure_ascii=False))
    if any(x["status"]!="inspected" for x in report["results"]):raise SystemExit("Incomplete diagnostic")
if __name__=="__main__":main()
