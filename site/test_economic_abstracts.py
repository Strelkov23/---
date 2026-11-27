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
if __name__=="__main__":unittest.main()
