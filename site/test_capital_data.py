import unittest,tempfile,json
from pathlib import Path
import capital_data as c
class CapitalDataTests(unittest.TestCase):
    def test_records(self):
        a,b=c.records()
        self.assertEqual(len(a),60)
        self.assertEqual(len(b),216)
        self.assertEqual(len({(x["code"],x["year"]) for x in a}),len(a))
        self.assertEqual(len({(x["code"],x["year"]) for x in b}),len(b))
        total=next(x for x in a if x["code"]=="TOTAL" and x["year"]==2024)
        self.assertEqual(total["stock_mrub"],496609170)
        self.assertEqual(total["wear_pct"],42.3)
        self.assertEqual(total["wear_change_pp"],1.1)
        tractor=next(x for x in b if x["code"]=="tractors" and x["year"]==2024)
        self.assertEqual(tractor["utilization_pct"],42.3)
        self.assertEqual(tractor["unused_share_pct"],57.7)
        self.assertAlmostEqual(tractor["theoretical_extra_vs_output_pct"],136.4066193853428)
        self.assertEqual(tractor["page"],365)
        self.assertTrue(all(0<=x["wear_pct"]<=100 for x in a))
    def test_publish(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);pages={}
            c.publish(pages.__setitem__,p)
            data=json.loads((p/"capital-data.json").read_text())
            self.assertEqual(len(data["reconciliation"]),3)
            self.assertTrue(all(r["difference_mrub"]==0 for r in data["reconciliation"]))
            self.assertTrue((p/"fixed-assets.csv").exists())
            self.assertTrue((p/"capacity-utilization.csv").exists())
            self.assertIn("не подставляются автоматически",pages["capital.html"])
