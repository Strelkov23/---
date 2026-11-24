import unittest,sqlite3
from unittest.mock import patch
import electricity as e
class ElectricityTests(unittest.TestCase):
    def test_seed(self):
        self.assertEqual(len(e.seed()),6)
        self.assertEqual(e.seed()[3]["values"]["generation"],1182.4)
    def test_parse(self):
        s='<p>На 1 января 2026 года общая установленная мощность электростанций энергосистемы России составила 270,3 тыс. МВт, в том числе ЕЭС России – 264,9 тыс.МВт, ТИТЭС – 5,5 тыс. МВт.</p><p>В 2025 году электростанции энергосистемы России выработали 1 182,4 млрд кВт∙ч, в том числе в ЕЭС России - 1 166,5 млрд кВт∙ч, в ТИТЭС – 16,0 млрд кВт∙ч.</p><p>Потребление электроэнергии в энергосистеме России в 2025 году составило 1 177,3 млрд кВт∙ч, в том числе в ЕЭС России – 1 161,3 млрд кВт∙ч, в ТИТЭС – 16,0 млрд кВт∙ч.</p>'
        self.assertEqual(e.parse(s,2025)[0]["values"],e.seed()[3]["values"])
        with self.assertRaises(ValueError):e.parse(s.replace("1 182,4","1 180,4"),2025)
        with self.assertRaises(ValueError):e.parse(s,2024)
    def test_cache(self):
        with sqlite3.connect(":memory:") as db:
            with patch("electricity.fetch",side_effect=lambda y:[dict(r,mode="direct") for r in e.seed() if r["year"]==y]):
                d=e.sync(db,"2026-11-24T00:00:00+00:00",True)
                self.assertEqual(len(d["checks"]),2)
            with patch("electricity.fetch",side_effect=OSError("unavailable")):
                d=e.sync(db,"2026-12-10T00:00:00+00:00",True)
                self.assertTrue(all(r["mode"]=="direct" for r in d["rows"]))
                self.assertTrue(all("Ошибка" in c["status"] for c in d["checks"]))
