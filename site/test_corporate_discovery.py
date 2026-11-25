import unittest,json,tempfile
from pathlib import Path
import corporate_discovery as c
import group_passports as gp

class Discovery(unittest.TestCase):
    def test_parser(self):
        html='<a href="/financial-releases?report=q3&amp;year=2026">3 квартал</a><a href="/financial-releases?report=q3&amp;year=2026">3 квартал</a><a href="https://bad.example/financial-releases?report=q3&amp;year=2026">Отчет</a><a href="/financial-releases">Архив</a>'
        rows=c.parse("yandex",html)
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["url"],"https://ir.yandex.ru/financial-releases?report=q3&year=2026")
        self.assertEqual(len(c.parse("x5",'<a href="/wp-content/report.pdf">Финансовые результаты 2026</a><a href="/wp-content/forum.pdf">Форум</a>')),1)
        self.assertEqual(len(c.parse("ozon",'<a href="/ru/sth/ozon-finansovye-rezultaty">Финансовые результаты</a><a href="/ru/sth/ozon-kapital-finansovye-rezultaty">Озон Капитал</a>')),1)
        with self.assertRaises(ValueError):c.parse("ozon",'<a href="https://evil.example/ru/sth/financial">Отчетность</a>')
        self.assertEqual(len(c.parse("nornickel",'<a href="/news-and-media/press-releases-and-news/nornikel-finansovye-rezultaty-po-msfo-2025/">Результаты</a><a href="/news-and-media/press-releases-and-news/dividends/">Дивиденды</a>')),1)
        self.assertEqual(len(c.parse("phosagro",'<a href="/upload/ifrs_2025.pdf">МСФО</a><a href="/upload/other.pdf">Прочее</a>')),1)
        self.assertFalse(c.allowed("x5","https://user@www.x5.ru/a.pdf"))
        self.assertFalse(c.allowed("x5","https://www.x5.ru:8443/a.pdf"))
    def test_retention(self):
        data=json.loads(Path(gp.__file__).with_name(gp.FILE).read_text(encoding="utf-8"))
        sources={"x5":'<a href="/wp-content/report.pdf">Финансовые результаты 2026</a>',"yandex":'<a href="/financial-releases?report=q3&amp;year=2026">3 квартал</a>',"ozon":'<a href="/ru/sth/ozon-finansovye-rezultaty">Финансовые результаты</a>',"nornickel":'<a href="/news-and-media/press-releases-and-news/finansovye-rezultaty-msfo/">МСФО</a>',"phosagro":'<a href="/upload/ifrs.pdf">МСФО</a>'}
        calls=[]
        def fetch(group):
            calls.append(group);return c.parse(group,sources[group])
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);(root/gp.FILE).write_text(json.dumps(data),encoding="utf-8")
            d=c.publish(root,root,"2026-11-25T04:00:00+00:00",True,fetch)
            self.assertEqual(c.quality(d,data)["corporate_discovery_candidates"],5)
            d=c.publish(root,root,"2026-11-26T04:00:00+00:00",True,fetch)
            self.assertEqual(len(calls),5)
            first=d["rows"]["x5"]["candidates"][0]["first_seen"]
            d=c.publish(root,root,"2026-12-02T04:00:00+00:00",True,fetch)
            self.assertEqual(d["rows"]["x5"]["candidates"][0]["first_seen"],first)
            def fail(group):raise OSError("offline")
            d=c.publish(root,root,"2026-12-09T04:00:00+00:00",True,fail)
            self.assertEqual(d["rows"]["x5"]["status"],"unavailable")
            self.assertEqual(c.quality(d,data)["corporate_discovery_candidates"],5)

    def test_expand_keeps_old_valid_catalogue(self):
        data=json.loads(Path(gp.__file__).with_name(gp.FILE).read_text(encoding="utf-8"))
        stamp="2026-11-25T04:00:00+00:00"
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/gp.FILE).write_text(json.dumps(data),encoding="utf-8")
            old=c.one("x5",c.blank("x5"),stamp,lambda k:c.parse(k,'<a href="/reports/financial.pdf">Отчет</a>'))
            bad=c.blank("ozon");bad["url"]="https://example.org/"
            (root/c.FILE).write_text(json.dumps(dict(schema=1,note=c.NOTE,rows={"x5":old,"ozon":bad})),encoding="utf-8")
            d=c.publish(root,root,stamp,False)
            self.assertEqual(d["rows"]["x5"],old)
            self.assertEqual(d["rows"]["ozon"],c.blank("ozon"))
            self.assertEqual(d["rows"]["nornickel"],c.blank("nornickel"))
            self.assertEqual(c.quality(d,data)["corporate_discovery_catalogs"],5)
