import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import source_acceptance as a

class AcceptanceTests(unittest.TestCase):
    def test_isolated_report_and_failure(self):
        prior=dict(year=2025,url="https://data.nalog.ru/ind2025.xlsx",success="2026-11-24",rows=[{"code":"x","metric":"sales","sign":"numeric"}])
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            (root/"finance-workbooks.json").write_text(json.dumps({"years":[prior]}))
            (root/"catalog.json").write_text(json.dumps({"NY.GDP.MKTP.KD.ZG":{}}))
            with patch("series.retrieve",return_value=("NY.GDP.MKTP.KD.ZG",{"2024":1.0},None,"")),patch("wdi_metadata.collect",return_value={"NY.GDP.MKTP.KD.ZG":{}}),patch("finance_workbooks.fetch",side_effect=ValueError("private body")):
                d=a.probe(root)
            self.assertEqual([r["status"] for r in d["results"]],["accepted","accepted","failed"])
            self.assertNotIn("private body",json.dumps(d))
            self.assertEqual(len(list(root.iterdir())),2)
    def test_workbook_rejects_lost_positions(self):
        prior=dict(year=2025,url="https://data.nalog.ru/ind2025.xlsx",rows=[{"code":"x","metric":"sales","sign":"numeric"}])
        with patch("finance_workbooks.parse",return_value=[{"code":"y","metric":"sales","sign":"numeric"}]):
            with self.assertRaises(ValueError):a.finance_validate(prior,b"data")
