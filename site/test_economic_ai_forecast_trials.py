import unittest
from economic_ai_forecast_trials import *
def row(y,actual=None,trend=10):
    return dict(code="X",source="https://example.org",unit="u",horizon=1,origin=str(y-1),target=str(y),issued=f"{y-1}-12-01T00:00:00+00:00",predictions={"last":12,"trend8":trend},actual=actual,seen=f"{y+1}-01-01T00:00:00+00:00" if actual is not None else None)
def source(rows):
    d=tournament.empty();d["rows"]=rows;d["summary"]=tournament.summarize(rows);return d
class TrialTests(unittest.TestCase):
    def initial(self):
        rows=[row(y,10) for y in range(2000,2012)]
        return rows,advance(empty(),source(rows),"2013-01-01T00:00:00+00:00")
    def test_freeze(self):
        rows,d=self.initial()
        self.assertEqual(len(d["trials"]),1);self.assertEqual(d["trials"][0]["candidate"],"trend8");self.assertEqual(d["trials"][0]["targets"],[])
    def test_no_retro_enrolment(self):
        rows,d=self.initial()
        d=advance(d,source(rows+[row(2014,10)]),"2015-01-01T00:00:00+00:00")
        self.assertEqual(d["trials"][0]["targets"],[])
    def test_confirm(self):
        rows,d=self.initial()
        for y in range(2014,2026,2):
            r=row(y);rows.append(r)
            d=advance(d,source(rows),r["issued"])
            r["actual"]=10;r["seen"]=f"{y+1}-01-01T00:00:00+00:00"
            # Score next time without replaying time backwards.
            if y==2024:d=advance(d,source(rows),r["seen"])
        self.assertEqual(d["trials"][0]["result"]["status"],"confirmed")
    def test_no_improvement(self):
        t={"targets":[dict(actual=10,candidate=20,naive=12) for _ in range(TARGETS)]}
        self.assertEqual(result(t)["status"],"not_confirmed")
    def test_missing(self):
        t={"targets":[dict(actual=10,candidate=10,naive=12) for _ in range(TARGETS-1)]+[dict(actual=None,candidate=10,naive=12)]}
        self.assertEqual(result(t)["status"],"collecting")
    def test_changed_frozen(self):
        rows,d=self.initial();r=row(2014);rows.append(r)
        d=advance(d,source(rows),r["issued"]);r["predictions"]["trend8"]=11
        with self.assertRaises(ValueError):advance(d,source(rows),"2014-01-01T00:00:00+00:00")
if __name__=="__main__":unittest.main()
