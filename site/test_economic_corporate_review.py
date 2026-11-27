import unittest
from economic_corporate_review import *
STAMP="2026-11-27T15:00:00+00:00"
NEXT="2026-12-28T15:00:00+00:00"
def sample(sha="a",value=100,status="extracted"):
    d=pdf.blank();d.update(status=status,sha256=sha*64,checked=STAMP,success=STAMP,rows=[dict(year=y,value=value) for y in pdf.YEARS])
    d["comparison"]=[dict(year=y,value=value,archived=100,residual=value-100,status="match" if value==100 else "review") for y in pdf.YEARS]
    return d
class ReviewTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(advance(empty(),pdf.blank(),STAMP)["rows"],{})
    def test_idempotent(self):
        d=advance(empty(),sample(),STAMP);ids=set(d["rows"])
        d=advance(d,sample(),NEXT)
        self.assertEqual(set(d["rows"]),ids);self.assertEqual(d["counts"]["matched_archive"],4)
        self.assertTrue(all(r["first_seen"]==STAMP for r in d["rows"].values()))
    def test_revision(self):
        d=advance(empty(),sample(),STAMP);d=advance(d,sample("b",101),NEXT)
        self.assertEqual(d["counts"]["superseded"],4);self.assertEqual(d["counts"]["review_difference"],4)
    def test_cache(self):
        d=advance(empty(),sample(),STAMP);d=advance(d,sample(status="error"),NEXT)
        self.assertEqual(d["counts"]["cached"],4);self.assertEqual(len(d["rows"]),4)
    def test_wrong_comparison(self):
        s=sample();s["comparison"][0]["status"]="review"
        with self.assertRaises(ValueError):advance(empty(),s,STAMP)
    def test_missing(self):
        s=sample();s["comparison"][0].update(archived=None,residual=None,status="missing")
        self.assertEqual(advance(empty(),s,STAMP)["counts"]["missing_archive"],1)
if __name__=="__main__":unittest.main()
