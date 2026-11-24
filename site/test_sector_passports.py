import unittest
import sector_passports as p
import indicators

class SectorTests(unittest.TestCase):
    def inputs(self):
        compare={k:dict(title=m[1],unit=m[2],values={}) for k,m in indicators.META.items()}
        catalog={k:dict(source="https://api.worldbank.org/v2/country/RUS/indicator/"+k,status="Нет данных",success=None) for k in compare}
        def s(code,cl,ident):return dict(id=ident,code=code,classification=cl,title="Тест",kind="Отгрузка",unit="млн руб.",frequency="годовая",source="https://rosstat.gov.ru/example.xlsx",values=[dict(period="2024",value=0)])
        industrial={"series":[s("C","ОКВЭД2","c"),s("26","ОКВЭД2","electronics"),s("26.1","ОКВЭД2","subclass"),s("C","ОКВЭД ред. 1.1","old")],"sources":[]}
        return compare,catalog,industrial,{}
    def test_scope(self):
        profiles={r["id"]:r for r in p.create(*self.inputs())}
        self.assertEqual(len(profiles),14)
        ids={r["id"] for r in profiles["manufacturing"]["rows"]}
        self.assertIn("c",ids);self.assertIn("electronics",ids)
        self.assertNotIn("old",ids);self.assertNotIn("subclass",ids)
        self.assertNotIn("NV.IND.EMPL.KD",ids)
        self.assertIn("NV.IND.EMPL.KD",{r["id"] for r in profiles["construction"]["rows"]})
    def test_missing_and_zero(self):
        c,m,i,n=self.inputs()
        c["NV.AGR.EMPL.KD"]["values"]={"2020":10,"2022":0}
        profiles={r["id"]:r for r in p.create(c,m,i,n)}
        rows={r["id"]:r for r in profiles["agriculture"]["rows"]}
        self.assertEqual(rows["NV.AGR.EMPL.KD"]["value"],0)
        self.assertEqual(rows["NV.AGR.EMPL.KD"]["last"],"2022")
        self.assertEqual(rows["NV.AGR.EMPL.KD"]["count"],2)
        self.assertIsNone(rows["AG.LND.ARBL.ZS"]["value"])
        self.assertEqual(rows["AG.LND.ARBL.ZS"]["count"],0)
if __name__=="__main__":unittest.main()
