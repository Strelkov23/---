import unittest
from economic_ai_forecast_memory import *
def sample(actual=None,point=120,unit="руб."):
    hist=[{"period":"2025","value":100}]
    if actual is not None:hist.append({"period":"2027","value":actual})
    return {"series":[{"code":"X","title":"Test","unit":unit,"source":"https://example.org","history":hist,"results":[{"origin":"2025","target":"2027","horizon":2,"point":point,"low":100,"high":140,"selected":"trend"}]}]}
class ForecastMemoryTests(unittest.TestCase):
    def test_freeze_and_score(self):
        d=advance(empty(),sample(),"2026-11-27T00:00:00+00:00")
        d=advance(d,sample(point=130),"2026-12-01T00:00:00+00:00")
        self.assertEqual(len(d["rows"]),1);self.assertEqual(d["rows"][0]["point"],120)
        d=advance(d,sample(110),"2028-01-01T00:00:00+00:00")
        self.assertEqual(d["summary"][0]["mae"],10);self.assertEqual(d["summary"][0]["naive_mae"],10)
        d=advance(d,sample(125),"2028-02-01T00:00:00+00:00")
        self.assertEqual(d["rows"][0]["first_actual"],110);self.assertEqual(d["rows"][0]["latest_actual"],125)
    def test_no_hindsight(self):
        self.assertEqual(advance(empty(),sample(),"2027-01-01T00:00:00+00:00")["rows"],[])
    def test_no_cross_unit(self):
        d=advance(empty(),sample(),"2026-01-01T00:00:00+00:00")
        d=advance(d,sample(110,unit="%"),"2028-01-01T00:00:00+00:00")
        self.assertIsNone(d["rows"][0]["first_actual"])
    def test_missing_not_zero(self):
        d=advance(empty(),sample(),"2026-01-01T00:00:00+00:00")
        d=advance(d,sample(),"2028-01-01T00:00:00+00:00")
        self.assertEqual(d["summary"],[])
if __name__=="__main__":unittest.main()
