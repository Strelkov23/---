"""Validate published datasets, inventory and checksums. No network access."""
import hashlib
import json
import math
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit
import link_audit

REQUIRED=("archive.json","literature.json","compare.json","catalog.json","stats.json",
          "industry.json","cbr.json","sectors.json","status.json","links.json","national.json")
def finite(x):
    return type(x) in (int,float) and math.isfinite(x)
def http_url(x):
    try:
        u=urlsplit(x)
        return u.scheme in ("https","http") and bool(u.hostname)
    except (TypeError,ValueError):return False

def check(out,previous,stamp):
    issues=[]; warnings=[]; data={}; hashes={}
    for name in REQUIRED:
        try:
            b=(out/name).read_bytes()
            data[name]=json.loads(b)
            hashes[name]={"sha256":hashlib.sha256(b).hexdigest(),"bytes":len(b)}
        except (OSError,ValueError) as err:issues.append(f"{name}: {type(err).__name__}")
    counts={}
    if issues:return {"built":stamp,"errors":issues,"warnings":warnings,"counts":counts,"files":hashes}
    archive=data["archive.json"]
    papers=data["literature.json"]["articles"]
    compare=data["compare.json"]
    catalog=data["catalog.json"]
    industry=data["industry.json"]
    cbr=data["cbr.json"]
    status=data["status.json"]
    counts.update(archive=len(archive),papers=len(papers),indicators=len(catalog),
                  indicators_with_data=sum(bool(s["values"]) for s in compare.values()),
                  monthly_industry=len(industry),monthly_industry_verified=sum(bool(r.get("verified")) for r in industry))
    for name,records,key in (("archive",archive,"url"),("literature",papers,"doi"),("industry",industry,"period")):
        keys=[r.get(key) for r in records]
        if not all(isinstance(x,str) and x.strip() for x in keys) or len(set(keys))!=len(keys):
            issues.append(f"{name}: отсутствуют или повторяются ключи {key}")
    if any(not http_url(r.get("url")) for r in archive):issues.append("archive: некорректный URL")
    if set(catalog)!=set(compare):issues.append("catalog и compare: несовпадение кодов")
    if any(not finite(v) for s in compare.values() for v in s["values"].values()):
        issues.append("compare: нечисловые наблюдения")
    if any(not finite(r.get("value")) or not http_url(r.get("url")) for r in industry):
        issues.append("industry: некорректное значение или ссылка")
    if counts["indicators_with_data"]<counts["indicators"]:
        warnings.append(f"Без наблюдений: {counts['indicators']-counts['indicators_with_data']} годовых рядов")
    if counts["monthly_industry_verified"]<counts["monthly_industry"]:
        warnings.append("Часть месячных данных унаследована из архива и не подтверждена повторно")
    for code,s in cbr.items():
        rows=s["values"]; counts["cbr_"+code]=len(rows)
        if len({r["date"] for r in rows})!=len(rows) or any(not finite(r["value"]) for r in rows):
            issues.append("cbr: некорректные наблюдения "+code)
        if not rows:warnings.append("Банк России: нет наблюдений "+code)
    nat=data["national.json"]
    counts["national_series"]=len(nat)
    counts["national_observations"]=sum(len(s["values"]) for s in nat.values())
    for code,s in nat.items():
        rows=s["values"]
        if len({r["period"] for r in rows})!=len(rows) or any(not finite(r["value"]) or not http_url(r["source"]) for r in rows):issues.append("national: некорректные наблюдения "+code)
        if not rows:warnings.append("Российская статистика: нет наблюдений "+code)
    for day in status.get("days",[]):
        if not day.get("error") and day.get("expected")!=day.get("stored"):
            issues.append("Правовой архив: число карточек расходится "+day["day"])
    warnings.extend(str(x) for x in status.get("failures",[]))
    # Preserve earlier archival records. Source failures must not erase the archive.
    for name,current,key in (("archive.json",archive,"url"),("literature.json",papers,"doi")):
        try:
            old=json.loads((previous/name).read_text())
        except (OSError,ValueError):
            continue
        if name=="literature.json":old=old.get("articles",[])
        removed={r[key] for r in old}-{r[key] for r in current}
        if removed:issues.append(f"{name}: исчезло {len(removed)} архивных записей")
    internal,_=link_audit.scan(out)
    if internal:issues.extend(f"{p}: {u} ({e})" for p,u,e in internal)
    counts["internal_link_errors"]=len(internal)
    return {"built":stamp,"errors":issues,"warnings":warnings,"counts":counts,"files":hashes}

def publish(out,previous,stamp):
    # Include the new report itself in link resolution before writing it.
    target=out/"quality.json";target.write_text("{}",encoding="utf-8")
    report=check(out,previous,stamp)
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False),encoding="utf-8")
    print("Quality gate:",json.dumps({"errors":report["errors"],"warnings":report["warnings"],"counts":report["counts"]},ensure_ascii=False))
    if report["errors"]:raise SystemExit("Quality gate rejected the build; previous site is unchanged.")
