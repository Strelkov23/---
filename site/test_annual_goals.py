import unittest
import tempfile
from pathlib import Path
import annual_goals as a

class AnnualGoalTests(unittest.TestCase):
    def test_years_and_provenance(self):
        rows=a.records()
        self.assertEqual(len(rows),24)
        self.assertEqual(len({(r["id"],r["year"]) for r in rows}),24)
        self.assertTrue(all(r["plan_source"] and r["plan_section"] for r in rows))
        r=next(r for r in rows if r["id"]=="poverty" and r["year"]==2025)
        self.assertEqual((r["plan"],r["actual"],r["favorable_gap"]),(7.9,6.7,1.2))
        self.assertTrue(all(r["actual"] is None and r["favorable_gap"] is None for r in rows if r["year"]!=2025))
    def test_direction(self):
        self.assertEqual(a.gap(75,74.5,"ge"),0.5)
        self.assertEqual(a.gap(8,7.9,"le"),-0.1)
        self.assertIsNone(a.gap(None,7.9,"le"))
    def test_publish(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)
            html=a.publish(out)
            self.assertIn('id="annual-goals"',html)
            self.assertIn("Нет сопоставимого факта",html)
            self.assertTrue((out/"annual-goals.csv").is_file())
            self.assertTrue((out/"annual-goals.json").is_file())
