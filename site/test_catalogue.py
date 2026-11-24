import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
import literature
import link_audit

class CatalogueTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        literature.sync(self.db,"2026-11-24T00:00:00+00:00",False)
    def tearDown(self):
        self.db.close()
    def test_registry(self):
        registry=literature.registry()
        self.assertEqual(set(registry),set(literature.JOURNALS.values()))
        self.assertGreaterEqual(len(registry),13)
        self.assertEqual(registry['Проблемы прогнозирования']['white_history'],{'2023':2,'2025':1})
        tags={tag for m in registry.values() for tag in m["tags"]}
        for tag in ("ВАК К1","ВАК К2","ВАК К3","РИНЦ","Scopus","RSCI","Web of Science"):
            self.assertIn(tag,tags)
        self.assertTrue(all(m["sources"] and m["verified"] for m in registry.values()))
    def test_crossref_bounded_windows(self):
        from urllib.parse import urlsplit,parse_qs
        from io import BytesIO
        requests=[]
        def request(req,timeout):
            query=parse_qs(urlsplit(req.full_url).query)
            requests.append(query)
            filters=query["filter"][0]
            self.assertNotIn("cursor",query)
            self.assertIn("issn:0042-8736",filters)
            self.assertIn("until-pub-date:",filters)
            first="from-pub-date:1991-01-01" in filters
            items=[{"DOI":"10.1234/new","title":["Test"],"published":{"date-parts":[[1991]]}}] if first else []
            return BytesIO(json.dumps({"message":{"total-results":len(items),"items":items}}).encode())
        with patch.dict(literature.JOURNALS,{"0042-8736":"Вопросы экономики"},clear=True),patch("literature.urlopen",side_effect=request):
            literature.sync(self.db,"2026-11-24T00:00:00+00:00",True)
        status=self.db.execute("select status from journal_checks where issn=?",("0042-8736",)).fetchone()[0]
        self.assertEqual(status,"Проверено",f"Crossref sync failed: {status}")
        self.assertGreater(len(requests),1)
        self.assertEqual(self.db.execute("select title from literature where doi='10.1234/new'").fetchone()[0],"Test")
    def test_rate_limit_persists_and_preserves_archive(self):
        stamp="2026-11-24T00:00:00+00:00"
        journals={"0042-8736":"Вопросы экономики","2221-2264":"Журнал Новой экономической ассоциации"}
        self.db.execute("insert into literature values(?,?,?,?,?,?)",("10.1234/old","Вопросы экономики","2025","Saved","A",""))
        self.db.execute("insert into journal_checks values(?,?,?,?)",("0042-8736","2026-11-23T00:00:00+00:00","2026-11-23T00:00:00+00:00","Проверено"))
        self.db.execute("insert into journal_checks values(?,?,?,?)",("2221-2264","2026-11-23T00:00:00+00:00","2026-11-23T00:00:00+00:00","Проверено"))
        err=HTTPError("https://api.crossref.org/works",429,"Too many requests",{"Retry-After":"120"},None)
        with patch.dict(literature.JOURNALS,journals,clear=True),patch("literature.urlopen",side_effect=err) as request:
            literature.sync(self.db,stamp,True)
            self.assertEqual(request.call_count,1)
            state=literature.service_status(self.db,stamp)
            self.assertTrue(state["cooldown"])
            self.assertEqual(state["retry_at"],"2026-11-24T00:02:00+00:00")
            literature.sync(self.db,"2026-11-24T00:01:00+00:00",True)
            self.assertEqual(request.call_count,1)
            self.assertEqual(self.db.execute("select count(*) from literature").fetchone()[0],1)
            rows={r["issn"]:r for r in self.db.execute("select * from journal_checks")}
            self.assertEqual(rows["0042-8736"]["success"],"2026-11-23T00:00:00+00:00")
            self.assertEqual(rows["2221-2264"]["checked"],"2026-11-23T00:00:00+00:00")
            self.assertIn("Отложено",rows["2221-2264"]["status"])
            literature.sync(self.db,"2026-11-24T00:03:00+00:00",True)
            self.assertEqual(request.call_count,2)
            from urllib.parse import unquote
            self.assertIn("issn:2221-2264",unquote(request.call_args.args[0].full_url))
    def test_retry_after_is_relative_to_response_time(self):
        stamp="2026-11-24T00:00:00+00:00"
        err=HTTPError("https://api.crossref.org/works",429,"Too many requests",{"Retry-After":"120"},None)
        with patch.dict(literature.JOURNALS,{"0042-8736":"Вопросы экономики"},clear=True),patch("literature.urlopen",side_effect=err),patch("literature.time.monotonic",side_effect=[100,700]):
            literature.sync(self.db,stamp,True)
        state=literature.service_status(self.db,"2026-11-24T00:11:00+00:00")
        self.assertEqual(state["limited_at"],"2026-11-24T00:10:00+00:00")
        self.assertEqual(state["retry_at"],"2026-11-24T00:12:00+00:00")
        self.assertTrue(state["cooldown"])
    def test_rate_limit_recovery(self):
        stamp="2026-11-24T00:00:00+00:00"
        err=HTTPError("https://api.crossref.org/works",429,"Too many requests",{"Retry-After":"60"},None)
        with patch.dict(literature.JOURNALS,{"0042-8736":"Вопросы экономики"},clear=True):
            with patch("literature.urlopen",side_effect=err):
                literature.sync(self.db,stamp,True)
            with patch("literature.fetch_batch",return_value={"total-results":0,"items":[]}):
                literature.sync(self.db,"2026-11-24T00:02:00+00:00",True)
        self.assertFalse(literature.service_status(self.db,"2026-11-24T00:02:00+00:00")["cooldown"])
        self.assertEqual(self.db.execute("select status from journal_checks where issn='0042-8736'").fetchone()[0],"Проверено")
    def test_retry_after_formats(self):
        stamp="2026-11-24T00:00:00+00:00"
        self.assertEqual(literature.retry_deadline(stamp,"Tue, 24 Nov 2026 00:10:00 GMT"),"2026-11-24T00:10:00+00:00")
        self.assertEqual(literature.retry_deadline(stamp,"0"),"2026-11-24T00:01:00+00:00")
        self.assertEqual(literature.retry_deadline(stamp,None),"2026-11-24T01:00:00+00:00")
        self.assertEqual(literature.retry_deadline(stamp,"invalid"),"2026-11-24T01:00:00+00:00")
    def test_crossref_incomplete_page(self):
        from datetime import date
        with patch("literature.fetch_batch",return_value={"total-results":2,"items":[]}):
            with self.assertRaises(ValueError):
                list(literature.period_items("0042-8736",[],"pub-date",date(2020,1,1),date(2020,1,1)))
    def test_metadata(self):
        item={"volume":"2","issue":"3","page":"10-20","is-referenced-by-count":0}
        self.assertEqual(literature.metadata(item)["pages"],"10-20")
        self.assertEqual(literature.metadata(item)["cited_by"],0)
        self.assertIsNone(literature.metadata({})["cited_by"])
        self.db.execute("insert into literature_meta values(?,?,?)",("10.1234/test",'{"volume":"2"}',"2026-11-24"))
        self.assertEqual(literature.enrich(self.db,[{"doi":"10.1234/test"}])[0]["volume"],"2")
    def test_classification_and_audit(self):
        self.db.execute("insert into literature values(?,?,?,?,?,?)",("10.1234/a?b","Вопросы экономики","2026-01","Стратегическое планирование промышленности","A",""))
        literature.reclassify(self.db)
        self.assertIn("Стратегическое планирование",self.db.execute("select topics from literature").fetchone()[0])
        self.assertEqual(literature.doi_url("10.1234/a?b"),"https://doi.org/10.1234/a%3Fb")
        with patch("literature.check_link",return_value=("10.1234/a?b","ok","https://example.com/article","200")):
            rows=literature.audit_links(self.db,"2026-11-24",True)
        self.assertEqual(rows["10.1234/a?b"]["status"],"ok")
        self.assertEqual(literature.audit_links(self.db,"2026-11-24",False),rows)
    def test_http_error(self):
        error=HTTPError("https://doi.org/10.1234/a",404,"Missing",{},None)
        with patch("literature.urlopen",side_effect=error):
            self.assertEqual(literature.check_link("10.1234/a")[1],"missing")
    def test_internal_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)
            (out/"index.html").write_text('<a href="papers.html#list">a</a><a href="missing.html">b</a><a href="papers.html#bad">c</a><a href="https://example.com/">d</a>',encoding="utf-8")
            (out/"papers.html").write_text('<div id="list"></div>',encoding="utf-8")
            errors,external=link_audit.scan(out)
            self.assertEqual(len(errors),2)
            self.assertIn("https://example.com/",external)
        self.assertTrue(link_audit.trusted("https://www.vedomosti.ru/article"))
        self.assertFalse(link_audit.trusted("https://vedomosti.ru.evil.example/"))
        self.assertFalse(link_audit.trusted("http://127.0.0.1/"))
if __name__=="__main__":
    unittest.main()
