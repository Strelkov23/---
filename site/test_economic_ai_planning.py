import unittest
from economic_ai_planning import *
STAMP="2026-11-27T15:00:00+00:00"
def fixture():
    return {"schema":1,"rows":[dict(id=k,title=k,year=2025,status="ordinary",value=1,age=0,note="test",codes=["a","b"]) for k in RULES]}
class PlanningTests(unittest.TestCase):
    def test_signal(self):
        d=fixture();d["rows"][0]["status"]="signal"
        self.assertEqual(build(d,STAMP)["rows"][0]["priority"],"investigate")
    def test_stale(self):
        d=fixture();d["rows"][0].update(status="signal",age=3)
        self.assertEqual(build(d,STAMP)["rows"][0]["priority"],"refresh_first")
    def test_missing(self):
        d=fixture();d["rows"][0].update(status="missing",value=None,year=None,age=None)
        self.assertEqual(build(d,STAMP)["rows"][0]["priority"],"data_required")
    def test_incomplete(self):
        d=fixture();d["rows"].pop()
        with self.assertRaises(ValueError):build(d,STAMP)
    def test_short(self):
        d=fixture();d["rows"][0]["status"]="short"
        self.assertEqual(build(d,STAMP)["counts"]["history_required"],1)
    def test_routes(self):
        self.assertEqual(len(build(fixture(),STAMP)["rows"]),13)
if __name__=="__main__":unittest.main()
