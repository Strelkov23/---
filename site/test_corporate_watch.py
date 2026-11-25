import copy,json,tempfile,unittest
from pathlib import Path
import corporate_watch as w
import group_passports as gp

class Watch(unittest.TestCase):
    def test_metadata(self):
        self.assertEqual(w.metadata({"ETag":'"abc"',"Last-Modified":"Wed, 25 Nov 2026 10:00:00 GMT","Content-Length":"10"}),{"etag":'"abc"',"last_modified":"Wed, 25 Nov 2026 10:00:00 GMT","length":"10"})
        self.assertEqual(w.metadata({"ETag":"a\nb","Content-Length":"-1"}),{})
        self.assertFalse(w.url_ok("https://example.org/report.pdf"))
        self.assertFalse(w.url_ok("https://user@www.x5.ru/a"))
        self.assertFalse(w.url_ok("https://www.x5.ru:8443/a"))

    def test_state_and_budget(self):
        data=json.loads(Path(gp.__file__).with_name(gp.FILE).read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);old=root/"old";out=root/"out";old.mkdir();out.mkdir()
            def write(folder,value):
                (folder/gp.FILE).write_text(json.dumps(value),encoding="utf-8")
            def archive():
                for name in (gp.FILE,w.FILE):(old/name).write_bytes((out/name).read_bytes())
            write(out,data)
            calls=[]
            def fetch(url):
                calls.append(url)
                return {"etag":"A","length":"5"}
            d=w.publish(out,old,"2026-11-25T04:00:00+00:00",True,fetch)
            self.assertEqual(len(calls),w.LIMIT)
            self.assertEqual(w.quality(d,data)["corporate_watch_checked"],w.LIMIT)
            archive()
            d=w.publish(out,old,"2026-11-25T08:00:00+00:00",True,fetch)
            self.assertEqual(len(calls),w.LIMIT)
            first=next(k for k,r in d["rows"].items() if r["baseline"])
            original=d["rows"][first]
            changed=w.one(original,"2026-12-02T04:00:00+00:00",lambda url:{"etag":"B"})
            self.assertTrue(changed["changed"])
            self.assertEqual(changed["status"],"changed")
            recovered=w.one(changed,"2026-12-09T04:00:00+00:00",lambda url:{"etag":"A"})
            self.assertTrue(recovered["changed"])
            def fail(url):raise OSError("offline")
            broken=w.one(recovered,"2026-12-10T04:00:00+00:00",fail)
            self.assertEqual(broken["status"],"unavailable")
            self.assertEqual(broken["success"],recovered["success"])
            self.assertEqual(broken["baseline"],original["baseline"])
            self.assertTrue(broken["changed"])
            absent=w.one(original,"2026-12-02T04:00:00+00:00",lambda url:{})
            self.assertEqual(absent["status"],"no_metadata")
            self.assertEqual(absent["baseline"],original["baseline"])
            d["rows"][first]=broken
            (out/w.FILE).write_text(json.dumps(d),encoding="utf-8");archive()
            new=copy.deepcopy(data)
            next(g for g in new["groups"] if g["id"]==original["group"])["role"]+="; уточнение"
            write(out,new)
            d=w.publish(out,old,"2026-12-11T04:00:00+00:00",False,fetch)
            self.assertEqual(d["rows"][first]["status"],"waiting")
            self.assertFalse(d["rows"][first]["changed"])
