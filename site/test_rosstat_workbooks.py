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
    def test_cost(self):
        rows=[["Структура затрат на производство и продажу по видам экономической деятельности Российской Федерации, 2024 год, в процентах, без малых предприятий"],["Вид экономической деятельности","Материальные затраты","Затраты на оплату труда","Страховые взносы","Амортизация","Прочие затраты"]]+[[f"Отрасль {i}",60,20,5,5,10] for i in range(12)]
        r=w.parse_sheet(rows,"cost","Лист","https://rosstat.gov.ru/a.xls",2026)
        self.assertEqual(len(r),60)
        rows[-1][-1]=15
        with self.assertRaises(ValueError):w.parse_sheet(rows,"cost","Лист","https://rosstat.gov.ru/a.xls",2026)
    def test_debt(self):
        rows=[["Задолженность организаций Российской Федерации на конец месяца, млрд руб., без малых предприятий"],["Показатель","31.01.2026","28.02.2026"]]
        for label,v in zip(["Суммарные обязательства","Кредиторская задолженность","Кредиты и займы","Просроченные обязательства","Просроченная кредиторская задолженность","Просроченные кредиты и займы","Дебиторская задолженность","Просроченная дебиторская задолженность"],[100,60,40,5,3,2,80,4]):rows.append([label,v,v])
        r=w.parse_sheet(rows,"debt","Лист","https://rosstat.gov.ru/a.xlsx",2026)
        self.assertEqual(len(r),16)
        self.assertEqual({x["period"] for x in r},{"2026-01","2026-02"})
        rows[2][1]=101
        with self.assertRaises(ValueError):w.parse_sheet(rows,"debt","Лист","https://rosstat.gov.ru/a.xlsx",2026)
        self.assertIsNone(w.month_end("01.02.2026",2026))
    def test_catalog(self):
        f=[dict(url="https://rosstat.gov.ru/a.xlsx",title="Степень износа основных фондов"),dict(url="https://example.org/a.xlsx",title="Степень износа основных фондов")]
        self.assertEqual(w.candidates("capital",f),f[:1])

    def test_observed_capacity_filename_and_scope(self):
        valid=dict(url="https://www.rosstat.gov.ru/storage/mediabank/Urov_motsh_2017-2024.xlsx",title="Urov_motsh_2017-2024.xlsx")
        national=dict(url="https://rosstat.gov.ru/b.xlsx",title="Использование мощности без субъектов малого предпринимательства")
        regional=dict(url="https://rosstat.gov.ru/c.xlsx",title="Использование мощности по субъектам Российской Федерации")
        self.assertEqual(w.candidates("capacity",[valid,national,regional]),[valid,national])
