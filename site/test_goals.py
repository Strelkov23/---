import unittest
import tempfile
import json
from pathlib import Path
import goals

class GoalTests(unittest.TestCase):
    def test_thresholds(self):
        self.assertEqual(goals.compare(7,7,"lt"),(0.0,False))
        self.assertEqual(goals.compare(6.7,7,"lt"),(-0.3,True))
        self.assertEqual(goals.compare(0.375,0.37,"le"),(0.005,False))
        self.assertEqual(goals.compare(75,78,"ge"),(3.0,False))
        self.assertEqual(goals.compare(None,78,"ge"),(None,None))
    def test_provenance(self):
        rows=goals.records()
        self.assertEqual(len({(r["id"],r["target_year"]) for r in rows}),len(rows))
        self.assertTrue(all(r["target_source"] and r["clause"] for r in rows))
        for r in rows:
            if r["actual"] is not None:self.assertTrue(r["actual_source"] and r["actual_year"] and r["actual_note"])
            else:self.assertIsNone(r["threshold_met"])
    def test_output(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d);html=goals.publish(out)
            self.assertIn('id="national-goals"',html)
            self.assertIn("Сопоставимый факт пока не внесён",html)
            self.assertTrue((out/"national-goals.csv").exists())
            self.assertEqual(len(json.loads((out/"national-goals.json").read_text())["rows"]),len(goals.records()))
