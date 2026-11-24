"""Independent HiGHS reference for the browser solver, run only in CI with SciPy."""
import json
import subprocess
from scipy.optimize import linprog

cases=json.loads(subprocess.check_output(["node","test-global-plan.js","--reference"],text=True))
for case in cases:
    r=linprog([-x for x in case["c"]],A_ub=case["A"],b_ub=case["b"],bounds=(0,None),method="highs")
    assert r.success,r.message
    delta=abs(-r.fun-case["objective"])
    assert delta<=2e-6, (case["groups"],case["periods"],case["mode"],delta)
    print("Independent reference:",case["groups"],"groups,",case["periods"],"periods,",case["mode"],"objective gap",delta,flush=True)
