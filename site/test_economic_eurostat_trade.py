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
        d=advance(d,"2026-11-29T15:00:00+00:00",True,lambda k:raw(fixture(k)))
        d=advance(d,"2026-12-05T15:00:00+00:00",True,lambda k:b"bad")
        self.assertEqual(d["series"][CODE]["rows"],original)
        self.assertEqual(d["series"][CODE]["status"],"error")
    def test_offline(self):
        d=advance(blank(),STAMP,False,lambda k:self.fail("network"))
        self.assertTrue(all(r["status"]=="waiting" for r in d["series"].values()))
    def test_signed_balance(self):
        d=fixture("MIO_BAL_VAL");d["value"]["0"]=-20
        self.assertEqual(parse(raw(d),"MIO_BAL_VAL",STAMP)[0]["value"],-20)
    def test_comparison(self):
        d=blank()
        def obs(y,v):return dict(period=y,value=v,flag="")
        d["series"]["MIO_EXP_VAL"]["rows"]=[obs("2023",100),obs("2024",0),obs("2025",30)]
        d["series"]["MIO_IMP_VAL"]["rows"]=[obs("2023",120),obs("2025",40)]
        d["series"]["MIO_BAL_VAL"]["rows"]=[obs("2023",-20.1),obs("2024",0),obs("2025",-5)]
        r=comparison(d)
        self.assertEqual(r["counts"],{"missing":1,"within_tolerance":1,"review":1})
        self.assertEqual(r["rows"][0]["turnover"],220)
        self.assertIsNone(r["rows"][1]["turnover"])
        self.assertIsNone(r["rows"][2]["turnover_yoy_pct"])
    def test_growth(self):
        d=blank()
        for code in ("MIO_EXP_VAL","MIO_IMP_VAL"):
            d["series"][code]["rows"]=[dict(period="2024",value=10,flag="p"),dict(period="2025",value=15,flag="")]
        self.assertEqual(comparison(d)["rows"][-1]["turnover_yoy_pct"],50)
if __name__=="__main__":unittest.main()
