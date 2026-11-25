import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import sme_profile_public as p
class Publication(unittest.TestCase):
    def test_unavailable_and_stale(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);out=root/"out";old=root/"old";candidate=root/"candidate"
            for d in (out,old,candidate):d.mkdir()
            (candidate/p.p.FILE).write_text(json.dumps({"schema":1,"status":"diagnostic"}))
            with patch.object(p,"install",side_effect=ValueError("Другой год")):
                self.assertEqual(p.publish(out,old,candidate),p.empty())
            self.assertEqual(p.quality(out)["sme_profile_records"],0)
            (out/p.p.DIR).mkdir()
            with self.assertRaises(ValueError):p.quality(out)
    def test_candidate_rejected_previous_used(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);out=root/"out";old=root/"old";candidate=root/"candidate"
            for d in (out,old,candidate):d.mkdir()
            for d in (old,candidate):(d/p.p.FILE).write_text(json.dumps({"schema":1,"status":"diagnostic","id":d.name}))
            def install(source,out,d):
                if source==candidate:raise ValueError("Повреждён")
                (out/p.p.FILE).write_text(json.dumps(d))
            with patch.object(p,"install",side_effect=install) as fake:
                self.assertEqual(p.publish(out,old,candidate)["id"],"old")
                self.assertEqual(fake.call_count,2)
