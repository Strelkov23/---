import unittest
import method_passports as m
class MethodTests(unittest.TestCase):
    def row(self,g,c,**kw):
        return dict(group=g,code=c,title="Показатель",source="https://example.org",note="",**kw)
    def test_known_and_unknown(self):
        a=m.describe(self.row("wdi","SL.UEM.TOTL.ZS"))
        self.assertEqual(a["method_level"],"explained")
        self.assertIn("рабочая сила",a["method_formula"])
        b=m.describe(self.row("wdi","UNKNOWN"))
        self.assertEqual(b["method_level"],"source")
        self.assertIn("не пересчитывает",b["method_formula"])
    def test_different_concepts(self):
        a=m.describe(self.row("capital","C.wear_pct"))
        b=m.describe(self.row("capacity","tractors.utilization_pct"))
        self.assertNotEqual(a["method_formula"],b["method_formula"])
        self.assertIn("не факт",m.describe(self.row("forecast","x"))["measurement_kind"])
        self.assertIn("не фактическое",m.describe(self.row("national","CPI_TARGET"))["measurement_kind"])
    def test_links(self):
        x=m.links("<h1>Тест</h1><p>Текст</p>","scenario.html")
        self.assertIn("global-plan-method",x)
        self.assertEqual(m.links("test","unknown.html"),"test")
