import unittest
import balance_audit as a
class BalanceAuditTests(unittest.TestCase):
    def fixture(self):
        rows=[dict(code="a",group=1,domestic_final_demand=100,import_ratio=.1,L1=1.2,L2=.3),dict(code="b",group=2,domestic_final_demand=200,import_ratio=.2,L1=.4,L2=1.1)]
        products={"a":{"output_mln":180},"b":{"output_mln":260}}
        m=dict(names=["A","B"],output=[180,260],demand=[100,200],imports=[20,50],effects=[[120,60],[40,220]],flows=[[30,50],[20,40]])
        return rows,products,m
    def test_exact(self):
        r=a.audit(*self.fixture())
        self.assertTrue(all(v["within"]==v["total"] for v in r["summary"].values()))
    def test_discrepancy(self):
        rows,p,m=self.fixture();m["effects"][0][1]=600
        r=a.audit(rows,p,m)
        self.assertEqual(r["summary"]["aggregation"]["within"],9)
        self.assertEqual(r["summary"]["aggregation"]["max_abs"],540)
    def test_invalid(self):
        rows,p,m=self.fixture();rows[0]["L1"]="NaN"
        with self.assertRaises(ValueError):a.audit(rows,p,m)
    def test_tolerance(self):
        self.assertTrue(a.check("x",100,101)["within"])
        self.assertFalse(a.check("x",100,102)["within"])
