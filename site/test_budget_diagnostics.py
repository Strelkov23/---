import unittest
import tempfile
from pathlib import Path
from decimal import Decimal
import budget_diagnostics as b

class BudgetDiagnosticsTests(unittest.TestCase):
    def test_decomposition(self):
        x=b.decompose(100,80,80)
        self.assertEqual((x["revision"],x["execution_gap"],x["net"]),(-20,0,-20))
        self.assertEqual((x["rate_law"],x["rate_appropriation"]),(80,100))
        x=b.decompose(0,10,12)
        self.assertIsNone(x["rate_law"])
        self.assertEqual(x["net"],12)
        with self.assertRaises(ValueError):b.decompose(-1,2,3)
    def test_concentration(self):
        rows=b.records()
        self.assertEqual(len(rows),22)
        h=[r for r in rows if r["id"].startswith("health-")]
        s=b.concentration(h)
        self.assertEqual(s["rows"][0]["id"],"health-5")
        self.assertAlmostEqual(s["gross_gap"],8675.0,places=1)
        self.assertGreater(s["top3_share"],80)
        self.assertEqual(b.concentration([])["gross_gap"],0)
        self.assertIsNone(b.concentration([])["top3_share"])
        self.assertEqual(b.concentration([dict(id="x",title="x",appropriation=2,actual=3)])["over_execution"],1)
        for r in rows:self.assertAlmostEqual(r["revision"]+r["execution_gap"],r["net"],places=1)
    def test_publish(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);pages={}
            b.publish(pages.__setitem__,p)
            self.assertIn("Минсельхоз России",pages["budget-diagnostics.html"])
            self.assertTrue((p/"budget-diagnostics.json").exists())
            self.assertTrue((p/"budget-diagnostics.csv").exists())
