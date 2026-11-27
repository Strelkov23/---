import unittest
from economic_ai_forecast_tournament import *
def row(i,last=12,trend=10):
    y=2000+i
    return dict(code="X",source="https://example.org",unit="u",horizon=1,origin=str(y-1),target=str(y),issued=f"{y-1}-12-01T00:00:00+00:00",predictions={"last":last,"trend8":trend},actual=10,seen=f"{y+1}-01-01T00:00:00+00:00")
class TournamentTests(unittest.TestCase):
    def test_small(self):
        self.assertIsNone(summarize([row(i) for i in range(11)])[0]["recommendation"])
    def test_candidate(self):
        self.assertEqual(summarize([row(i) for i in range(12)])[0]["recommendation"],"trend8")
    def test_holdout_failure(self):
        self.assertIsNone(summarize([row(i,trend=10 if i<8 else 20) for i in range(12)])[0]["recommendation"])
    def test_targets(self):
        rows=[row(i) for i in range(11)]+[row(0)]
        self.assertEqual(summarize(rows)[0]["n"],11)
    def test_separate_methods(self):
        rows=[row(i) for i in range(12)];rows[0]["predictions"]["mean3"]=10
        self.assertEqual(len(summarize(rows)),2)
    def test_invalid_issued(self):
        d=empty();r=row(0);r["issued"]="2000-01-01T00:00:00+00:00";d["rows"]=[r]
        with self.assertRaises(ValueError):validate(d)
if __name__=="__main__":unittest.main()
