import hashlib
import json
import tempfile
import unittest
from pathlib import Path
import programme_evidence as e
import budget_programmes as b
import annual_goals as a

class ProgrammeEvidenceTests(unittest.TestCase):
    def test_same_year_missing_and_noncausal(self):
        rows=e.assemble({"rows":b.records()},{"rows":a.records()},2025)
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[0]["annual_fact"],6.7)
        self.assertEqual(rows[0]["favorable_gap"],1.2)
        self.assertIsNone(rows[1]["annual_fact"])
        self.assertTrue(all(r["causal_effect"] is None for r in rows))
        self.assertTrue(all(r["budget_actual_mrub"] is None for r in e.assemble({"rows":b.records()},{"rows":a.records()},2026)))
    def test_publish(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);pages={}
            b.publish(p);a.publish(p)
            e.publish(pages.__setitem__,p,"2026-11-24")
            report=json.loads((p/"programme-evidence.json").read_text())
            self.assertEqual(report["input_sha256"]["programme-budget.json"],hashlib.sha256((p/"programme-budget.json").read_bytes()).hexdigest())
            self.assertIn("Причинный эффект",pages["programme-evidence.html"])
            self.assertTrue((p/"programme-evidence.md").exists())
            self.assertTrue((p/"programme-evidence.csv").exists())
