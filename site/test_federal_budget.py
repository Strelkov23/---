import unittest,tempfile,csv,json
from pathlib import Path
from decimal import Decimal
import federal_budget as f
import consistency as c
class FederalBudgetTests(unittest.TestCase):
    def test_exact_source_values_and_balance(self):
        d=f.create("2026-11-25")
        self.assertEqual(f.quality(d),dict(federal_budget_law_years=16,federal_budget_law_observations=48,federal_budget_law_identities=16))
        self.assertEqual([r["year"] for r in d["rows"]],list(range(2010,2026)))
        r=d["rows"][-1]
        self.assertEqual(r["original"]["revenue"],"37283772222.8")
        self.assertEqual(r["original"]["balance"],"-5626540177.4")
        for x in d["rows"]:
            a,b,z=(Decimal(x["original"][k]) for k in f.METRICS)
            self.assertEqual(a-b,z)
        self.assertGreater(next(x for x in d["rows"] if x["year"]==2018)["values"]["balance"],0)
        d["rows"][0]["values"]["balance"]=0
        with self.assertRaises(ValueError):f.quality(d)
    def test_publish_and_reconcile(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder);pages={}
            f.publish(lambda name,body:pages.update({name:body}),out,"2026-11-25")
            self.assertIn("federal-budget.html",pages)
            self.assertIn("2010–2025",pages["federal-budget.html"])
            self.assertTrue((out/"federal-budget.svg").is_file())
            with (out/"federal-budget.csv").open(encoding="utf-8-sig") as fh:
                self.assertEqual(len(list(csv.DictReader(fh))),48)
            (out/"historical.json").write_text('{"series":[]}',encoding="utf-8")
            b=c.budget_observations(out)
            self.assertEqual(len(b["LAW_REV"]),16)
            d=c.create({}, {}, {},"2026-11-25",b)
            self.assertEqual(d["counts"],{"нет данных":96})
            b["MINFIN_REV"]={"2025":[(37283.8,"test")]}
            b["BUD_BAL"]={"2025":[(-6000,"test")]}
            d=c.create({}, {}, {},"2026-11-25",b)
            rows={(x["rule"],x["period"]):x for x in d["rows"]}
            self.assertEqual(rows["law_minfin_rev","2025"]["status"],"согласовано")
            self.assertEqual(rows["law_treasury_bal","2025"]["status"],"расхождение")
            self.assertEqual(rows["law_treasury_exp","2025"]["status"],"нет данных")
if __name__=="__main__":unittest.main()
