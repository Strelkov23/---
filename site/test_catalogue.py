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
        self.assertTrue(status.startswith("Частично проверено:"),f"Crossref sync failed: {status}")
        self.assertEqual(len(requests),1)
        self.assertIsNone(self.db.execute("select success from journal_checks where issn=?",("0042-8736",)).fetchone()[0])
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
        with patch.dict(literature.JOURNALS,{"0042-8736":"Вопросы экономики"},clear=True),patch("literature.urlopen",side_effect=err),patch("literature_resume.Budget.available",return_value=True),patch("literature.time.monotonic",side_effect=[100,100,700]):
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
        self.assertTrue(self.db.execute("select status from journal_checks where issn='0042-8736'").fetchone()[0].startswith("Частично проверено:"))
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
    def test_access_metadata(self):
        x={"license":[{"URL":"https://creativecommons.org/licenses/by/4.0/","content-version":"vor","start":{"date-parts":[[2026,1,2]]}},{"URL":"javascript:alert(1)"},{"URL":"http://127.0.0.1/x"}],"link":[{"URL":"https://publisher.example.org/paper.pdf","content-type":"application/pdf","intended-application":"text-mining"},{"URL":"https://user:password@example.org/file"},{"URL":"https://publisher.example.org/read","intended-application":"similarity-checking"}]}
        a=literature.metadata(x)["access"]
        self.assertEqual(len(a["licenses"]),1)
        self.assertEqual(a["licenses"][0]["start"],"2026-01-02")
        self.assertEqual(len(a["links"]),2)
        self.assertEqual(a["links"][0]["application"],"text-mining")
        self.assertEqual(literature.metadata({})["access"],{"licenses":[],"links":[]})
        self.assertEqual(literature.public_link("https://host.local/file"),"")
    def test_preserve_bibliographic_fields_not_access(self):
        old=dict(volume="3",pages="12-20",cited_by=15,access={"licenses":[{"url":"old"}],"links":[]},metadata_carried={"pages":"2026-11-20"})
        x=literature.preserve_bibliography(literature.metadata({"volume":"4"}),old,"2026-11-24")
        self.assertEqual(x["volume"],"4")
        self.assertEqual(x["pages"],"12-20")
        self.assertEqual(x["metadata_carried"],{"pages":"2026-11-20"})
        self.assertIsNone(x["cited_by"])
        self.assertEqual(x["access"],{"licenses":[],"links":[]})
        self.assertFalse(x["access_observed"])
    def test_cc_evidence_and_catalogue_quality(self):
        import literature_quality as lq
        url="https://creativecommons.org/licenses/by/4.0/"
        self.assertEqual(lq.cc_license(url),"CC BY 4.0")
        self.assertIsNone(lq.cc_license("https://creativecommons.org.example.org/licenses/by/4.0/"))
        self.assertIsNone(lq.cc_license("https://creativecommons.org/publicdomain/mark/1.0/"))
        licenses=[dict(url=url,version="vor",start="2025-01-01"),dict(url=url,version="am",start="2027-01-01"),dict(url=url,version="",start="2024-01-01"),dict(url=url,version="vor",start=None)]
        paper=dict(doi="10.1234/a",journal="Вопросы экономики",authors="A",volume="1",issue="2",pages="3",access=dict(licenses=licenses,links=[{"application":"similarity-checking"}]),access_observed=True)
        stamp="2026-11-25T12:00:00+00:00"
        lq.decorate([paper],stamp)
        self.assertEqual(len(paper["cc_evidence"]),1)
        lit=dict(articles=[paper],registry=literature.registry(),links={})
        d=lq.collect(lit,stamp)
        self.assertEqual(d["total"]["complete_bibliography"],1)
        self.assertEqual(d["total"]["with_cc_evidence"],1)
        self.assertEqual(d["total"]["with_reading_link"],0)
        self.assertEqual(d["total"]["link_unchecked"],1)
        lq.quality(d,lit)
        d["total"]["with_cc_evidence"]=2
        with self.assertRaises(ValueError):lq.quality(d,lit)
    def test_openalex_exact_doi_and_versions(self):
        import openalex_access as oa
        raw={"id":"https://openalex.org/W123","doi":"https://doi.org/10.1234/test","open_access":{"is_oa":True,"oa_status":"green"},"best_oa_location":{"is_oa":True,"pdf_url":"https://repository.example.org/paper.pdf","landing_page_url":"https://repository.example.org/paper","version":"acceptedVersion","license":"cc-by","source":{"type":"repository"}}}
        x=oa.parse(raw,"10.1234/test")
        self.assertEqual(x["host_type"],"repository")
        self.assertEqual(x["version"],"acceptedVersion")
        self.assertTrue(x["is_oa"])
        with self.assertRaises(ValueError):oa.parse(raw,"10.1234/other")
        raw["best_oa_location"]["pdf_url"]="http://127.0.0.1/file"
        self.assertEqual(oa.parse(raw,"10.1234/test")["pdf"],"")
        raw["open_access"]["oa_status"]="closed"
        with self.assertRaises(ValueError):oa.parse(raw,"10.1234/test")
        self.assertEqual(oa.normalize("10.1234/../x"),"")
    def test_openalex_bounded_and_cached(self):
        import openalex_access as oa
        papers=[{"doi":"10.1234/test"},{"doi":"10.1234/next"}]
        stamp="2026-11-25T10:00:00+00:00"
        e=dict(work="https://openalex.org/W123",is_oa=True,oa_status="gold",pdf="",landing="https://publisher.example.org/a",license="cc-by",version="publishedVersion",host_type="journal")
        with patch("openalex_access.retrieve",side_effect=[("accepted",e),("deferred",None)]) as fetch:
            oa.sync(self.db,papers,stamp,True)
            oa.sync(self.db,papers,stamp,True)
            self.assertEqual(fetch.call_count,2)
        self.assertEqual({oa.quality(p) for p in papers},{"reported_open","deferred"})
        with patch("openalex_access.retrieve",side_effect=AssertionError("network")):
            oa.sync(self.db,papers,"2026-11-26T10:00:00+00:00",False)
        self.assertEqual({oa.quality(p) for p in papers},{"reported_open","deferred"})
    def test_openalex_journal_rotation_and_expired_evidence(self):
        import openalex_access as oa
        papers=[{"doi":"10.1234/a","journal":"A"},{"doi":"10.1234/b","journal":"A"},{"doi":"10.2222/a","journal":"B"},{"doi":"10.3333/a","journal":"C"}]
        self.assertEqual(oa.candidates(papers,{},"2026-08-01",3),["10.1234/a","10.2222/a","10.3333/a"])
        self.assertNotIn("10.1234/a",oa.candidates(papers,{"10.1234/a":("2026-11-24",)},"2026-08-01",10))
        stamp="2026-01-01T10:00:00+00:00"
        e=dict(work="https://openalex.org/W123",is_oa=True,oa_status="green",pdf="",landing="https://repo.example.org/a",license="cc-by",version="acceptedVersion",host_type="repository")
        oa.sync(self.db,papers[:1],stamp,True,request=lambda d:("accepted",e))
        oa.sync(self.db,papers[:1],"2026-11-25T10:00:00+00:00",True,request=lambda d:("deferred",None))
        x=papers[0]["openalex_access"]
        self.assertEqual(oa.quality(papers[0]),"deferred")
        self.assertEqual(x["success"],stamp)
        self.assertEqual(x["evidence"],e)
    def test_openalex_denial_stops(self):
        import openalex_access as oa
        err=HTTPError("https://api.openalex.org/works/doi:10.1234/test",402,"Budget",{},None)
        with patch("source_registry.fetch",side_effect=err):
            self.assertEqual(oa.retrieve("10.1234/test"),("deferred",None))
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
