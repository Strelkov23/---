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
