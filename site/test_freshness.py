import unittest
from datetime import timedelta
import freshness as f
class FreshnessTests(unittest.TestCase):
    def test_states(self):
        now=f.dt("2026-11-24T12:00:00Z");old=now-timedelta(days=3)
        self.assertEqual(f.state(now,now,"Получено",now,1),"ok")
        self.assertEqual(f.state(now,old,"Ошибка 403",now,1),"cached")
        self.assertEqual(f.state(old,old,"Получено",now,1),"overdue")
        self.assertEqual(f.state(None,None,"",now,1),"waiting")
        self.assertEqual(f.state(now,None,"Ошибка",now,1),"unavailable")
        self.assertEqual(f.state(now,old,"",now,None,True),"archive")
    def test_schedule(self):
        now=f.dt("2026-11-24T12:00:00Z")
        self.assertEqual(f.iso(f.next_run(now)),"2026-11-25T03:17:00+00:00")
        self.assertEqual(f.iso(f.next_run(now,now+timedelta(days=14))),"2026-12-09T03:17:00+00:00")
    def test_periods(self):
        self.assertEqual(f.latest([2020,"2023","2024-01",None,"bad"]),"2024-01")
    def test_quality(self):
        data=dict(schema=1,built="2026-11-24",rows=[dict(id="a",state="archive",next_check=None)])
        self.assertEqual(f.quality(data),{"archive":1})
        with self.assertRaises(ValueError):f.quality(dict(data,rows=data["rows"]*2))
        with self.assertRaises(ValueError):f.quality(dict(data,rows=[dict(id="a",state="archive",next_check="2026-11-25")]))
