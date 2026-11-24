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

    def test_historical_observations_follow_import_not_catalogue(self):
        primary="https://fedstat.ru/indicator/61483"
        file="https://storage.yandexcloud.net/archive/61483.parquet"
        data=[dict(source=file,last=2023)]
        r=dict(code="emiss_61483",url=primary,success="2026-11-24",files=[dict(url=file,format="parquet")])
        self.assertEqual(f.historical_latest(r,data),"2023")
        self.assertIsNone(f.historical_latest(dict(r,success=None),data))
        self.assertIsNone(f.historical_latest(dict(r,code="emiss_grp"),data))
        self.assertEqual(f.historical_latest(dict(code="mirror_grp",url=file),data),"2023")
    def test_partial_import(self):
        now=f.dt("2026-11-25T10:00:00Z")
        self.assertEqual(f.state(now,now,"Ключей: 12; частичный импорт; исключён 2022",now,7),"partial")
        self.assertEqual(f.state(now,now-timedelta(days=1),"Ошибка 404",now,7),"cached")
        self.assertEqual(f.quality(dict(schema=1,built="2026-11-25",rows=[dict(id="a",state="partial",next_check=None)])),{"partial":1})
    def test_workbook_retry_calculation(self):
        now=f.dt("2026-11-25T10:00:00Z")
        self.assertEqual(f.workbook_next({},now),now)
        self.assertEqual(f.workbook_next(dict(checked="2026-11-25",success="2026-11-25"),now),f.dt("2026-12-25"))
        self.assertEqual(f.workbook_next(dict(checked="2026-11-25",success="2026-11-24"),now),f.dt("2026-12-02"))
        self.assertEqual(f.workbook_next(dict(checked="2026-11-25",success="2026-11-25",attempt_url="old",catalogue_url="new"),now),now)
