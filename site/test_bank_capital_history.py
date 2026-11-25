import unittest,tempfile,json
from pathlib import Path
import bank_capital as c
import bank_capital_history as h
from test_bank_capital import fixture
class History(unittest.TestCase):
    def test_period(self):
        raw=fixture().replace(b"1.01.2026",b"1.07.2026")
        self.assertEqual(c.parse(raw,"utf-8","2650","2026-07-01")["source"],c.url("2650","2026-07-01"))
        with self.assertRaises(ValueError):c.parse(raw,"utf-8","2650","2026-04-01")
        self.assertNotIn("2026-10-01",h.periods("2026-10-15"))
    def test_refresh(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp);directory={"datasets":{"system":{"edition":"2026-10-07","rows":[{"registration_number":"2650"}]}}}
            initial={"period":c.PERIOD,"rows":[c.parse(fixture(),"utf-8","2650")]}
            calls=[]
            def fetch(reg,period):
                calls.append(period)
                return c.parse(fixture().replace(b"1.01.2026",b"1.10.2026"),"utf-8",reg,period)
            d=h.publish(out,out,"2026-11-25T10:00:00Z",True,directory,initial,fetch)
            self.assertEqual(calls,["2026-10-01"]);self.assertEqual(h.quality(d)["bank_capital_history_records"],2)
            h.publish(out,out,"2026-11-25T11:00:00Z",True,directory,initial,fetch)
            self.assertEqual(len(calls),1)
