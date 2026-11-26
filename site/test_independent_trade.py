import unittest,sqlite3,tempfile,json
from pathlib import Path
from types import SimpleNamespace
import independent_trade as t
def fixture():
    tables=[]
    for yr in range(1992,2002):
        rows="".join(f"<tr><td>{m} {yr}</td><td>1,000.0</td><td>1,200.0</td><td>-200.0</td></tr>" for m in t.MONTHS)
        tables.append("<table><tr><th>Month</th><th>Exports</th><th>Imports</th><th>Balance</th></tr>"+rows+"<tr><td>TOTAL "+str(yr)+"</td></tr></table>")
    return "Trade in Goods with Russia. millions of U.S. dollars, not seasonally adjusted"+"".join(tables)
class Trade(unittest.TestCase):
    def test_parse(self):
        rows=t.parse(fixture(),2026);self.assertEqual(len(rows),120);self.assertEqual(rows[0]["us_imports"],1200)
    def test_invalid(self):
        for x in [fixture().replace("with Russia","with China"),fixture().replace("-200.0","-300.0",1),fixture().replace("February 1992","January 1992",1)]:
            with self.assertRaises(ValueError):t.parse(x,2026)
    def test_seed_and_failure(self):
        with tempfile.TemporaryDirectory() as d:
            db=sqlite3.connect(":memory:")
            def fail(*a,**k):raise OSError("test")
            first=t.publish(db,Path(d),"2026-11-26",False)
            second=t.publish(db,Path(d),"2026-11-26",True,fail)
            self.assertEqual(first["rows"],second["rows"]);self.assertEqual(len(first["rows"]),33);self.assertEqual(second["status"],"seed_after_error")
    def test_reject_partial(self):
        with tempfile.TemporaryDirectory() as d:
            db=sqlite3.connect(":memory:")
            def fetch(*a,**k):return SimpleNamespace(raw=fixture().encode(),charset="utf-8",sha256="a"*64)
            self.assertEqual(t.publish(db,Path(d),"2026-11-26",True,fetch)["status"],"seed_after_error")

    def test_revision_detection(self):
        old=[{"period":"2024-01","us_exports":10,"us_imports":20}]
        new=[{"period":"2024-01","us_exports":11,"us_imports":20},{"period":"2024-02","us_exports":12,"us_imports":22}]
        self.assertEqual(t.revisions(old,new),[{"period":"2024-01","metric":"us_exports","before":10,"after":11,"delta":1}])
    def test_update_revision_persistence(self):
        with tempfile.TemporaryDirectory() as d:
            db=sqlite3.connect(":memory:")
            rows=t.seed()
            recent="".join("<tr><td>"+list(t.MONTHS)[int(r["period"][5:])-1]+" "+r["period"][:4]+"</td><td>"+format(r["us_exports"],".1f")+"</td><td>"+format(r["us_imports"],".1f")+"</td><td>"+format(r["us_exports"]-r["us_imports"],".1f")+"</td></tr>" for r in rows)
            raw=fixture()+"<table><tr><th>Month</th><th>Exports</th><th>Imports</th><th>Balance</th></tr>"+recent+"</table>"
            def fetch(*a,**k):return SimpleNamespace(raw=raw.encode(),charset="utf-8",sha256="a"*64)
            first=t.publish(db,Path(d),"2026-11-26",True,fetch)
            self.assertEqual(first["status"],"downloaded")
            self.assertEqual(first["last_attempt"]["added"],120)
            self.assertEqual(first["revision_count"],0)
            raw=raw.replace("1,000.0</td><td>1,200.0</td><td>-200.0","1,001.0</td><td>1,200.0</td><td>-199.0",1)
            second=t.publish(db,Path(d),"2026-11-26",True,fetch)
            self.assertEqual(second["revision_count"],1)
            self.assertEqual(second["revisions"][0]["before"],1000)
            self.assertEqual(second["revisions"][0]["after"],1001)
            def fail(*a,**k):raise OSError("offline")
            failed=t.publish(db,Path(d),"2026-11-26",True,fail)
            offline=t.publish(db,Path(d),"2026-11-26",False)
            self.assertEqual(offline["status"],"cached_after_error")
            self.assertEqual(offline["rows"],second["rows"])
            self.assertEqual(offline["revisions"],failed["revisions"])
