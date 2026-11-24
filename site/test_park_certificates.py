import unittest,csv,tempfile
from pathlib import Path
import park_certificates as c
def row(number="56 АИП",period="с 01.04.2022 по 31.03.2027"):
    cells=[number,'<a class="link" href="/catalog/test/">Парк</a>',"Московская область",period,"СК-24"]
    return '<div class="certification-table__row">'+''.join('<div class="certification-table__td"><span class="certification-table__label">Метка:</span>'+s+'</div>' for s in cells)+'</div>'
class CertificateTests(unittest.TestCase):
    def test_original_format(self):
        rows=c.parse((row()+row("№ 57 АИП","с 01.01.2020 по 31.12.2025")).encode())
        self.assertEqual(rows[0]["number"],"56")
        self.assertEqual(rows[0]["url"],"https://indparks.ru/catalog/test/")
        d={**c.empty("2026-11-25"),"rows":rows,"sha256":"a"*64,"success":"2026-11-25","status":"ok"}
        self.assertEqual(c.quality(d),{"park_certificate_records":2,"park_certificate_in_date_range":1,"park_certificate_expired":1,"park_certificate_future":0})
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/"cert.csv"
            with p.open("w",encoding="utf-8-sig",newline="") as f:
                w=csv.DictWriter(f,fieldnames=c.FIELDS);w.writeheader();w.writerows(rows)
            c.verify_csv(p,d)
            with p.open("a",encoding="utf-8") as f:f.write("extra\n")
            with self.assertRaises(ValueError):c.verify_csv(p,d)
    def test_invalid(self):
        for raw in [row()+row(),row("unknown"),row(period="с 31.03.2027 по 01.04.2022"),row(period="2022"),row(period="с 31.02.2022 по 31.03.2027")]:
            with self.assertRaises(ValueError):c.parse(raw.encode())
