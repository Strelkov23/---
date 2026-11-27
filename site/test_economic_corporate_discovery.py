import unittest
from economic_corporate_discovery import *
STAMP="2026-11-27T15:00:00+00:00"
KEY="novatek"
TITLE="НОВАТЭК сообщил производственные показатели за 2025 год"
URL="https://www.novatek.ru/ru/press/releases/archive/index.php?id_4=7511"
class DiscoveryTests(unittest.TestCase):
    def test_extract(self):
        html=f'<a href="{URL}&amp;from_4=1">{TITLE}</a><a href="{URL}">{TITLE}</a>'
        rows=parse(KEY,html.encode(),"utf-8",STAMP)
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]["url"],URL)
    def test_reject(self):
        for url in ("https://example.org/a","javascript:alert(1)",URL+"&redirect=evil",URL+"&id_4=12"):
            self.assertIsNone(candidate(KEY,url,TITLE,STAMP))
    def test_future(self):
        self.assertIsNone(candidate(KEY,URL,TITLE.replace("2025","2027"),STAMP))
    def test_rosatom(self):
        self.assertIsNotNone(candidate("rosatom","/1684.html","Ключевые результаты 2025",STAMP))
    def test_preserve(self):
        def loader(k,s):return [candidate(k,URL,TITLE,s)]
        d=advance(blank(),STAMP,True,loader)
        self.assertTrue(d["rows"][URL]["initial"])
        def fail(k,s):raise Blocked("blocked")
        d=advance(d,"2026-12-05T15:00:00+00:00",True,fail)
        self.assertIn(URL,d["rows"])
    def test_offline(self):
        d=advance(blank(),STAMP,False,lambda k,s:self.fail("network"))
        self.assertEqual(d["rows"],{})
    def test_empty(self):
        with self.assertRaises(ValueError):parse(KEY,b"<html>empty</html>","utf-8",STAMP)
if __name__=="__main__":unittest.main()
