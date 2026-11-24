import json,unittest
import sme_regions as s
class SME(unittest.TestCase):
    def fixture(self):
        def row(i):return dict(ssrf=str(i),name="Test "+str(i),stat_date="10.11.2026",cnt_total=10,cnt_ul_total=4,cnt_ip_total=6,cnt_worker_total=20)
        return [dict(cnt_name="Российская Федерация",stat_date="10.11.2026",cnt_total=800,cnt_ul_total=320,cnt_ip_total=480,cnt_worker_total=1600),*[row(i) for i in range(1,81)]]
    def parse(self,d):return s.parse(json.dumps(d).encode(),"2026-11-10")
    def test_parse(self):
        r=self.parse(self.fixture());self.assertEqual(len(r["rows"]),80);self.assertEqual(r["regional_sum"]["total"],800)
        self.assertEqual(r["rows"][0]["code"],"01")
        a=dict(r,schema=1,source=s.SOURCE,status="ok",sha256="a"*64)
        self.assertEqual(s.quality(a)[0]["sme_regions"],80)
    def test_period(self):
        self.assertEqual(s.target("2026-11-03"),"2026-10-10")
        self.assertEqual(s.target("2026-01-01"),"2025-12-10")
        self.assertEqual(s.target("2026-11-24"),"2026-11-10")
    def test_duplicate(self):
        d=self.fixture();d[2]["ssrf"]="01"
        with self.assertRaises(ValueError):self.parse(d)
    def test_wrong_date(self):
        d=self.fixture();d[1]["stat_date"]="10.10.2026"
        with self.assertRaises(ValueError):self.parse(d)
    def test_counts(self):
        d=self.fixture();d[1]["cnt_ip_total"]=11
        with self.assertRaises(ValueError):self.parse(d)
