"""Quarterly snapshots of verified form 808, bounded requests, no inferred values."""
import json,re
from datetime import date,timedelta
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import bank_capital as cap
FILE="bank-capital-history.json"
NOTE="Форма 0409808, отдельная кредитная организация. Только капитал на отчётную дату; не бухгалтерский капитал, не форма 123. Состав системно значимых — на дату перечня, не на историческую дату."
def empty():return dict(schema=1,note=NOTE,cohort=[],cohort_edition=None,snapshots={},attempts={})
def periods(stamp):
    today=date.fromisoformat(stamp[:10])
    # Allow a month for publication. Probe four historical quarters plus recent ones.
    return [date(y,m,1).isoformat() for y in range(max(2025,today.year-2),today.year+1) for m in (1,4,7,10) if date(y,m,1)+timedelta(days=31)<=today]
def quality(d):
    if d.get("schema")!=1 or d.get("note")!=NOTE:raise ValueError("Паспорт истории")
    cohort=d["cohort"]
    if len(cohort)>50 or len(set(cohort))!=len(cohort) or any(not re.fullmatch(r"\d{1,6}",x) for x in cohort):raise ValueError("Состав выборки")
    if cohort:date.fromisoformat(d["cohort_edition"])
    if len(d["snapshots"])>64 or len(d["attempts"])>64:raise ValueError("Охват истории")
    total=0
    for period,rows in d["snapshots"].items():
        seen=set()
        for r in rows:
            reg=r["registration_number"]
            if reg in seen or reg not in cohort or r["source"]!=cap.url(reg,period) or r["line"] not in ("59","14") or r["verification"]!="html" or not re.fullmatch(r"[a-f0-9]{64}",r["sha256"]) or not re.fullmatch(r"-?\d{1,18}",r["capital"]):raise ValueError("Наблюдение истории")
            seen.add(reg);total+=1
    for period,a in d["attempts"].items():
        cap.url("1",period);date.fromisoformat(a["checked"][:10])
        if not isinstance(a["errors"],dict) or any(k not in cohort or not isinstance(v,str) for k,v in a["errors"].items()):raise ValueError("Ошибки истории")
    return {"bank_capital_history_periods":sum(bool(x) for x in d["snapshots"].values()),"bank_capital_history_records":total}
def publish(out,previous,stamp,refresh,directory,initial,fetcher=cap.fetch):
    d=empty()
    try:
        old=json.loads((previous/FILE).read_text(encoding="utf-8"));quality(old);d=old
    except (OSError,ValueError,TypeError,KeyError):pass
    cohort=sorted({r["registration_number"] for r in directory["datasets"]["system"]["rows"]},key=int)
    if cohort:
        d["cohort"]=cohort;d["cohort_edition"]=directory["datasets"]["system"]["edition"]
        for period,rows in d["snapshots"].items():d["snapshots"][period]=[r for r in rows if r["registration_number"] in cohort]
        for a in d["attempts"].values():a["errors"]={k:v for k,v in a["errors"].items() if k in cohort}
    if initial["period"]==cap.PERIOD:
        by={r["registration_number"]:r for r in d["snapshots"].get(cap.PERIOD,[])}
        for r in initial["rows"]:
            if r["registration_number"] in d["cohort"] and r["verification"]=="html":by[r["registration_number"]]=r
        if by:d["snapshots"][cap.PERIOD]=sorted(by.values(),key=lambda r:int(r["registration_number"]))
    today=date.fromisoformat(stamp[:10])
    # At most one quarterly slice per UTC calendar day, newest missing slice first.
    attempted_today=any(a["checked"][:10]==stamp[:10] for a in d["attempts"].values())
    if refresh and d["cohort"] and not attempted_today:
        due=[]
        for period in reversed(periods(stamp)):
            present={r["registration_number"] for r in d["snapshots"].get(period,[])}
            last=d["attempts"].get(period,{}).get("checked")
            if present!=set(d["cohort"]) and (not last or today>=date.fromisoformat(last[:10])+timedelta(days=7)):due.append(period)
        if due:
            period=due[0];by={r["registration_number"]:r for r in d["snapshots"].get(period,[])}
            def one(reg):
                try:return reg,fetcher(reg,period),None
                except Exception as e:return reg,None,str(e)[:180]
            with ThreadPoolExecutor(max_workers=3) as pool:
                results=list(pool.map(one,[reg for reg in d["cohort"] if reg not in by]))
            errors={}
            for reg,r,e in results:
                if r is not None:by[reg]=r
                else:errors[reg]=e
            if by:d["snapshots"][period]=sorted(by.values(),key=lambda r:int(r["registration_number"]))
            d["attempts"][period]=dict(checked=stamp,errors=errors)
            print("BANK_CAPITAL_HISTORY",period,len(by),len(errors),flush=True)
    quality(d);(out/FILE).write_text(json.dumps(d,ensure_ascii=False,allow_nan=False),encoding="utf-8");return d
