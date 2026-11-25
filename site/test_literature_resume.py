import sqlite3,unittest
from datetime import date
from unittest.mock import patch
import literature as l
import literature_resume as r
class Resume(unittest.TestCase):
    def test_resume_and_watermark(self):
        db=sqlite3.connect(":memory:");self.addCleanup(db.close);r.setup(db)
        stamp="2026-11-26T00:00:00+00:00"
        full,lo,hi,w=r.plan(db,"a",True,None,stamp)
        self.assertEqual(lo,date(1991,1,1))
        with db:self.assertFalse(r.advance(db,"a",date(1995,12,31),hi,w))
        self.assertEqual(r.plan(db,"a",False,stamp,"2026-12-01T00:00:00+00:00")[1],date(1996,1,1))
        with db:self.assertTrue(r.advance(db,"a",hi,hi,w))
        self.assertEqual(r.plan(db,"a",False,"2026-12-01T00:00:00+00:00","2026-12-02T00:00:00+00:00")[1],date(2026,11,24))
    def test_budget_on_recursive_requests(self):
        calls=[]
        def fetch(*args):
            calls.append(args);return {"total-results":1001,"items":[]}
        b=r.Budget(fetch,limit=1)
        with self.assertRaises(r.BudgetExhausted):list(l.period_items("x",[],"pub-date",date(2020,1,1),date(2020,1,2),b))
        self.assertEqual(len(calls),1)
    def test_sync_progress_and_429(self):
        db=sqlite3.connect(":memory:");self.addCleanup(db.close)
        stamp="2026-11-26T00:00:00+00:00"
        with patch.dict(l.JOURNALS,{"x":"Журнал"},clear=True),patch.object(l,"fetch_batch",return_value={"total-results":0,"items":[]}):
            l.sync(db,stamp,True)
            first=db.execute("select start from literature_progress").fetchone()[0]
            self.assertGreater(first,"1991-01-01")
        with patch.dict(l.JOURNALS,{"x":"Журнал"},clear=True),patch.object(l,"fetch_batch",side_effect=l.CrossrefRateLimited("3600")):
            l.sync(db,"2026-11-27T00:00:00+00:00",True)
            self.assertEqual(db.execute("select start from literature_progress").fetchone()[0],first)
            self.assertIsNone(db.execute("select success from journal_checks").fetchone()[0])

    def test_dense_interval_shrinks_without_advancing(self):
        db=sqlite3.connect(":memory:");self.addCleanup(db.close);r.setup(db)
        full,lo,hi,w=r.plan(db,"x",True,None,"2026-11-26T00:00:00+00:00")
        with db:r.shrink_window(db,"x",True)
        self.assertEqual(r.window_days(db,"x",True),915)
        self.assertEqual(r.plan(db,"x",True,None,"2026-11-27T00:00:00+00:00")[1],lo)
        with db:r.clear_window(db,"x")
        self.assertEqual(r.window_days(db,"x",True),1830)
