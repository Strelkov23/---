import unittest
import amur_enterprises as a
def fixture():
    return ("<html>"+"".join(f'<h6>ООО «Фирма {i}»</h6><p>Производство мебели</p><p>Н.п.: город</p><p>Сайт: нет</p><p>Email: test@example.com</p><button>Смотреть карточку</button>' for i in range(21))+'<h6>ИП Иванов</h6><p>Н.п.: город</p><p>Сайт: нет</p><button>Смотреть карточку</button></html>').encode()
class Test(unittest.TestCase):
    def test_parse(self):
        rows,n=a.parse(fixture());self.assertEqual(len(rows),21);self.assertEqual(n,22)
        self.assertTrue(all(r["category"]=="Производство мебели" and r["locality"]=="город" for r in rows))
        self.assertNotIn("test@example.com",str(rows))
    def test_short(self):
        with self.assertRaises(ValueError):a.parse(b"<h6>empty</h6>")

    def test_cache_and_retry(self):
        import tempfile,json
        from pathlib import Path
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);out=root/"out";prev=root/"prev";out.mkdir();prev.mkdir()
            d=a.publish(out,prev,"2026-11-25",True,lambda:(fixture(),"utf-8"))
            self.assertEqual(d["status"],"ok");self.assertEqual(len(d["rows"]),21)
            (prev/a.FILE).write_bytes((out/a.FILE).read_bytes())
            def fail():raise OSError("unavailable")
            d=a.publish(out,prev,"2026-12-02",True,fail)
            self.assertEqual(d["status"],"cached");self.assertEqual(len(d["rows"]),21)
            self.assertEqual(d["success"],"2026-11-25");self.assertEqual(d["checked"],"2026-12-02")
            bad=json.loads(json.dumps(d));bad["rows"][0]["name"]="ООО Changed"
            with self.assertRaises(ValueError):a.quality(bad)
