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
if __name__=="__main__":unittest.main()
