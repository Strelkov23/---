import unittest
from types import SimpleNamespace
from economic_web_crawl import *
NOW="2026-11-27T15:00:00+00:00"
HTML='<h5><a href="/econres/feds/a-research-paper.htm">An economic <em>research</em> paper</a></h5><h5><a href="/econres/feds/2026.htm">Year 2026</a></h5><h5><a href="https://example.com/econres/feds/other.htm">External paper</a></h5>'
def mock(url):
    if url==ROBOTS:return SimpleNamespace(raw=b"User-agent: *\nDisallow: /private",charset="utf-8",media_type="text/plain")
    return SimpleNamespace(raw=HTML.encode(),charset="utf-8",media_type="text/html",sha256="0"*64)
class CrawlTests(unittest.TestCase):
    def test_links(self):
        self.assertEqual(parse(HTML),{"https://www.federalreserve.gov/econres/feds/a-research-paper.htm":"An economic research paper"})
    def test_reject(self):
        self.assertIsNone(paper_url("https://www.federalreserve.gov.evil.test/econres/feds/paper.htm"))
        self.assertIsNone(paper_url("/econres/feds/paper.htm?x=1"))
    def test_robots(self):
        self.assertIsNone(allowed("User-agent: *\nDisallow: /econres/"))
    def test_import(self):
        d=advance(blank(),NOW,True,mock,lambda x:None)
        self.assertEqual(d["status"],"ok");self.assertEqual(validate(d),1)
    def test_blocked(self):
        def blocked(url):
            self.assertEqual(url,ROBOTS)
            return SimpleNamespace(raw=b"User-agent: *\nDisallow: /",charset="utf-8",media_type="text/plain")
        self.assertEqual(advance(blank(),NOW,True,blocked,lambda x:None)["status"],"blocked")
    def test_retains(self):
        d=advance(blank(),NOW,True,mock,lambda x:None)
        def fail(url):raise OSError()
        d=advance(d,"2026-11-29T15:00:00+00:00",True,fail,lambda x:None)
        self.assertEqual(d["status"],"error");self.assertEqual(len(d["rows"]),1)
    def test_offline(self):
        def fail(url):self.fail("Unexpected network")
        self.assertEqual(advance(blank(),NOW,False,fail)["rows"],{})
if __name__=="__main__":unittest.main()
