import io,sqlite3,unittest,zipfile,json,tempfile
from pathlib import Path
from unittest.mock import patch
import sme_full_import as f
from test_sme_classification import fixture
class Full(unittest.TestCase):
    def test_complete(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,"w") as z:z.writestr("a.xml",fixture());z.writestr("b.xml",fixture())
        with sqlite3.connect(":memory:") as db,zipfile.ZipFile(data) as z:
            f.setup(db);r=f.full(db,z,"2026-11-10")
        self.assertEqual(r["unique_legal"],1)
        self.assertEqual(r["counts"]["individual_excluded"],2)
        self.assertEqual(r["counts"]["exact_duplicates"],1)
        self.assertEqual(r["declared_matrix"],[{"region":"77","class":"64","count":1}])
        self.assertEqual(r["reported_matrix"],[{"region":"77","class":"62","count":1}])
    def test_unexpected_member(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,"w") as z:z.writestr("a.xml",fixture());z.writestr("other.txt","x")
        with sqlite3.connect(":memory:") as db,zipfile.ZipFile(data) as z:
            f.setup(db)
            with self.assertRaises(ValueError):f.full(db,z,"2026-11-10")
    def test_quarantine_balance(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,"w") as z:
            z.writestr("a.xml",fixture());z.writestr("b.xml",fixture().replace(b"1027700132195",b"1027700132190"))
        with sqlite3.connect(":memory:") as db,zipfile.ZipFile(data) as z:
            f.setup(db);r=f.full(db,z,"2026-11-10")
        self.assertEqual(r["unique_legal"],1)
        self.assertEqual(r["counts"]["legal"],2)
        self.assertEqual(r["counts"]["quarantined"],1)
        self.assertEqual(r["quarantine"],[{"member":"b.xml","document":1,"reason":"ogrn"}])
        self.assertEqual(sum(x["count"] for x in r["declared_matrix"]),1)

    def test_reference_edition_and_fallback(self):
        rows=[dict(code=str(i).zfill(2),name="R"+str(i),legal=1,individual=2,total=3,workers=4) for i in range(1,81)]
        totals=dict(legal=80,individual=160,total=240,workers=320)
        reference=dict(schema=1,source=f.regional.SOURCE,status="cached",period="2026-11-10",sha256="a"*64,rows=rows,national=totals,regional_sum=totals)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);archived=root/"archive.json"
            archived.write_text(json.dumps(reference),encoding="utf-8")
            with patch.object(f.regional,"publish",side_effect=AssertionError("network not required")):
                self.assertEqual(f.select_reference(root,"2026-11-10",archived),reference)
            def fetch_reference(out,previous,stamp,refresh):
                self.assertEqual(stamp,"2026-12-10T12:00:00Z")
                (out/"sme-regions.json").write_text(json.dumps(dict(reference,period="2026-12-10",sha256="b"*64)),encoding="utf-8")
            with patch.object(f.regional,"publish",side_effect=fetch_reference) as mock:
                self.assertEqual(f.select_reference(root,"2026-12-10",archived)["sha256"],"b"*64)
                mock.assert_called_once()
            def unavailable(out,previous,stamp,refresh):
                (out/"sme-regions.json").write_text(json.dumps(dict(schema=1,source=f.regional.SOURCE,status="unavailable",rows=[])),encoding="utf-8")
            with patch.object(f.regional,"publish",side_effect=unavailable):
                with self.assertRaisesRegex(ValueError,"Нет подтверждённого агрегата"):
                    f.select_reference(root,"2026-12-10",archived)
            with self.assertRaisesRegex(ValueError,"Нет независимой сверки"):
                f.reconcile(dict(edition="2026-11-10"),dict(schema=1,source=f.regional.SOURCE,status="unavailable",rows=[]))
