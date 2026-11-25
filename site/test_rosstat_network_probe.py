import unittest
from urllib.error import HTTPError
from types import SimpleNamespace
from unittest.mock import patch
import rosstat_network_probe as p

class ProbeTests(unittest.TestCase):
    def test_url_policy(self):
        self.assertTrue(p.workbook_path("/storage/mediabank/a.xlsx"))
        for path in ("/other/a.xlsx","/storage/mediabank/%2e%2e/a.xls","/storage/mediabank/a%5cb.xls","/storage/mediabank/a.pdf"):
            self.assertFalse(p.workbook_path(path))
        self.assertIn("%20",p.encoded_url("https://rosstat.gov.ru/storage/mediabank/a b.xlsx"))
        with self.assertRaises(ValueError):p.encoded_url("https://rosstat.gov.ru/a.xlsx?x=1")
    def test_access_denial_stops_all(self):
        calls=[]
        def fetch(url,kind):
            calls.append(url)
            raise HTTPError(url,429,"limited",{},None)
        r=p.probe(fetcher=fetch)
        self.assertEqual(len(calls),1)
        self.assertEqual(r["results"][0]["http_status"],429)
        self.assertTrue(all(x["status"]=="skipped_access_restriction" for x in r["results"][1:]))
    def test_parsed_and_rejected_are_distinct(self):
        url="https://rosstat.gov.ru/storage/mediabank/a.xlsx"
        def fetch(u,kind):
            return SimpleNamespace(raw=b"content",charset="utf-8",final_url=u,sha256="a"*64)
        with patch.object(p.h,"discover",return_value=[]),patch.object(p,"select",return_value={"url":url,"title":"test"}):
            r=p.probe(fetcher=fetch,parser=lambda *a:[{"metric":"test"}])
            self.assertTrue(all(x["status"]=="accepted" and x["observations"]==1 for x in r["results"]))
            r=p.probe(fetcher=fetch,parser=lambda *a:[])
            self.assertTrue(all(x["status"]=="parse_rejected" for x in r["results"]))
    def test_bounded_404_recovery(self):
        urls=["https://rosstat.gov.ru/storage/mediabank/"+x+".xlsx" for x in "abcd"]
        options=[dict(url=u,title="test") for u in urls]
        calls=[]
        def fetch(u,kind):
            if kind=="workbook":
                calls.append(u)
                if u!=urls[2]:raise HTTPError(u,404,"missing",{},None)
            return SimpleNamespace(raw=b"content",charset="utf-8",final_url=u,sha256="a"*64)
        with patch.object(p.h,"discover",return_value=[]),patch.object(p,"shortlist",return_value=options):
            r=p.probe(fetcher=fetch,parser=lambda *a:[{"metric":"test"}],alternatives=True)
        self.assertTrue(all(x["status"]=="accepted" and len(x["attempts"])==3 for x in r["results"]))
        self.assertNotIn(urls[3],calls)
    def test_alternatives_stop_on_restriction_and_preserve_evidence(self):
        url="https://rosstat.gov.ru/storage/mediabank/a.xlsx"
        options=[dict(url=url,title="test"),dict(url=url.replace("a.xlsx","b.xlsx"),title="other")]
        calls=[]
        def fetch(u,kind):
            if kind=="workbook":
                calls.append(u)
                raise HTTPError(u,403,"denied",{},None)
            return SimpleNamespace(raw=b"content",charset="utf-8",final_url=u,sha256="a"*64)
        with patch.object(p.h,"discover",return_value=[]),patch.object(p,"shortlist",return_value=options):
            r=p.probe(fetcher=fetch,alternatives=True)
        self.assertEqual(calls,[url])
        self.assertEqual(r["results"][0]["eligible_candidates"],2)
        self.assertEqual(r["results"][0]["attempts"],[dict(url=url,status=403)])
        self.assertTrue(all(x["status"]=="skipped_access_restriction" for x in r["results"][1:]))
    def test_alternatives_record_parse_rejection(self):
        url="https://rosstat.gov.ru/storage/mediabank/a.xlsx"
        def fetch(u,kind):
            return SimpleNamespace(raw=b"content",charset="utf-8",final_url=u,sha256="a"*64)
        with patch.object(p.h,"discover",return_value=[]),patch.object(p,"shortlist",return_value=[dict(url=url,title="test")]):
            r=p.probe(fetcher=fetch,parser=lambda *a:[],alternatives=True)
        self.assertTrue(all(x["attempts"][0]["status"]=="parse_rejected" and x["eligible_candidates"]==1 for x in r["results"]))
if __name__=="__main__":unittest.main()
