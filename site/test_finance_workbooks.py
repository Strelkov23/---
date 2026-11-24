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

    def test_reconciliation_mapping(self):
        import finance_data
        manual=finance_data.records()
        self.assertEqual(set(f.CROSSWALK),{r["code"] for r in manual})
        self.assertEqual(len({v for values in f.CROSSWALK.values() for v in values}),62)
        def official(x,code=None,sign=None,value=None):
            return dict(x,code=code or f.CROSSWALK[x["code"]][0],sign=sign or x["sign"],value=x["value"] if value is None else value,source="https://data.nalog.ru/a.xlsx",sheet="Рентабельность",row=1,column=2)
        total=next(x for x in manual if x["code"]=="total" and x["year"]==2025 and x["metric"]=="sales")
        negative=next(x for x in manual if x["code"]=="05" and x["year"]==2025 and x["metric"]=="sales")
        electrical=next(x for x in manual if x["code"]=="27" and x["year"]==2024 and x["metric"]=="sales")
        a=[total,negative,electrical]
        b=[official(total),official(negative),official(electrical,f.CROSSWALK["27"][1])]
        self.assertEqual(f.reconcile(a,[dict(rows=b)])["counts"],{"exact_numeric":2,"same_sign":1})
        self.assertEqual(f.reconcile([negative],[dict(rows=[official(negative,sign="numeric",value=0)])])["counts"],{"different":1})
        self.assertEqual(f.reconcile([negative],[dict(rows=[official(negative,sign="numeric",value=-1)])])["counts"],{"missing":1})
        self.assertEqual(f.reconcile([total],[dict(rows=[official(total,value=0)])])["counts"],{"different":1})
        self.assertEqual(f.reconcile([electrical],[dict(rows=[official(electrical),official(electrical,f.CROSSWALK["27"][1])])])["counts"],{"ambiguous":1})
        self.assertEqual(f.reconcile([total],[])["counts"],{"missing":1})
    def test_reconciliation_reproducible(self):
        import finance_data,tempfile,csv,json
        from pathlib import Path
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)
            f.publish(lambda *args:None,out,dict(schema=1,built="2026-11-25",years=[]))
            d=json.loads((out/"finance-workbooks.json").read_text())
            self.assertEqual(f.quality(d)["finance_reconciliation_missing"],len(finance_data.records()))
            with (out/"finance-reconciliation.csv").open(encoding="utf-8-sig") as file:
                self.assertEqual(len(list(csv.DictReader(file))),366)
            d["reconciliation"]["counts"]["missing"]=0
            with self.assertRaisesRegex(ValueError,"не воспроизводится"):f.quality(d)
