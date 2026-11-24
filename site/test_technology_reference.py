import json,subprocess
from scipy.optimize import linprog
cases=json.loads(subprocess.check_output(["node","test-technology.js","--reference"],text=True))
for c in cases:
    r=linprog([-x for x in c["c"]],A_ub=c["A"],b_ub=c["b"],bounds=(0,None),method="highs")
    assert r.success,r.message
    assert abs(-r.fun-c["objective"])<2e-6
print("Technology: 4 independent HiGHS objective checks passed",flush=True)
