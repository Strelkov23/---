import unittest
import finance_workbooks as f
class TestWorkbook(unittest.TestCase):
    def test_sheet(self):
        rows=[["2025 год"],["Вид экономической деятельности","Рентабельность проданных товаров","Рентабельность активов"],["Всего",10,5]]+[[f"Отрасль {i}",0,"отр"] for i in range(20)]
        r=f.parse_sheet(rows,2025,"Лист","https://data.nalog.ru/a.xlsx")
        self.assertEqual(len(r),42)
        self.assertEqual(r[-1]["sign"],"negative_unspecified")
        self.assertIsNone(r[-1]["value"])
        self.assertEqual(r[-2]["value"],0)
        self.assertEqual(f.parse_sheet(rows,2024,"Лист","https://data.nalog.ru/a.xlsx"),[])
    def test_urls(self):
        self.assertFalse(f.valid_url("https://example.org/a.xlsx"))
        self.assertTrue(f.valid_url("https://data.nalog.ru/a.xls"))
