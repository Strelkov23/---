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
