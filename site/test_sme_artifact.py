import copy,json,tempfile,unittest
from pathlib import Path
import sme_artifact as s

class ArtifactTest(unittest.TestCase):
    def test_consistency(self):
        a=dict(mode="full",xml_total=2,xml_processed=2,edition="2026-11-10",archive_sha256="a"*64,counts={"quarantined":1},reconciliation=dict(period="2026-11-10",sha256="b"*64,national_difference=5))
        b=dict(schema=1,status="diagnostic",sme_edition=a["edition"],sme_archive_sha256=a["archive_sha256"],reference_sha256="b"*64,financial_fingerprint="c"*64,national_difference=5,quarantined=1,declared=[{}],reported=[{}])
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            def put(x,y):
                (root/"classification.json").write_text(json.dumps(x))
                (root/"finance-join.json").write_text(json.dumps(y))
            put(a,b);self.assertEqual(s.inspect(root),("2026-11-10",0))
            rich=dict(b,paired_sums_version=1,profiles={"rows":[]})
            put(a,rich);self.assertEqual(s.inspect(root),("2026-11-10",2))
            for field,value in (("sme_edition","2026-10-10"),("sme_archive_sha256","d"*64),("reference_sha256","d"*64),("national_difference",0),("quarantined",0),("financial_fingerprint","bad"),("reported",[])):
                put(a,{**b,field:value})
                with self.subTest(field=field),self.assertRaises(ValueError):s.inspect(root)
            put(dict(a,xml_processed=1),b)
            with self.assertRaises(ValueError):s.inspect(root)
            (root/"finance-join.json").unlink()
            with self.assertRaises(ValueError):s.inspect(root)
