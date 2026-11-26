import unittest
import iv_release as R
import independent_ember as E
class Release(unittest.TestCase):
    def test_ember(self):
        d={"schema":"iv-ember-v1","source":E.URL,"unit":"TWh","rows":[],"success":None,"sha256":None}
        self.assertEqual(R.verify_ember(d,None,2026),0)
        rows=[{"year":y,"values":{"total":100,"gas":10}} for y in range(2020,2025)]
        full={**d,"rows":rows,"success":"2026-11-26","sha256":"a"*64}
        self.assertEqual(R.verify_ember(full,None,2026),10)
        for bad in [d,{**full,"sha256":None},{**full,"rows":rows[:-1]},{**full,"rows":rows+rows[:1]}]:
            with self.assertRaises(ValueError):R.verify_ember(bad,full,2026)
    def test_manual(self):
        d={"schema":"iv-labour-v1","sources":{"x":{"url":"https://example.org/"}},"rows":[{"period":"2025-01","source":"x","value":0}]}
        self.assertEqual(R.verify_manual(d,"labour"),1)
        with self.assertRaises(ValueError):R.verify_manual({**d,"rows":d["rows"]*2},"labour")

    def test_document_recheck(self):
        from copy import deepcopy
        from pathlib import Path
        here=Path(R.__file__).resolve().parent
        ledger=R.read(here.parent/"IV_SOURCE_RECHECK.json")
        physical=R.read(here/"independent-physical.json")
        trade={"rows":R.trade.seed(),"last_success":None,"seed_verification":"documented_manual",
               "seed_recheck_date":ledger["checked"],"seed_recheck_count":66}
        self.assertEqual(R.verify_recheck(physical,trade,ledger),{"corporate_values":45,"trade_seed_values":66})
        for change in ("number","missing","status","date","source","trade_number","trade_count","ledger_duplicate"):
            p,t,e=deepcopy(physical),deepcopy(trade),deepcopy(ledger)
            c=p["companies"][0]
            if change=="number":c["rows"][0]["nickel"]+=1
            elif change=="missing":c["rows"].pop()
            elif change=="status":c["verification"]="pending"
            elif change=="date":c["verification_date"]="2025-01-01"
            elif change=="source":c["source"]="https://example.org/"
            elif change=="trade_number":t["rows"][0]["us_exports"]+=1
            elif change=="trade_count":t["seed_recheck_count"]-=2
            else:e["corporate"]["nornickel"]["rows"].append(e["corporate"]["nornickel"]["rows"][0])
            with self.subTest(change=change), self.assertRaises(ValueError):
                R.verify_recheck(p,t,e)
        trade["last_success"]="2026-11-26"
        trade["rows"][0]["us_exports"]+=1
        self.assertEqual(R.verify_recheck(physical,trade,ledger)["trade_seed_values"],66)
