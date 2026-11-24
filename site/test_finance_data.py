import unittest
import finance_data as f
class FinanceTests(unittest.TestCase):
    def test_sign_and_totals(self):
        r=f.records();self.assertEqual(len(r),61*3*2)
        a={(x["code"],x["year"],x["metric"]):x for x in r}
        self.assertEqual(a["total",2025,"sales"]["value"],10.9)
        self.assertEqual(a["05",2025,"sales"]["sign"],"negative_unspecified")
        self.assertIsNone(a["05",2025,"sales"]["value"])
        self.assertEqual(a["51",2023,"sales"]["value"],0)
        self.assertEqual(a["29",2025,"sales"]["value"],2.9)
        self.assertEqual(a["C",2024,"assets"]["value"],7.7)

    def test_discovery(self):
        html='<a href="https://data.nalog.ru/files/ind2026.xlsx">Сведения о рентабельности за 2026 год</a><a href="https://evil.example/ind.xlsx">Сведения о рентабельности за 2027 год</a>'
        self.assertEqual(f.discover(html),{2026:"https://data.nalog.ru/files/ind2026.xlsx"})
        with self.assertRaises(ValueError):f.discover("<p>no files</p>")
    def test_source_cache(self):
        import sqlite3
        from unittest.mock import patch
        with sqlite3.connect(":memory:") as db:
            x=f.check_files(db,"2026-11-24T10:00:00+00:00",False)
            self.assertEqual(x["files"],{})
            with patch("finance_data.urlopen",side_effect=OSError("unavailable")) as get:
                x=f.check_files(db,"2026-11-24T10:00:00+00:00",True)
                self.assertIn("Ошибка",x["status"])
                self.assertIsNone(x["success"])
                f.check_files(db,"2026-11-25T10:00:00+00:00",True)
                self.assertEqual(get.call_count,1)
