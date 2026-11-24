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
        self.assertEqual(len(profiles),20)
        ids={r["id"] for r in profiles["manufacturing"]["rows"]}
        self.assertIn("c",ids);self.assertIn("electronics",ids)
        self.assertNotIn("old",ids);self.assertNotIn("subclass",ids)
        self.assertNotIn("NV.IND.EMPL.KD",ids)
        self.assertIn("NV.IND.EMPL.KD",{r["id"] for r in profiles["construction"]["rows"]})

    def test_manufacturing_profiles_and_fns_scope(self):
        import finance_workbooks as f
        c,m,i,n=self.inputs()
        def obs(code,metric,value,year=2025,alias=0):
            return dict(code=f.CROSSWALK[code][alias],metric=metric,year=year,title="Оригинал "+code,value=value,sign="negative_unspecified" if value is None else "numeric",raw="отр" if value is None else str(value),source="https://data.nalog.ru/a.xlsx",sheet="Лист",row=3,column=2)
        workbook=dict(years=[dict(year=2025,rows=[obs("13","sales",0),obs("14","assets",None),obs("20","sales",25.9),obs("21","sales",38.8),obs("27","assets",12.1,alias=1),obs("72","assets",1.9)],checked="2026-11-25",success="2026-11-25",status="Импортировано",sha256="a"*64)])
        profiles={x["id"]:x for x in p.create(c,m,i,n,workbook)}
        self.assertEqual({x["local_code"] for x in profiles["light"]["finance"]},{"13","14"})
        self.assertEqual({x["local_code"] for x in profiles["chemical"]["finance"]},{"20"})
        self.assertEqual({x["local_code"] for x in profiles["pharma"]["finance"]},{"21"})
        self.assertEqual({x["local_code"] for x in profiles["machinery"]["finance"]},{"27"})
        self.assertEqual({x["local_code"] for x in profiles["technology"]["finance"]},{"72"})
        self.assertEqual(profiles["finance"]["finance"],[])
        self.assertEqual(profiles["light"]["finance"][0]["value"],0)
        self.assertIsNone(profiles["light"]["finance"][1]["value"])
        self.assertEqual(profiles["light"]["finance"][1]["sign"],"negative_unspecified")
        self.assertEqual(profiles["chemical"]["finance"][0]["sha256"],"a"*64)
        self.assertEqual({x["id"] for x in profiles["machinery"]["rows"]},{"electronics"})
        workbook["years"][0]["rows"].append(obs("27","assets",12.1))
        with self.assertRaisesRegex(ValueError,"Неоднозначное"):p.finance_rows("machinery",workbook)
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
