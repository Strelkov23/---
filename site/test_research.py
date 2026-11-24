import io
import json
import sqlite3
import unittest
from unittest.mock import patch
from urllib.error import URLError
import cbr_data
import industry
import indicators
import series

class ResearchTests(unittest.TestCase):
    def test_registry(self):
        self.assertGreaterEqual(len(indicators.META),100)
        self.assertTrue(all(len(v)==4 and v[3] in indicators.AGENCIES for v in indicators.META.values()))
    def test_cbr(self):
        self.assertEqual(cbr_data.key_rows('<table><tr><td>01.02.2026</td><td>15,50</td></tr></table>'.encode()),{"2026-02-01":15.5})
        xml=b'<ValCurs ID="R01235"><Record Date="01.02.2026"><Nominal>10</Nominal><Value>900,50</Value></Record></ValCurs>'
        self.assertAlmostEqual(cbr_data.fx_rows(xml,"R01235")["2026-02-01"],90.05)
    def test_rosstat(self):
        self.assertEqual(industry.parse_months("Индекс промышленного производства в марте 2026 г. по сравнению с мартом 2025 г. – 102,3%"),{"2026-03":102.3})
    def test_industry_rejects_unrelated(self):
        self.assertEqual(industry.parse_months("в марте 2026 г. по сравнению с мартом 2025 г. – 102,3%"),{})
        self.assertEqual(industry.parse_months("Индекс промышленного производства в марте 2026 г. по сравнению с январем 2025 г. – 102,3%"),{})
    def test_revisions(self):
        db=sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript("create table annual(code text,year text,value real,seen text,primary key(code,year,seen));create table checks(url text primary key,checked text,success text,status text);")
        code="NY.GDP.MKTP.KD.ZG"
        with patch.dict(indicators.META,{code:indicators.META[code]},clear=True):
            with patch("series.retrieve",return_value=(code,{"2020":1.0},None,"2026-01-01")):series.refresh(db,"2026-11-23T00:00:00+00:00")
            with patch("series.retrieve",return_value=(code,{"2020":None},None,"2026-01-02")):series.refresh(db,"2026-11-24T00:00:00+00:00")
        self.assertEqual(db.execute("select value from annual order by seen").fetchall(),[(1.0,),(None,)])
    def test_incomplete_api(self):
        payload=[{"pages":2,"total":2},[]]
        with patch("series.urlopen",return_value=io.BytesIO(json.dumps(payload).encode())):
            self.assertIsNotNone(series.retrieve("X")[2])
if __name__=="__main__":unittest.main()
