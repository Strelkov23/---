import unittest
import tempfile
import json
from pathlib import Path
from decimal import Decimal
import budget_programmes as b

class BudgetProgrammeTests(unittest.TestCase):
    def test_scope_and_balance(self):
        rows={r["id"]:r for r in b.records()}
        self.assertAlmostEqual(rows["expenditure"]["actual"]-rows["revenue"]["actual"],rows["deficit"]["actual"],places=5)
        self.assertIsNone(rows["revenue"]["appropriation"])
        self.assertIsNone(rows["social"]["amended_law"])
        self.assertEqual(rows["health"]["initial_law"],1550591.5)
        self.assertEqual(rows["health"]["amended_law"],1557061.8)
        self.assertEqual(rows["health"]["change_appropriation"],55061.0)
        self.assertAlmostEqual(rows["social"]["unspent"],4516.7)
        self.assertAlmostEqual(rows["health"]["unspent"],10029.5)
        self.assertEqual(rows["health"]["ratio_appropriation"],99.38)
        self.assertTrue(all(r["plan_source"] and r["actual_source"] for r in rows.values()))
    def test_zero_and_missing(self):
        self.assertIsNone(b.ratio(Decimal(1),Decimal(0)))
        self.assertIsNone(b.ratio(Decimal(1),None))
        self.assertIsNone(b.change(None,Decimal(1)))
    def test_export(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);html=b.publish(p)
            self.assertIn('id="programme-budget"',html)
            self.assertTrue((p/"programme-budget.csv").exists())
            self.assertTrue((p/"health-projects.csv").exists())
            projects=json.loads((p/"health-projects.json").read_text())
            self.assertEqual(len(projects["rows"]),21)
            self.assertTrue(projects["reconciliation"]["within_rounding"])
            self.assertEqual(projects["rows"][4]["unspent"],6111.6)
            self.assertEqual(projects["rows"][19]["appropriation"],50.0)
            self.assertEqual(len(json.loads((p/"programme-budget.json").read_text())["rows"]),5)
