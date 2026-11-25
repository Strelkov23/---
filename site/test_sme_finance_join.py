import unittest,sqlite3,tempfile,json,gzip,hashlib
from pathlib import Path
from unittest.mock import patch
import sme_finance_join as j
import sme_full_import as s
class Join(unittest.TestCase):
    def test_counts_and_nulls(self):
        with tempfile.TemporaryDirectory() as t,sqlite3.connect(":memory:") as db:
            root=Path(t);s.setup(db)
            db.execute("INSERT INTO org VALUES(?,?,?,?,?,?,?,?,?,?)",("7707083893","1027700132195","77","64.19","2014",None,None,"1",1,1))
            rows=[["7707083893","A",None,"9007199254740993",None,0,0,1,None,None],["7704211201","B",None,"1","1",None,0,1,None,None]]
            raw=gzip.compress(json.dumps(rows).encode());(root/"block.gz").write_bytes(raw)
            ix=dict(status="ready",year=2025,count=2,fingerprint="a"*64,sources=[],files={"block.gz":{"bytes":len(raw),"sha256":hashlib.sha256(raw).hexdigest()}})
            (root/j.idx.FILE).write_text(json.dumps(ix))
            r=dict(mode="full",edition="2026-11-10",xml_total=1,xml_processed=1,archive_sha256="b"*64,counts={},reconciliation=dict(period="2026-11-10",rows=[dict(region="77",official=1,imported=1,difference=0)],sha256="c"*64,national_difference=0),declared_matrix=[{"region":"77","class":"64","count":1}],reported_matrix=[{"region":"77","class":"missing_or_other_version","count":1}])
            with patch.object(j.idx,"quality"):
                d=j.join(db,root,r)
            self.assertEqual(d["counts"]["matched_sme"],1)
            self.assertEqual(d["counts"]["not_in_sme"],1)
            self.assertEqual(d["declared"][0]["income_sum"],"9007199254740993")
            self.assertIsNone(d["declared"][0]["expense_sum"])
            self.assertEqual(d["declared"][0]["workers_sum"],"0")
            self.assertEqual(d["reported"][0]["class"],"missing_or_other_version")
