import unittest
from economic_external_research import *
STAMP="2026-11-27T15:00:00+00:00"
FEED=b'''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:o="http://a9.com/-/spec/opensearch/1.1/"><o:totalResults>1</o:totalResults><o:startIndex>0</o:startIndex><entry><id>http://arxiv.org/abs/2611.12345v1</id><title>Economic model</title><published>2026-11-25T00:00:00Z</published><updated>2026-11-25T00:00:00Z</updated><category term="econ.GN"/><author><name>Test Author</name></author></entry></feed>'''
class ResearchTests(unittest.TestCase):
    def test_import(self):
        d=advance(blank(),STAMP,True,lambda cat:FEED)
        self.assertEqual(validate(d),1)
        self.assertEqual(d["next_category"],1)
        self.assertEqual(d["rows"]["2611.12345"]["url"],"https://arxiv.org/abs/2611.12345")
    def test_incomplete(self):
        with self.assertRaises(ValueError):parse(FEED.replace(b">1<",b">2<"),CATS[0],STAMP)
    def test_category(self):
        with self.assertRaises(ValueError):parse(FEED,"econ.EM",STAMP)
    def test_xml(self):
        with self.assertRaises(ValueError):parse(b"<!DOCTYPE feed>"+FEED,CATS[0],STAMP)
    def test_failure_retains(self):
        d=advance(blank(),STAMP,True,lambda cat:FEED)
        def fail(cat):raise OSError()
        d=advance(d,"2026-11-29T15:00:00+00:00",True,fail)
        self.assertEqual(d["status"],"error")
        self.assertEqual(len(d["rows"]),1)
    def test_offline(self):
        def fail(cat):self.fail("Unexpected network")
        self.assertEqual(advance(blank(),STAMP,False,fail)["rows"],{})
if __name__=="__main__":unittest.main()
