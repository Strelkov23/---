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
