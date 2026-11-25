"""Validate published datasets, inventory and checksums. No network access."""
import hashlib
import json
import math
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit
import link_audit

REQUIRED=("archive.json","literature.json","compare.json","catalog.json","stats.json",
          "industry.json","cbr.json","sectors.json","status.json","links.json","national.json","historical.json","industrial.json","sector-passports.json","regional-boundaries.json","food-balance.json","electricity-balance.json","facility-energy.json","sme-regions.json","district-meta.json","freshness.json","stat-revisions.json","consistency.json","finance-workbooks.json","rosstat-workbooks.json","federal-budget.json","regional-manufacturing.json","regional-mining-energy.json","industrial-parks.json","park-certificates.json","frp-snapshot.json","investment-projects.json","amur-projects.json","krasnodar-projects.json","project-coverage.json","enterprise-sources.json","amur-enterprises.json","bank-directory.json","company-sources.json","company-rankings.json")
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
    hist=data["historical.json"]
    counts["historical_series"]=len(hist["series"])
    counts["historical_observations"]=0
    counts["historical_suppressed_legacy_markers"]=hist.get("suppressed_legacy_markers",0)
    if counts["historical_suppressed_legacy_markers"]:warnings.append("Исторические ряды: исключено служебных кодов пропусков и конфиденциальности "+str(counts["historical_suppressed_legacy_markers"]))
    counts["official_files"]=sum(len(s["files"]) for s in hist["sources"])
    for s in hist["series"]:
        path=out/s["file"]
        try:
            raw=path.read_bytes()
            h=json.loads(raw)
            rows=h["values"]
            if any(h.get(k)!=s.get(k) for k in ("title","unit","kind","source")):raise ValueError("Метаданные ряда расходятся с каталогом")
            if not rows or len(rows)!=s["count"] or len({(r["region"],r["year"]) for r in rows})!=len(rows) or any(not finite(r["value"]) or type(r["year"]) is not int for r in rows):raise ValueError("Некорректные наблюдения")
            if s.get("regions")!=len({r["region"] for r in rows}) or s.get("first")!=min(r["year"] for r in rows) or s.get("last")!=max(r["year"] for r in rows):raise ValueError("Охват ряда расходится с каталогом")
            if "tochno-st-catalog/Rosstat/" in s["source"] and any(r["value"] in (-77777777,-99999999) for r in rows):raise ValueError("Служебный маркер вместо наблюдения")
            counts["historical_observations"]+=len(rows)
            hashes[s["file"]]={"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
        except (OSError,ValueError,KeyError) as e:issues.append("Исторический ряд "+s["code"]+": "+str(e))
    if not hist["series"]:warnings.append("Региональные ряды пока не загружены")
    geo=data["regional-boundaries.json"]
    if geo.get("status") in ("ok","cached"):
        try:
            import regional_geo
            raw=(out/"regional-boundaries.geojson").read_bytes()
            count=regional_geo.validate(raw)
            if count!=geo.get("features") or hashlib.sha256(raw).hexdigest()!=geo.get("sha256"):raise ValueError("Контрольная сумма или число границ не совпадает")
            counts["geographic_features"]=count
            if geo.get("inventory")!=regional_geo.inventory(raw):raise ValueError("Инвентаризация геометрии не совпадает")
            counts["geographic_unique_codes"]=len(geo["inventory"]["unique_codes"])
            counts["geographic_unmatched_contours"]=geo["inventory"]["unmatched_contours"]
            hashes["regional-boundaries.geojson"]={"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
        except (OSError,ValueError,KeyError,TypeError) as e:issues.append("География: "+str(e))
    else:warnings.append("Географические границы недоступны: "+str(geo.get("error","нет файла")))
    ind=data["industrial.json"]
    counts["industrial_series"]=len(ind["series"])
    counts["industrial_observations"]=sum(len(s["values"]) for s in ind["series"])
    if len({s["id"] for s in ind["series"]})!=counts["industrial_series"]:
        issues.append("industrial: повторяющиеся идентификаторы")
    for s in ind["series"]:
        if not s["unit"] or not http_url(s["source"]) or len({r["period"] for r in s["values"]})!=len(s["values"]) or any(not finite(r["value"]) for r in s["values"]):
            issues.append("industrial: некорректный ряд "+s["id"])
    profiles=data["sector-passports.json"]["profiles"]
    counts["sector_passports"]=len(profiles)
    counts["sector_linked_series"]=len({r["id"] for p in profiles for r in p["rows"]})
    source_ids=set(compare)|{s["id"] for s in ind["series"]}|set(nat)
    if len({p["id"] for p in profiles})!=len(profiles):issues.append("Паспорта: повторяющиеся идентификаторы")
    import sector_passports
    counts["sector_finance_linked_observations"]=len({(r["year"],r["code"],r["metric"]) for p in profiles for r in p.get("finance",[])})
    for p in profiles:
        if "finance" in p:
            try:
                if p["finance"]!=sector_passports.finance_rows(p["id"],data["finance-workbooks.json"]):raise ValueError("Показатели не воспроизводятся из оригинала ФНС")
            except (ValueError,KeyError,TypeError) as e:issues.append("Паспорт ФНС "+p["id"]+": "+str(e))
        if len({r["id"] for r in p["rows"]})!=len(p["rows"]):issues.append("Паспорта: дубликаты в "+p["id"])
        for r in p["rows"]:
            if r["id"] not in source_ids or not http_url(r["source"]) or not (out/r["href"].split("?",1)[0]).is_file() or (r["count"] and not finite(r["value"])) or (not r["count"] and r["value"] is not None):
                issues.append("Паспорт: недействительная ссылка на ряд "+r["id"])
    try:
        import food_balance
        fbs_csv=out/"food-balance.csv"
        fbs_counts,fbs_warnings=food_balance.quality(data["food-balance.json"],fbs_csv,int(stamp[:4]))
        counts.update(fbs_counts);warnings.extend(fbs_warnings)
        raw=fbs_csv.read_bytes()
        hashes["food-balance.csv"]={"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
    except (OSError,ValueError,KeyError,TypeError,AttributeError) as e:
        issues.append("Продовольственные балансы: "+str(e))
    try:
        import electricity_balance
        energy_csv=out/"electricity-balance.csv"
        previous_energy=previous/"electricity-balance.json"
        old_energy=json.loads(previous_energy.read_text(encoding="utf-8")) if previous_energy.is_file() else None
        ec,ew=electricity_balance.quality(data["electricity-balance.json"],energy_csv,int(stamp[:4]),old_energy)
        counts.update(ec);warnings.extend(ew)
        raw=energy_csv.read_bytes()
        hashes["electricity-balance.csv"]={"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
    except (OSError,ValueError,KeyError,TypeError,AttributeError) as e:
        issues.append("Энергетика: "+str(e))
    try:
        import facility_data
        old_file=previous/"facility-energy.json"
        old=json.loads(old_file.read_text(encoding="utf-8")) if old_file.is_file() else None
        fc,fw=facility_data.quality(data["facility-energy.json"],old)
        counts.update(fc);warnings.extend(fw)
    except (OSError,ValueError,KeyError,TypeError,AttributeError) as e:
        issues.append("Производственные площадки: "+str(e))
    try:
        import enterprise_sources
        counts.update(enterprise_sources.quality(data["enterprise-sources.json"]))
        if not all(r["sheets"] for r in data["enterprise-sources.json"]["rows"]):warnings.append("Статистический регистр: не все оригиналы проверены; наблюдения не импортированы")
    except (ValueError,KeyError,TypeError,AttributeError) as e:issues.append("Статистический регистр: "+str(e))
    try:
        import amur_enterprises
        counts.update(amur_enterprises.quality(data["amur-enterprises.json"]))
        if not data["amur-enterprises.json"]["rows"]:warnings.append("Амурский каталог предприятий: импорт не подтверждён")
    except (ValueError,KeyError,TypeError,AttributeError) as e:issues.append("Амурский каталог: "+str(e))
    try:
        import bank_registry
        counts.update(bank_registry.quality(data["bank-directory.json"]))
        if not all(x["rows"] for x in data["bank-directory.json"]["datasets"].values()):warnings.append("Банковский каталог: неполная загрузка")
    except (ValueError,KeyError,TypeError,AttributeError) as e:issues.append("Банковский каталог: "+str(e))
    try:
        import company_sources
        counts.update(company_sources.quality(data["company-sources.json"]))
        if not all(r["schema_verified"] for r in data["company-sources.json"]["rows"]):warnings.append("ФНС: не все схемы корпоративных наборов проверены; наблюдения не импортированы")
    except (ValueError,KeyError,TypeError,AttributeError) as e:issues.append("Корпоративные источники: "+str(e))
    try:
        import company_import
        counts.update(company_import.quality(data["company-rankings.json"]))
        if not data["company-rankings.json"]["report"]:warnings.append("ФНС: полные корпоративные рейтинги ещё не импортированы")
    except (ValueError,KeyError,TypeError,AttributeError) as e:issues.append("Корпоративные рейтинги: "+str(e))
    try:
        import sme_regions
        old_file=previous/"sme-regions.json"
        old=json.loads(old_file.read_text(encoding="utf-8")) if old_file.is_file() else None
        sc,sw=sme_regions.quality(data["sme-regions.json"],old)
        counts.update(sc);warnings.extend(sw)
    except (OSError,ValueError,KeyError,TypeError,AttributeError) as e:
        issues.append("МСП: "+str(e))
    try:
        import district_geo
        old_file=previous/"district-meta.json"
        old=json.loads(old_file.read_text(encoding="utf-8")) if old_file.is_file() else None
        dc,dw=district_geo.quality(out,data["district-meta.json"],old)
        counts.update(dc);warnings.extend(dw)
    except (OSError,ValueError,KeyError,TypeError,AttributeError) as e:
        issues.append("ADM2: "+str(e))
    try:
        import freshness
        counts.update({"freshness_"+k:v for k,v in freshness.quality(data["freshness.json"]).items()})
    except (ValueError,KeyError,TypeError,AttributeError) as e:
        issues.append("Контроль обновлений: "+str(e))
    try:
        import stat_revisions
        counts.update(stat_revisions.quality(data["stat-revisions.json"]))
    except (ValueError,KeyError,TypeError,AttributeError) as e:
        issues.append("Пересмотры статистики: "+str(e))
    try:
        import consistency
        d=data["consistency.json"]
        if d!=consistency.create(nat,cbr,data["sme-regions.json"],d["built"],consistency.budget_observations(out)):raise ValueError("Результаты не воспроизводятся")
        for k,v in d["counts"].items():counts["consistency_"+k]=v
        if d["counts"].get("расхождение"):warnings.append("Сверки: "+str(d["counts"]["расхождение"])+" расхождений; см. consistency.html")
    except (ValueError,KeyError,TypeError) as e:issues.append("Сверки: "+str(e))
    try:
        import finance_workbooks
        counts.update(finance_workbooks.quality(data["finance-workbooks.json"],out))
        for k in ("different","ambiguous"):
            n=counts.get("finance_reconciliation_"+k,0)
            if n:warnings.append("Сверка ФНС: "+str(n)+" · "+finance_workbooks.RECONCILIATION_LABELS[k])
    except (ValueError,KeyError,TypeError,OSError) as e:issues.append("Импорт рентабельности: "+str(e))
    try:
        import rosstat_workbooks
        counts.update(rosstat_workbooks.quality(data["rosstat-workbooks.json"]))
    except (ValueError,KeyError,TypeError) as e:issues.append("Отраслевые таблицы Росстата: "+str(e))
    try:
        import federal_budget
        counts.update(federal_budget.quality(data["federal-budget.json"],out/"federal-budget.csv"))
        raw=(out/"federal-budget.csv").read_bytes()
        hashes["federal-budget.csv"]={"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
    except (ValueError,KeyError,TypeError,OSError,ArithmeticError) as e:issues.append("Документальный федеральный бюджет: "+str(e))
    try:
        import regional_manufacturing as rm
        old_file=previous/"regional-manufacturing.json"
        old=json.loads(old_file.read_text(encoding="utf-8")) if old_file.is_file() else None
        counts.update(rm.quality(data["regional-manufacturing.json"],old))
        rm.verify_csv(out/"regional-manufacturing.csv",data["regional-manufacturing.json"])
        if not data["regional-manufacturing.json"]["rows"]:warnings.append("Специализация обрабатывающей промышленности: нет импортированных данных")
        if data["regional-manufacturing.json"]["status"].startswith("Ошибка"):warnings.append("Специализация обрабатывающей промышленности: "+data["regional-manufacturing.json"]["status"])
    except (ValueError,KeyError,TypeError,OSError,ArithmeticError) as e:issues.append("Специализация обрабатывающей промышленности: "+str(e))
    try:
        import regional_industry_extra as rx
        old_file=previous/"regional-mining-energy.json"
        old=json.loads(old_file.read_text(encoding="utf-8")) if old_file.is_file() else None
        counts.update(rx.quality(data["regional-mining-energy.json"],old))
        rx.verify_csv(out/"regional-mining-energy.csv",data["regional-mining-energy.json"])
        if not data["regional-mining-energy.json"]["rows"]:warnings.append("Добыча и энергетика: нет импортированных данных")
        if data["regional-mining-energy.json"]["status"].startswith("Ошибка"):warnings.append("Добыча и энергетика: "+data["regional-mining-energy.json"]["status"])
    except (ValueError,KeyError,TypeError,OSError,ArithmeticError) as e:issues.append("Добыча и энергетика: "+str(e))
    try:
        import industrial_parks as ip
        parks=data["industrial-parks.json"]
        counts.update(ip.quality(parks))
        ip.verify_csv(out/"industrial-parks.csv",parks)
        if not parks["rows"]:warnings.append("Каталог АИП: нет импортированных карточек")
        if parks.get("error"):warnings.append("Каталог АИП: "+parks["error"])
        old_file=previous/"industrial-parks.json"
        if old_file.is_file():
            old=json.loads(old_file.read_text(encoding="utf-8"))
            if old.get("rows") and len(parks["rows"])<0.8*len(old["rows"]):raise ValueError("Потеря охвата каталога АИП")
    except (ValueError,KeyError,TypeError,OSError) as e:issues.append("Каталог АИП: "+str(e))
    try:
        import park_certificates as pc
        certs=data["park-certificates.json"]
        counts.update(pc.quality(certs))
        pc.verify_csv(out/"park-certificates.csv",certs)
        if not certs["rows"]:warnings.append("Список сертификатов АИП не загружен")
        if certs.get("error"):warnings.append("Список сертификатов АИП: "+certs["error"])
        old_file=previous/"park-certificates.json"
        if old_file.is_file():
            old=json.loads(old_file.read_text(encoding="utf-8"))
            if old.get("rows") and len(certs["rows"])<0.5*len(old["rows"]):raise ValueError("Потеря охвата списка документов")
    except (ValueError,KeyError,TypeError,OSError) as e:issues.append("Список сертификатов АИП: "+str(e))
    try:
        import frp_snapshot
        counts.update(frp_snapshot.quality(data["frp-snapshot.json"],out/"frp-snapshot.csv"))
    except (ValueError,KeyError,TypeError,OSError) as e:issues.append("Документальные показатели ФРП: "+str(e))
    try:
        import investment_projects as ipr
        projects=data["investment-projects.json"]
        counts.update(ipr.quality(projects))
        ipr.verify_csv(out/"investment-projects.csv",projects)
        if not projects["rows"]:warnings.append("Инвестиционные проекты: нет подтвержденного импорта")
        if projects.get("error"):warnings.append("Инвестиционные проекты: "+projects["error"])
    except (ValueError,KeyError,TypeError,OSError,ArithmeticError) as e:issues.append("Инвестиционные проекты: "+str(e))
    try:
        import amur_projects as apr
        amur=data["amur-projects.json"]
        counts.update(apr.quality(amur))
        apr.verify_csv(out/"amur-projects.csv",amur)
        if not amur["rows"]:warnings.append("Амурская область: нет подтвержденного импорта проектов")
        if amur.get("error"):warnings.append("Амурская область: "+amur["error"])
    except (ValueError,KeyError,TypeError,OSError,ArithmeticError) as e:issues.append("Амурская область: "+str(e))
    try:
        import krasnodar_projects as kpr
        kd=data["krasnodar-projects.json"]
        counts.update(kpr.quality(kd))
        kpr.verify_csv(out/"krasnodar-projects.csv",kd)
        if not kd["rows"]:warnings.append("Краснодарский край: нет подтвержденного импорта проектов")
        if kd.get("error"):warnings.append("Краснодарский край: "+kd["error"])
    except (ValueError,KeyError,TypeError,OSError,ArithmeticError) as e:issues.append("Краснодарский край: "+str(e))
    try:
        import project_coverage as pcov
        coverage=data["project-coverage.json"]
        counts.update(pcov.quality(coverage,out))
        pcov.verify_csv(out/"project-coverage.csv",coverage)
        pcov.verify_breakdown_csv(out/"project-breakdown.csv",coverage)
    except (ValueError,KeyError,TypeError,OSError,ArithmeticError) as e:issues.append("Охват проектов: "+str(e))
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
