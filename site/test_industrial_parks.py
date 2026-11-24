import unittest,tempfile,csv
from pathlib import Path
import industrial_parks as p
def fixture(n=100,declared=100,duplicate=False):
    groups=[]
    for i in range(50):
        cards=[]
        for j in range(2):
            name="Park "+str(i)+" "+str(0 if duplicate else j)
            cards.append('<div class="card-accordion"><a class="card-accordion__title" href="/catalog/example/">'+name+'</a><div class="card-accordion__address">IGNORE_ADDRESS</div><div class="card-accordion__feature-title">Гринфилд</div><div class="card-accordion__tooltip">Сертифицирован</div></div>')
        groups.append('<div class="list-catalog__group"><div class="text-heading-3">Регион '+str(i)+'</div>'+''.join(cards)+'</div>')
    return ('<div class="list-catalog-ajax__count">Найдено '+str(declared)+' предложений</div>'+''.join(groups)).encode()
class ParkTests(unittest.TestCase):
    def test_parse(self):
        rows=p.parse(fixture())
        self.assertEqual(len(rows),100)
        self.assertEqual(rows[0]["type"],"Гринфилд")
        self.assertEqual(rows[0]["url"],"https://indparks.ru/catalog/example/")
        self.assertTrue(rows[0]["card_certified"])
        self.assertNotIn("IGNORE_ADDRESS",str(rows))
        self.assertFalse(any(r["ambiguous_name"] for r in rows))
        self.assertTrue(all(r["ambiguous_name"] for r in p.parse(fixture(duplicate=True))))
    def test_reject(self):
        for raw in [fixture(declared=101),fixture().replace(b'card-accordion__title',b'unknown'),fixture().replace(b'list-catalog__group',b'unknown')]:
            with self.assertRaises(ValueError):p.parse(raw)
        self.assertIsNone(p.safe_link("https://example.org/catalog/x/"))
        self.assertIsNone(p.safe_link("javascript:alert(1)"))
    def test_quality_csv(self):
        d={**p.empty("2026-11-25"),"rows":p.parse(fixture()),"sha256":"a"*64,"success":"2026-11-25","status":"ok"}
        self.assertEqual(p.quality(d)["park_catalogue_records"],100)
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"parks.csv"
            with path.open("w",encoding="utf-8-sig",newline="") as f:
                w=csv.DictWriter(f,fieldnames=p.FIELDS);w.writeheader();w.writerows(d["rows"])
            p.verify_csv(path,d)
            with path.open("a",encoding="utf-8") as f:f.write("extra\n")
            with self.assertRaises(ValueError):p.verify_csv(path,d)
        d["rows"][0]["name"]="different"
        with self.assertRaises(ValueError):p.quality(d)
