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

    def test_exclude_non_observational_catalogue_entries(self):
        def f(name,title):return dict(url="https://rosstat.gov.ru/"+name,title=title)
        capacity=f("Urov_motsh.xlsx","Уровень использования среднегодовой производственной мощности")
        nom=f("nom_bm-2025.xlsx","Для разработки статистической информации о балансе производственных мощностей")
        self.assertEqual(w.candidates("capacity",[nom,capacity,capacity]),[capacity])
        debt=f("fin_sost.xlsx","Финансовое состояние организаций")
        tax=f("gos_fin_nalog.xls","Поступление налогов и задолженность по налогам и сборам")
        self.assertEqual(w.candidates("debt",[tax,debt]),[debt])
        stock=f("stock.xlsx","Наличие основных фондов по видам экономической деятельности")
        ownership=f("ownership.xlsx","Наличие основных фондов по формам собственности")
        self.assertEqual(w.candidates("capital",[ownership,stock]),[stock])
    def test_catalogue_freshness(self):
        source=dict(files=[{}],success="2026-11-20T00:00:00+00:00")
        old=("2026-11-25T00:00:00+00:00","2026-11-24T00:00:00+00:00","ok","[]")
        self.assertFalse(w.catalogue_is_newer(source,old))
        self.assertTrue(w.catalogue_is_newer(dict(source,success="2026-11-26T00:00:00+00:00"),old))
        self.assertFalse(w.catalogue_is_newer(dict(source,success=None),None))
        self.assertTrue(w.catalogue_due(old,"2026-11-26",False))
        self.assertFalse(w.catalogue_due(old,"2026-11-26",True))
        self.assertTrue(w.catalogue_due(old,"2026-12-02",True))

    def test_observed_cost_amount_layout(self):
        rows=[[None]*7 for _ in range(34)]
        rows[1][0]="ЗАТРАТЫ НА ПРОИЗВОДСТВО И ПРОДАЖУ ПРОДУКЦИИ (ТОВАРОВ, РАБОТ И УСЛУГ) ОРГАНИЗАЦИЙ (ЮРИДИЧЕСКИХ ЛИЦ) ПО РОССИЙСКОЙ ФЕДЕРАЦИИ В 2025 ГОДУ В РАЗРЕЗЕ ВИДОВ ЭКОНОМИЧЕСКОЙ ДЕЯТЕЛЬНОСТИ1) 2)"
        rows[2][6]="млн.рублей"
        rows[3][1]="Затраты на производство и продажу продукции (товаров, работ, услуг)"
        rows[4][2:7]=["Материальные затраты","Расходы на оплату труда","Страховые взносы в Социальный фонд России (СФР), ФФОМС","Амортизация основных средств","Прочие затраты"]
        rows[12]=["Всего по организациям (юридическим лицам) - млн. рублей",100,60,20,5,5,10]
        rows[13][0]="Из них с основным видом деятельности"
        for i in range(14,32):rows[i]=[f"Отрасль {i}",100,60,20,5,5,10]
        rows[32][0]="1) по организациям без субъектов малого предпринимательства, бюджетных организаций, банков, страховых и прочих финансово-кредитных организаций."
        rows[33][0]="2)без учета статистической информации по Донецкой Народной Республике, Луганской Народной Республике, Запорожской и Херсонской областям."
        url="https://rosstat.gov.ru/a.xls"
        result=w.parse_sheet(rows,"cost","21",url,2026)
        self.assertEqual(len(result),114)
        self.assertEqual({r["unit"] for r in result},{"млн руб."})
        self.assertEqual(result[0]["column"],2)
        self.assertEqual(w.quality(dict(schema=1,files=[dict(url=url,group="cost",success="2026-11-25",sha256="a"*64,rows=result)]))["rosstat_workbook_observations"],114)
        rows[14][3]=None
        self.assertEqual(len(w.parse_sheet(rows,"cost","21",url,2026)),108)
        rows[15][3]=999
        with self.assertRaises(ValueError):w.parse_sheet(rows,"cost","21",url,2026)
        rows[33][0]=""
        self.assertEqual(w.parse_sheet(rows,"cost","21",url,2026),[])
