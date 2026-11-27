import unittest
from economic_eurostat_trade import *
STAMP="2026-11-27T15:00:00+00:00"
CODE="MIO_EXP_VAL"
def fixture(code=CODE):
    dims={**FIXED,"indic_et":code}
    return dict(version="2.0",**{"class":"dataset"},id=[*dims,"time"],size=[1]*len(dims)+[4],dimension={**{k:{"category":{"index":{v:0}}} for k,v in dims.items()},"time":{"category":{"index":{"2023":0,"2024":1,"2025":2,"2026":3}}}},value={"0":100,"2":0,"3":99},status={"0":"p"})
def raw(d):return json.dumps(d).encode()
class TradeTests(unittest.TestCase):
    def test_closed_missing_zero(self):
        r=parse(raw(fixture()),CODE,STAMP)
        self.assertEqual(r,[{"period":"2023","value":100,"flag":"p"},{"period":"2025","value":0,"flag":""}])
    def test_wrong_partner(self):
        d=fixture();d["dimension"]["partner"]["category"]["index"]={"US":0}
        with self.assertRaises(ValueError):parse(raw(d),CODE,STAMP)
    def test_wrong_indicator(self):
        with self.assertRaises(ValueError):parse(raw(fixture()),"MIO_IMP_VAL",STAMP)
    def test_negative(self):
        d=fixture();d["value"]["0"]=-1
        with self.assertRaises(ValueError):parse(raw(d),CODE,STAMP)
    def test_failure_retains(self):
        d=advance(blank(),STAMP,True,lambda k:raw(fixture(k)))
        original=d["series"][CODE]["rows"][:]
        d=advance(d,"2026-11-28T15:00:00+00:00",True,lambda k:raw(fixture(k)))
        d=advance(d,"2026-12-05T15:00:00+00:00",True,lambda k:b"bad")
        self.assertEqual(d["series"][CODE]["rows"],original)
        self.assertEqual(d["series"][CODE]["status"],"error")
    def test_offline(self):
        d=advance(blank(),STAMP,False,lambda k:self.fail("network"))
        self.assertTrue(all(r["status"]=="waiting" for r in d["series"].values()))
if __name__=="__main__":unittest.main()
