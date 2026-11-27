import unittest
from economic_abstracts import *
STAMP="2026-11-27T15:00:00+00:00"
ACCESS={"licenses":[{"url":LICENSE,"version":"vor","start":"2025-01-01"}]}
ITEM={"abstract":"<jats:p>Economic <b>growth</b> model.</jats:p>","author":[{"family":"Example"}]}
class AbstractTests(unittest.TestCase):
    def test_allowed(self):
        self.assertEqual(extract(ITEM,ACCESS,STAMP)["text"],"Economic growth model.")
    def test_tdm(self):
        self.assertIsNone(extract(ITEM,{"licenses":[dict(ACCESS["licenses"][0],version="tdm")]},STAMP))
    def test_future(self):
        self.assertIsNone(extract(ITEM,{"licenses":[dict(ACCESS["licenses"][0],start="2027-01-01")]},STAMP))
    def test_ambiguous(self):
        self.assertIsNone(extract(ITEM,{"licenses":ACCESS["licenses"]+[dict(ACCESS["licenses"][0],url="https://example.org/license")]},STAMP))
    def test_no_author(self):
        self.assertIsNone(extract({"abstract":"text"},ACCESS,STAMP))
    def test_markup(self):
        self.assertEqual(extract(dict(ITEM,abstract="<p>Text</p><script>bad</script>"),ACCESS,STAMP)["text"],"Text")
    def test_oversize(self):
        self.assertIsNone(extract(dict(ITEM,abstract="x"*4001),ACCESS,STAMP))
    def test_no_license(self):
        self.assertIsNone(extract(ITEM,{},STAMP))
class AbstractBackfillTests(unittest.TestCase):
    def setUp(self):
        import sqlite3,literature
        self.lit=literature
        self.db=sqlite3.connect(":memory:")
        self.db.execute("create table literature(doi text primary key,journal text,published text,title text,authors text,topics text)")
        self.db.execute("create table literature_meta(doi text primary key,payload text,checked text)")
        self.issn=min(literature.JOURNALS)
        self.doi="10.1234/abstract"
        self.db.execute("insert into literature values(?,?,?,?,?,?)",(self.doi,literature.JOURNALS[self.issn],"2026-01-01","Test article","Example","Economics"))
        self.item=dict(ITEM,DOI=self.doi,title=["Test article"],license=[{"URL":LICENSE,"content-version":"vor","start":{"date-parts":[[2025,1,1]]}}])
    def tearDown(self):
        self.db.close()
    def fetch(self,item):
        def run(issn,filters,offset):
            self.assertEqual(issn,self.issn)
            self.assertIn("has-abstract:true",filters)
            self.assertIn("has-license:true",filters)
            self.assertEqual(offset,0)
            return {"total-results":1,"items":[item]}
        return run
    def test_targeted_backfill(self):
        import json
        self.assertEqual(self.lit.abstract_backfill(self.db,STAMP,self.fetch(self.item)),1)
        p=json.loads(self.db.execute("select payload from literature_meta").fetchone()[0])
        self.assertEqual(p["licensed_abstract"]["text"],"Economic growth model.")
        self.assertEqual(self.db.execute("select year,offset from literature_abstract_progress").fetchone(),(2025,0))
    def test_unlicensed(self):
        self.assertEqual(self.lit.abstract_backfill(self.db,STAMP,self.fetch(dict(self.item,license=[]))),0)
        self.assertIsNone(self.db.execute("select payload from literature_meta").fetchone())
    def test_wrong_title(self):
        self.assertEqual(self.lit.abstract_backfill(self.db,STAMP,self.fetch(dict(self.item,title=["Wrong"]))),0)
    def test_missing_doi(self):
        self.assertEqual(self.lit.abstract_backfill(self.db,STAMP,self.fetch(dict(self.item,DOI="10.1234/unknown"))),0)
    def test_failed_page(self):
        with self.assertRaises(ValueError):
            self.lit.abstract_backfill(self.db,STAMP,lambda *a:{"total-results":1,"items":[]})
        self.assertIsNone(self.db.execute("select * from literature_abstract_progress").fetchone())
    def test_rate_limit(self):
        def fail(*a):raise self.lit.CrossrefRateLimited("60")
        with self.assertRaises(self.lit.CrossrefRateLimited):
            self.lit.abstract_backfill(self.db,STAMP,fail)
        self.assertIsNone(self.db.execute("select * from literature_abstract_progress").fetchone())
class AbstractSchedulingTests(unittest.TestCase):
    def test_existing_catalogue_normal_first(self):
        import sqlite3,literature as l
        from unittest.mock import patch
        db=sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        l.sync(db,STAMP,False)
        issn="0042-8736"
        db.execute("insert into literature values(?,?,?,?,?,?)",("10.1234/old",l.JOURNALS[issn],"2025","Saved","A",""))
        calls=[]
        def fetch(issn,filters,offset=0):
            calls.append(filters)
            return {"total-results":0,"items":[]}
        with patch.dict(l.JOURNALS,{issn:l.JOURNALS[issn]},clear=True),patch.object(l,"fetch_batch",side_effect=fetch):
            l.sync(db,STAMP,True)
        self.assertEqual(len(calls),2)
        self.assertNotIn("has-abstract:true",calls[0])
        self.assertIn("has-abstract:true",calls[1])
    def test_normal_429_skips_targeted(self):
        import sqlite3,literature as l
        from unittest.mock import patch
        db=sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        l.sync(db,STAMP,False)
        issn="0042-8736"
        db.execute("insert into literature values(?,?,?,?,?,?)",("10.1234/old",l.JOURNALS[issn],"2025","Saved","A",""))
        with patch.dict(l.JOURNALS,{issn:l.JOURNALS[issn]},clear=True),patch.object(l,"fetch_batch",side_effect=l.CrossrefRateLimited("120")) as fetch:
            l.sync(db,STAMP,True)
            self.assertEqual(fetch.call_count,1)
            self.assertNotIn("has-abstract:true",fetch.call_args.args[1])
        self.assertTrue(l.service_status(db,STAMP)["cooldown"])
if __name__=="__main__":unittest.main()
