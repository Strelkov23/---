"""Shared prior-snapshot priority for missing standalone bank forms."""
import json
from datetime import date,timedelta
from pathlib import Path
from collections import Counter
def coverage(previous):
    # Imports are local to avoid a dependency cycle. Never prioritize unvalidated rows.
    import bank_capital,bank_balance,bank_profit
    result=Counter()
    for module in (bank_capital,bank_balance,bank_profit):
        try:
            d=json.loads((Path(previous)/module.FILE).read_text(encoding="utf-8"))
            module.quality(d)
            ids={r["registration_number"] for r in d["rows"] if module is not bank_capital or r["verification"]=="html"}
            result.update(ids)
        except (OSError,ValueError,KeyError,TypeError):continue
    return dict(result)
def plan(candidates,verified,system,attempts,stamp,counts=None,limit=20,examples=()):
    today=date.fromisoformat(stamp[:10]);system=set(system);examples=set(examples);counts=counts or {}
    def due(reg):
        last=attempts.get(reg,{}).get("checked")
        return reg not in verified and (not last or today>=date.fromisoformat(last[:10])+timedelta(days=14))
    # Existing systemic priority and retry cooldown remain. Among fresh candidates,
    # first complete partially covered banks. The oldest retries retain deterministic order.
    return sorted((r for r in set(candidates) if due(r)),key=lambda r:(r not in system,r in attempts,-counts.get(r,0),r not in examples,attempts.get(r,{}).get("checked",""),int(r)))[:limit]

def audit(previous,stamp):
    """Counterfactual queue comparison; no network requests or claims of actual imports."""
    import bank_capital,bank_balance,bank_profit,bank_registry
    previous=Path(previous)
    directory=json.loads((previous/"bank-directory.json").read_text(encoding="utf-8"))
    cohort=set(bank_capital.target_cohort(directory))
    system={r["registration_number"] for r in directory["datasets"]["system"]["rows"]}
    modules=(bank_capital,bank_balance,bank_profit)
    forms=[]
    for module in modules:
        data=json.loads((previous/module.FILE).read_text(encoding="utf-8"));module.quality(data)
        forms.append(data)
    verified=[{r["registration_number"] for r in d["rows"] if i!=0 or r["verification"]=="html"} for i,d in enumerate(forms)]
    counts=Counter(reg for ids in verified for reg in ids)
    distribution={str(n):sum(counts[r]==n for r in cohort) for n in range(4)}
    examples={"2664","933","3161","1143","1399","3554"}
    today=date.fromisoformat(stamp[:10])
    def scenario(coordinated):
        selected=[]
        for i,data in enumerate(forms):
            candidates=cohort|system|(set(r["registration_number"] for r in data["rows"]) if i==0 else examples if i==1 else set())
            attempts=data.get("attempts",{})
            if coordinated:
                todo=plan(candidates,verified[i],system,attempts,stamp,counts,20,examples if i==1 else ())
            else:
                def due(reg):
                    last=attempts.get(reg,{}).get("checked")
                    return reg not in verified[i] and (not last or today>=date.fromisoformat(last[:10])+timedelta(days=14))
                def key(reg):
                    common=(reg in attempts,attempts.get(reg,{}).get("checked",""),int(reg))
                    return (reg not in system,reg not in examples,*common) if i==1 else (reg not in system,*common)
                todo=sorted((reg for reg in candidates if due(reg)),key=key)[:20]
            # Honor the actual daily lock, also for a manual same-day rebuild.
            last=data.get("expansion_day") if i==0 else (data.get("checked") or "")[:10]
            selected.append(set() if last==stamp[:10] else set(todo))
        possible=sum(all(reg in verified[i] or reg in selected[i] for i in range(3)) for reg in cohort)
        return dict(requests=[len(s) for s in selected],possible_complete=possible,additional=possible-distribution["3"],requests_to_partial=sum(counts[r]>0 for ids in selected for r in ids))
    return dict(schema=1,scope="conditional_queue_simulation_not_import",date=stamp[:10],target=len(cohort),distribution=distribution,independent=scenario(False),coordinated=scenario(True))
