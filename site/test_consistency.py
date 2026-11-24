import unittest
import consistency as c
class ConsistencyTests(unittest.TestCase):
    def test_rules(self):
        def s(v):return {"values":[{"period":"2025-01","value":v}]}
        n={"KEY_END":s(21),"RES_TOTAL":s(100),"RES_FX":s(65),"RES_GOLD":s(35),"RES_CURRENCY":s(50),"RES_SDR":s(10),"RES_IMF":s(5),"M0":s(10),"M1":s(20),"M2":s(19)}
        d=c.create(n,{"KEY":{"values":[{"date":"2025-01-30","value":21}]}},{},"2025-02-04")
        self.assertEqual(d["counts"],{"согласовано":4,"расхождение":1})
    def test_gap(self):
        n={"KEY_END":{"values":[{"period":"2025-01","value":21}]},"RES_TOTAL":{"values":[{"period":"2025-01","value":100}]}}
        d=c.create(n,{"KEY":{"values":[{"date":"2025-01-05","value":21}]}},{},"2025-02-04")
        self.assertEqual(d["counts"],{"нет данных":2})
    def test_sme(self):
        d=c.create({}, {},dict(rows=[{}],period="2025-01-10",national=dict(total=10,legal=4,individual=6,workers=20),regional_sum=dict(total=9,legal=4,individual=5,workers=20)),"2025-02-04")
        self.assertEqual(d["counts"],{"согласовано":2,"расхождение":2})
