import unittest
from economic_corporate_monitor import *
STAMP="2026-11-27T15:00:00+00:00"
KEY=min(SPECS)
def first(url):return ("a"*64,"b"*64,200)
def filled():
    d=blank()
    for r in d["rows"].values():r.update(checked=STAMP,success=STAMP,status="baseline",raw_sha="a"*64,text_sha="b"*64,first_text_sha="b"*64,text_chars=200)
    return d
class CorporateTests(unittest.TestCase):
    def test_hash(self):
        text="Production and results "*10
        a=fingerprints(("<p>"+text+"</p><script>1</script>").encode(),"utf-8")
        b=fingerprints(("<div>"+text+"</div><script>2</script>").encode(),"utf-8")
        self.assertNotEqual(a[0],b[0]);self.assertEqual(a[1],b[1])
    def test_baseline(self):
        d=advance(blank(),STAMP,True,first)
        self.assertEqual(d["rows"][KEY]["status"],"baseline");self.assertFalse(d["rows"][KEY]["review"])
        self.assertEqual(sum(r["success"] is not None for r in d["rows"].values()),1)
    def test_sticky_review(self):
        d=advance(filled(),"2026-12-12T15:00:00+00:00",True,lambda u:("c"*64,"d"*64,201))
        self.assertTrue(d["rows"][KEY]["review"])
        for r in d["rows"].values():r["checked"]="2026-12-12T15:00:00+00:00"
        d=advance(d,"2026-12-27T15:00:00+00:00",True,lambda u:("c"*64,"d"*64,201))
        self.assertEqual(d["rows"][KEY]["status"],"unchanged");self.assertTrue(d["rows"][KEY]["review"])
    def test_markup(self):
        d=advance(filled(),"2026-12-12T15:00:00+00:00",True,lambda u:("c"*64,"b"*64,200))
        self.assertEqual(d["rows"][KEY]["status"],"markup_only");self.assertFalse(d["rows"][KEY]["review"])
    def test_failure_retains(self):
        def fail(u):raise Blocked("not allowed")
        d=advance(filled(),"2026-12-12T15:00:00+00:00",True,fail)
        self.assertEqual(d["rows"][KEY]["status"],"blocked");self.assertEqual(d["rows"][KEY]["text_sha"],"b"*64)
    def test_offline(self):
        d=advance(blank(),STAMP,False,lambda u:self.fail("network"))
        self.assertTrue(all(r["checked"] is None for r in d["rows"].values()))
    def test_not_due(self):
        d=advance(filled(),"2026-11-28T15:00:00+00:00",True,lambda u:self.fail("network"))
        self.assertTrue(all(r["checked"]==STAMP for r in d["rows"].values()))
if __name__=="__main__":unittest.main()
