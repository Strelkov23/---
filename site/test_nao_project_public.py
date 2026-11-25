import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import nao_project_public as p
class Public(unittest.TestCase):
    def test_offline_empty_and_csv(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            d=p.publish(lambda *a:None,root,root,"2026-11-26",False)
            self.assertEqual(d,p.blank())
            self.assertEqual(p.quality(d)["nao_project_records"],0)
            p.verify_csv(root/p.CSV,d)
    def test_failure_retains_archive(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);report={"schema":1,"note":p.NOTE,"groups":{}}
            with patch.object(p.imp,"quality",return_value={"records":167,"cost_numeric":152,"jobs_numeric":0}):
                d=p.sync(root,"2026-11-26T00:00:00+00:00",True,lambda:report)
                (root/p.FILE).write_text(json.dumps(d))
                def fail():raise ValueError("Changed edition")
                cached=p.sync(root,"2026-12-04T00:00:00+00:00",True,fail)
                self.assertEqual(cached["report"],report)
                self.assertEqual(cached["success"],d["success"])
                self.assertEqual(cached["status"],"cached")
