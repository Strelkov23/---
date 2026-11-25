import unittest,tempfile,sqlite3,json,gzip,hashlib
from pathlib import Path
from unittest.mock import patch
import sme_profile_index as p
import sme_full_import as s
import company_index as ci
class Profiles(unittest.TestCase):
    def test_build_and_integrity(self):
        with tempfile.TemporaryDirectory() as tmp,sqlite3.connect(":memory:") as db:
            root=Path(tmp);financial=root/"financial";financial.mkdir();(financial/"company-index").mkdir();out=root/"out"
            s.setup(db)
            db.execute("INSERT INTO members VALUES(?,?,?,?)",(1,"sample.xml","d"*64,2))
            db.execute("INSERT INTO org VALUES(?,?,?,?,?,?,?,?,?,?)",("7707083893","1027700132195","77","64.19","2014",None,None,"1",1,1))
            db.execute("INSERT INTO org VALUES(?,?,?,?,?,?,?,?,?,?)",("7704211201","1027700132195","99",None,None,None,None,"1",1,2))
            ids=["7707083893","7704211201"];files={}
            for i in range(ci.BUCKETS):
                name=ci.filename(i);rows=[[inn] for inn in sorted(ids) if ci.bucket(inn)==i];raw=gzip.compress(json.dumps(rows).encode())
                (financial/name).write_bytes(raw);files[name]=dict(count=len(rows),bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
            ix=dict(status="ready",year=2025,fingerprint="a"*64,files=files);(financial/ci.FILE).write_text(json.dumps(ix))
            linked=dict(status="diagnostic",financial_year=2025,financial_fingerprint="a"*64,sme_edition="2026-11-10",sme_archive_sha256="b"*64,reference_sha256="c"*64,counts={"included":1},declared=[{"region":"77","matched":1}])
            report=dict(mode="full",xml_total=1,xml_processed=1,edition="2026-11-10",archive_sha256="b"*64,reconciliation=dict(sha256="c"*64,rows=[{"region":"77","difference":0,"official":1},{"region":"99","difference":1,"official":1}]))
            with patch.object(ci,"quality"):d=p.create(db,financial,report,linked,out)
            self.assertEqual(d["count"],1)
            self.assertEqual(p.quality(d,out,ix,linked,deep=True,financial_root=financial)["profiles"],1)
            name=p.filename(ci.bucket(ids[0]));rows=p.unpack((out/name).read_bytes());self.assertEqual(rows[0][2],"77")
            self.assertEqual(len(rows[0]),9)
            with self.assertRaises(ValueError):p.quality(d,out,dict(ix,fingerprint="f"*64),linked)
            (out/name).write_bytes(b"changed")
            with self.assertRaises(ValueError):p.quality(d,out,ix,linked)
    def test_row_rejects_unverified_coordinates(self):
        row=["7707083893","1027700132195","77","64.19","2014",None,None,0,2]
        with self.assertRaises(ValueError):p.validate_row(row,[{"documents":1}],{"77"})
        row[-1]=1;row[4]="2020"
        with self.assertRaises(ValueError):p.validate_row(row,[{"documents":1}],{"77"})
