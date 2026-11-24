import unittest
import rosstat_workbooks as w
class TestRosstat(unittest.TestCase):
    def fixture(self,header):
        return [[header],["Вид деятельности",2022,2023,2024]]+[[f"Отрасль {i}",10,20,30] for i in range(12)]
    def test_annual(self):
        h="Степень износа основных фондов по видам экономической деятельности Российской Федерации, в процентах"
        r=w.parse_sheet(self.fixture(h),"capital","Лист","https://rosstat.gov.ru/a.xlsx",2026)
        self.assertEqual(len(r),36);self.assertEqual(r[0]["metric"],"wear")
        self.assertEqual(r[0]["row"],3)
    def test_rejections(self):
        h="Степень износа основных фондов по видам экономической деятельности Российской Федерации, в процентах"
        self.assertEqual(w.parse_sheet(self.fixture(h+" по субъектам"),"capital","Лист","https://rosstat.gov.ru/a.xlsx",2026),[])
        self.assertEqual(w.parse_sheet(self.fixture(h),"capacity","Лист","https://rosstat.gov.ru/a.xlsx",2026),[])
    def test_catalog(self):
        f=[dict(url="https://rosstat.gov.ru/a.xlsx",title="Степень износа основных фондов"),dict(url="https://example.org/a.xlsx",title="Степень износа основных фондов")]
        self.assertEqual(w.candidates("capital",f),f[:1])
