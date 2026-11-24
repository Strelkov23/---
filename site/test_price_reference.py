import json,subprocess
import numpy as np
p=json.loads(subprocess.check_output(["node","test-price-model.js","--reference"],text=True))
m=p["data"];M=np.eye(len(m["names"]))-np.asarray(m["A"]).T
expected=100*(1+np.linalg.solve(M,np.asarray(m["imported"])*.1))
assert np.allclose(expected,[r["index"] for r in p["actual"]["rows"]],rtol=1e-9,atol=1e-8)
expected_h=np.linalg.solve(M,np.full(len(m["names"]),1000.))
assert np.allclose(expected_h,[r["fullHours"] for r in p["h"]],rtol=1e-9,atol=1e-7)
print("Price and labor solutions verified against NumPy linear solver",flush=True)
